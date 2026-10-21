import * as cheerio from 'cheerio'
import crypto from 'crypto'
import { fetchPage, fetchResource } from './fetcher'
import { analyzeSite } from './analyzer'
import {
  ASSET_BUDGET,
  type AssetType,
  type CloneOptions,
  type CloneResult,
  type DownloadedAsset,
} from './types'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function sha1(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 12)
}

const SAFE_URL_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'avif', 'bmp', 'css', 'js', 'mjs',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'json', 'mp4', 'webm', 'mp3', 'wav', 'ogg', 'pdf',
])

const CT_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico',
  'image/avif': 'avif', 'image/bmp': 'bmp', 'text/css': 'css',
  'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf', 'font/otf': 'otf',
  'application/font-woff': 'woff', 'application/font-woff2': 'woff2',
  'application/x-font-ttf': 'ttf', 'application/x-font-woff': 'woff',
  'application/javascript': 'js', 'text/javascript': 'js', 'application/x-javascript': 'js',
  'application/json': 'json', 'video/mp4': 'mp4', 'video/webm': 'webm',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
}

function pickExt(url: string, contentType: string): string {
  try {
    const pathname = new URL(url).pathname
    if (pathname.includes('.')) {
      const ext = pathname.split('.').pop()?.toLowerCase() ?? ''
      if (ext && SAFE_URL_EXTS.has(ext)) return ext
    }
  } catch { /* ignore */ }
  const ct = contentType.split(';')[0].trim().toLowerCase()
  return CT_EXT[ct] ?? 'bin'
}

function guessTypeFromUrl(url: string): AssetType {
  const ext = pickExt(url, '')
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'avif', 'bmp'].includes(ext)) return 'image'
  if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) return 'font'
  if (['mp4', 'webm', 'mp3', 'wav', 'ogg'].includes(ext)) return 'media'
  return 'other'
}

function toDataUri(asset: DownloadedAsset): string {
  return `data:${asset.contentType.split(';')[0] || 'application/octet-stream'};base64,${asset.buffer.toString('base64')}`
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx])
    }
  })
  await Promise.all(workers)
}

function absolutize(base: string, ref: string | undefined): string | null {
  if (!ref) return null
  const refTrim = ref.trim()
  if (!refTrim || refTrim.startsWith('data:') || refTrim.startsWith('#') ||
      refTrim.startsWith('javascript:') || refTrim.startsWith('mailto:') || refTrim.startsWith('tel:')) {
    return null
  }
  try {
    return new URL(refTrim, base).toString()
  } catch {
    return null
  }
}

function isStylesheetLink($el: cheerio.Cheerio<never>): boolean {
  const rel = (($el.attr('rel') ?? '') as string).toLowerCase()
  return rel.split(/\s+/).includes('stylesheet')
}

function isIconLink($el: cheerio.Cheerio<never>): boolean {
  const rel = (($el.attr('rel') ?? '') as string).toLowerCase()
  return rel.includes('icon')
}

// ---------------------------------------------------------------------------
// asset store
// ---------------------------------------------------------------------------

interface PendingTask { url: string; type: AssetType }

class AssetStore {
  private cache = new Map<string, Promise<DownloadedAsset | null>>()
  readonly downloaded = new Map<string, DownloadedAsset>()
  totalBytes = 0
  truncated = false

  get(url: string, type: AssetType, referer: string): Promise<DownloadedAsset | null> {
    const hit = this.cache.get(url)
    if (hit) return hit
    const p = this.download(url, referer).catch(() => null)
    this.cache.set(url, p)
    return p
  }

  private async download(url: string, referer: string): Promise<DownloadedAsset | null> {
    if (this.downloaded.size >= ASSET_BUDGET.maxAssets) { this.truncated = true; return null }
    if (this.totalBytes >= ASSET_BUDGET.maxTotalBytes) { this.truncated = true; return null }
    const res = await fetchResource(url, {
      maxBytes: ASSET_BUDGET.maxAssetBytes,
      referer,
      accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    })
    if (!res.ok || !res.body || res.body.length === 0) return null
    // reject likely-truncated payloads (buffer was capped at maxAssetBytes)
    if (res.body.length >= ASSET_BUDGET.maxAssetBytes) return null
    const asset: DownloadedAsset = {
      url,
      buffer: res.body,
      contentType: res.contentType,
      ext: pickExt(url, res.contentType),
      hash: sha1(url),
      size: res.body.length,
    }
    this.downloaded.set(url, asset)
    this.totalBytes += asset.size
    return asset
  }
}

// ---------------------------------------------------------------------------
// CSS processing
// ---------------------------------------------------------------------------

const CSS_TEXT_CAP = 500_000
const MAX_IMPORT_DEPTH = 3

/**
 * Absolutize every url(...) ref in a css text against its source URL and
 * enqueue the referenced assets for download.
 */
function absolutizeCssRefs(
  cssText: string,
  baseUrl: string,
  store: AssetStore,
  referer: string
): string {
  const refs: string[] = []
  const out = cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, _q, raw: string) => {
    const abs = absolutize(baseUrl, raw)
    if (!abs) return full
    refs.push(abs)
    return `url("${abs}")`
  })
  void Promise.all(refs.map((u) => store.get(u, guessTypeFromUrl(u), referer))).catch(() => null)
  return out
}

async function loadCss(url: string, depth: number, store: AssetStore, referer: string): Promise<{ text: string; size: number } | null> {
  const res = await fetchResource(url, { referer, accept: 'text/css,*/*;q=0.1' })
  if (!res.ok || !res.body) return null
  let text = res.body.toString('utf8').slice(0, CSS_TEXT_CAP)

  // inline @import rules (resolve recursively)
  if (depth < MAX_IMPORT_DEPTH) {
    const importMatches = [...text.matchAll(/@import\s+(?:url\(\s*['"]?([^'")]+?)['"]?\s*\)|(['"])([^'"]+?)\2)([^;]*);/gi)]
    await Promise.all(importMatches.map(async (m) => {
      const raw = m[1] ?? m[3]
      const abs = absolutize(url, raw)
      if (!abs) return
      const imported = await loadCss(abs, depth + 1, store, referer)
      text = text.replace(m[0], imported
        ? `/* inlined import: ${abs} */\n${imported.text}`
        : `/* import skipped: ${abs} */`)
    }))
  } else {
    text = text.replace(/@import[^;]+;/gi, '/* import depth limit */')
  }

  return { text: absolutizeCssRefs(text, url, store, referer), size: res.body.length }
}

// ---------------------------------------------------------------------------
// materialization
// ---------------------------------------------------------------------------

type UrlMapper = (absUrl: string) => string

function rewriteCssUrls(cssText: string, map: UrlMapper): string {
  return cssText.replace(/url\(\s*(['"]?)(https?:\/\/[^'")]+)\1\s*\)/gi, (full, _q, abs: string) => {
    const mapped = map(abs)
    return mapped === abs ? full : `url("${mapped}")`
  })
}

function rewriteSrcset(srcset: string, map: UrlMapper, base: string): string {
  return srcset
    .split(',')
    .map((part) => {
      const trimmed = part.trim()
      if (!trimmed) return ''
      const [rawUrl, ...descriptors] = trimmed.split(/\s+/)
      const abs = absolutize(base, rawUrl)
      const mapped = abs ? map(abs) : rawUrl
      return [mapped, ...descriptors].join(' ')
    })
    .filter(Boolean)
    .join(', ')
}

const STRIP_LINK_RELS = new Set(['manifest', 'preconnect', 'dns-prefetch', 'prefetch', 'preload', 'modulepreload'])

function preclean($d: cheerio.CheerioAPI): void {
  $d('meta[http-equiv]').each((_, el) => {
    const equiv = ($d(el).attr('http-equiv') ?? '').toLowerCase()
    if (equiv === 'content-security-policy' || equiv === 'refresh') $d(el).remove()
  })
  $d('base').remove()
  $d('link[rel]').each((_, el) => {
    const rel = ($d(el).attr('rel') ?? '').toLowerCase()
    if (STRIP_LINK_RELS.has(rel)) $d(el).remove()
  })
  $d('[integrity]').removeAttr('integrity')
  $d('[crossorigin]').removeAttr('crossorigin')
}

// ---------------------------------------------------------------------------
// main pipeline
// ---------------------------------------------------------------------------

export async function cloneSite(opts: CloneOptions): Promise<CloneResult> {
  const startedAt = Date.now()
  const page = await fetchPage(opts.url)
  if (!page.ok || !page.body) {
    throw new Error(page.error
      ? `Could not reach the site: ${page.error}`
      : `The site responded with HTTP ${page.status}. Cloning failed.`)
  }
  const contentType = page.contentType.toLowerCase()
  if (contentType.includes('json')) {
    throw new Error('The URL returned JSON, not an HTML page. Try a regular web page URL.')
  }

  const finalUrl = page.url
  const originalHtml = page.body.toString('utf8')
  const originalBytes = page.body.length
  const $ = cheerio.load(originalHtml)
  const referer = finalUrl

  preclean($)

  // ---- collect element-level assets --------------------------------------
  const store = new AssetStore()
  const cssUrls: string[] = []
  const elementTasks: PendingTask[] = []

  const enqueue = (abs: string | null, type: AssetType) => {
    if (abs) elementTasks.push({ url: abs, type })
  }

  $('link[href]').each((_, el) => {
    const $el = $(el) as unknown as cheerio.Cheerio<never>
    if (isStylesheetLink($el)) {
      const abs = absolutize(finalUrl, ($el.attr('href') as string) ?? '')
      if (abs && !cssUrls.includes(abs)) cssUrls.push(abs)
    } else if (isIconLink($el)) {
      enqueue(absolutize(finalUrl, ($el.attr('href') as string) ?? ''), 'icon')
    }
  })

  $('img').each((_, el) => {
    const $el = $(el)
    for (const key of ['src', 'data-src', 'data-original', 'data-lazy-src']) {
      enqueue(absolutize(finalUrl, $el.attr(key)), 'image')
    }
    for (const key of ['srcset', 'data-srcset']) {
      const value = $el.attr(key)
      if (!value) continue
      for (const part of value.split(',')) {
        enqueue(absolutize(finalUrl, part.trim().split(/\s+/)[0]), 'image')
      }
    }
  })

  $('picture source, video source, audio source').each((_, el) => {
    const $el = $(el)
    const srcset = $el.attr('srcset')
    if (srcset) {
      for (const part of srcset.split(',')) {
        enqueue(absolutize(finalUrl, part.trim().split(/\s+/)[0]), 'image')
      }
    }
    enqueue(absolutize(finalUrl, $el.attr('src')), guessTypeFromUrl(absolutize(finalUrl, $el.attr('src')) ?? ''))
  })

  $('video, audio').each((_, el) => {
    const $el = $(el)
    for (const key of ['src', 'poster']) {
      enqueue(absolutize(finalUrl, $el.attr(key)), guessTypeFromUrl(absolutize(finalUrl, $el.attr(key)) ?? ''))
    }
  })

  // ---- fetch linked stylesheets ------------------------------------------
  const cssResults = new Map<string, { text: string; size: number } | null>()
  await Promise.all(cssUrls.map(async (u) => {
    cssResults.set(u, await loadCss(u, 0, store, referer))
  }))

  // ---- process inline <style> blocks & style attributes (enqueue refs) ---
  $('style').each((_, el) => {
    const text = $(el).text()
    if (text.trim()) absolutizeCssRefs(text, finalUrl, store, referer)
  })
  $('[style*="url("]').each((_, el) => {
    const style = $(el).attr('style')
    if (style) absolutizeCssRefs(style, finalUrl, store, referer)
  })

  // ---- download all element assets ---------------------------------------
  const seen = new Set<string>()
  const tasks = elementTasks.filter((t) => {
    if (seen.has(t.url)) return false
    seen.add(t.url)
    return true
  })
  await runPool(tasks, 8, async (t) => { await store.get(t.url, t.type, referer) })

  // ---- meta extraction ----------------------------------------------------
  const rawTitle = $('title').first().text().trim()
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() ?? ''
  const title = rawTitle || ogTitle || new URL(finalUrl).hostname
  const description = ($('meta[name="description"]').attr('content')
    ?? $('meta[property="og:description"]').attr('content') ?? '').trim()
  const lang = $('html').attr('lang') ?? ''
  const ogImage = absolutize(finalUrl, $('meta[property="og:image"]').attr('content')) ?? ''
  let favicon = ''
  $('link[href]').each((_, el) => {
    const $el = $(el) as unknown as cheerio.Cheerio<never>
    if (favicon || !isIconLink($el)) return
    favicon = absolutize(finalUrl, ($el.attr('href') as string) ?? '') ?? ''
  })
  if (!favicon) {
    try { favicon = new URL('/favicon.ico', finalUrl).toString() } catch { favicon = '' }
  }

  // ---- body text length (before processing) ------------------------------
  const bodyText = $('body').html() ?? ''
  const textLength = bodyText
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length

  // ---- materialize both modes ---------------------------------------------
  const inlineMapper: UrlMapper = (abs) => {
    const asset = store.downloaded.get(abs)
    if (asset && asset.size <= ASSET_BUDGET.inlineCapBytes) return toDataUri(asset)
    return abs
  }
  const mirrorFromRootMapper: UrlMapper = (abs) => {
    const asset = store.downloaded.get(abs)
    return asset ? `assets/${asset.hash}.${asset.ext}` : abs
  }
  const mirrorFromCssMapper: UrlMapper = (abs) => {
    const asset = store.downloaded.get(abs)
    return asset ? `${asset.hash}.${asset.ext}` : abs
  }

  const clonedNote = `<!-- Cloned with CloneForge on ${new Date().toISOString()} from ${finalUrl} -->\n`

  const materialize = (mode: 'single' | 'mirror'): string => {
    const $d = cheerio.load(originalHtml)
    preclean($d)

    const urlMap: UrlMapper = mode === 'single' ? inlineMapper : mirrorFromRootMapper

    // stylesheets
    $d('link[href]').each((_, el) => {
      const $el = $d(el) as unknown as cheerio.Cheerio<never>
      if (!isStylesheetLink($el)) {
        if (isIconLink($el)) {
          const abs = absolutize(finalUrl, ($el.attr('href') as string) ?? '')
          if (abs) $d(el).attr('href', urlMap(abs))
        }
        return
      }
      const abs = absolutize(finalUrl, ($el.attr('href') as string) ?? '')
      const css = abs ? cssResults.get(abs) : undefined
      if (mode === 'single') {
        if (css) {
          const $style = $d('<style></style>')
          $style.attr('data-cloned-from', abs ?? '')
          $style.text(rewriteCssUrls(css.text, inlineMapper))
          $d(el).replaceWith($style)
        } else {
          $d(el).remove()
        }
      } else {
        if (abs && css) {
          $d(el).attr('href', `assets/${sha1(abs)}.css`)
        } else {
          $d(el).remove()
        }
      }
    })

    // inline <style> blocks
    $d('style').each((_, el) => {
      const $el = $d(el)
      const raw = $el.text()
      if (!raw.trim()) return
      const absolutized = absolutizeCssRefs(raw, finalUrl, store, referer)
      $el.text(rewriteCssUrls(absolutized, urlMap))
    })

    // style attributes
    $d('[style]').each((_, el) => {
      const $el = $d(el)
      const style = $el.attr('style')
      if (!style || !style.includes('url(')) return
      $el.attr('style', rewriteCssUrls(absolutizeCssRefs(style, finalUrl, store, referer), urlMap))
    })

    // images
    $d('img').each((_, el) => {
      const $el = $d(el)
      const mapAttr = (name: string) => {
        const abs = absolutize(finalUrl, $el.attr(name))
        if (!abs) return
        $el.attr(name, urlMap(abs))
      }
      if (!$el.attr('src') && $el.attr('data-src')) {
        $el.attr('src', urlMap(absolutize(finalUrl, $el.attr('data-src')) ?? ''))
        $el.removeAttr('data-src')
      } else {
        mapAttr('src')
      }
      for (const key of ['data-original', 'data-lazy-src']) $el.removeAttr(key)
      for (const key of ['srcset', 'data-srcset']) {
        const value = $el.attr(key)
        if (value) $el.attr(key, rewriteSrcset(value, urlMap, finalUrl))
      }
      $el.removeAttr('loading')
    })

    // picture / media sources
    $d('source').each((_, el) => {
      const $el = $d(el)
      const srcset = $el.attr('srcset')
      if (srcset) $el.attr('srcset', rewriteSrcset(srcset, urlMap, finalUrl))
      const src = absolutize(finalUrl, $el.attr('src'))
      if (src) $el.attr('src', urlMap(src))
    })

    // video / audio
    $d('video, audio').each((_, el) => {
      const $el = $d(el)
      for (const key of ['src', 'poster']) {
        const abs = absolutize(finalUrl, $el.attr(key))
        if (abs) $el.attr(key, urlMap(abs))
      }
    })

    // navigation / forms / iframes stay absolute to the live site
    $d('a[href]').each((_, el) => {
      const abs = absolutize(finalUrl, $d(el).attr('href'))
      if (abs) $d(el).attr('href', abs)
    })
    $d('form[action]').each((_, el) => {
      const abs = absolutize(finalUrl, $d(el).attr('action'))
      if (abs) $d(el).attr('action', abs)
    })
    $d('iframe[src]').each((_, el) => {
      const abs = absolutize(finalUrl, $d(el).attr('src'))
      if (abs) $d(el).attr('src', abs)
    })

    // scripts
    $d('script').each((_, el) => {
      const $el = $d(el)
      const type = ($el.attr('type') ?? '').toLowerCase()
      if (type === 'application/ld+json') return // keep structured data
      if (opts.keepScripts) {
        const abs = absolutize(finalUrl, $el.attr('src'))
        if (abs) $el.attr('src', abs)
      } else {
        $el.remove()
      }
    })

    return clonedNote + $d.html()
  }

  const singleHtml = materialize('single')
  const mirrorHtml = materialize('mirror')

  // ---- files for the mirror export ---------------------------------------
  const files = new Map<string, Buffer>()
  files.set('index.html', Buffer.from(mirrorHtml, 'utf8'))
  for (const asset of store.downloaded.values()) {
    files.set(`assets/${asset.hash}.${asset.ext}`, asset.buffer)
  }
  for (const [url, css] of cssResults.entries()) {
    if (!css) continue
    files.set(`assets/${sha1(url)}.css`, Buffer.from(rewriteCssUrls(css.text, mirrorFromCssMapper), 'utf8'))
  }

  // ---- analysis -----------------------------------------------------------
  const cssTextsForAnalysis: string[] = []
  for (const css of cssResults.values()) if (css) cssTextsForAnalysis.push(css.text)
  $('style').each((_, el) => {
    const t = $(el).text()
    if (t) cssTextsForAnalysis.push(t)
  })
  $('[style]').each((_, el) => {
    const t = $(el).attr('style')
    if (t?.includes('url(')) cssTextsForAnalysis.push(t)
  })

  const analysis = analyzeSite(originalHtml, cssTextsForAnalysis, finalUrl, {
    title, description, lang, ogImage, favicon,
  })

  // ---- stats & asset info -------------------------------------------------
  const counts: Record<AssetType, number> = { image: 0, style: 0, script: 0, font: 0, media: 0, icon: 0, other: 0 }
  const domains = new Set<string>([new URL(finalUrl).hostname])
  const assetsInfo = [...store.downloaded.values()]
    .sort((a, b) => b.size - a.size)
    .map((a) => {
      const type = guessTypeFromUrl(a.url)
      counts[type] += 1
      try { domains.add(new URL(a.url).hostname) } catch { /* ignore */ }
      return {
        url: a.url,
        path: `assets/${a.hash}.${a.ext}`,
        type,
        size: a.size,
        ext: a.ext,
        inlined: a.size <= ASSET_BUDGET.inlineCapBytes,
      }
    })
  for (const [url, css] of cssResults.entries()) {
    if (!css) continue
    counts.style += 1
    try { domains.add(new URL(url).hostname) } catch { /* ignore */ }
    assetsInfo.unshift({
      url,
      path: `assets/${sha1(url)}.css`,
      type: 'style',
      size: css.size,
      ext: 'css',
      inlined: false,
    })
  }

  const meta = {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    sourceUrl: opts.url,
    finalUrl,
    title,
    keepScripts: opts.keepScripts,
    createdAt: Date.now(),
    analysis,
    stats: {
      htmlBytes: originalBytes,
      singleBytes: Buffer.byteLength(singleHtml, 'utf8'),
      totalBytes: store.totalBytes + cssTotalBytes() + originalBytes,
      requests: store.downloaded.size + cssResults.size + 1,
      counts,
      domains: [...domains].slice(0, 20),
      textLength,
      durationMs: Date.now() - startedAt,
    },
    assets: assetsInfo,
  }

  function cssTotalBytes(): number {
    let n = 0
    for (const r of cssResults.values()) if (r) n += r.size
    return n
  }

  return { meta, singleHtml, mirrorHtml, files }
}
