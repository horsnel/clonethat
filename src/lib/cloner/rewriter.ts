import * as cheerio from 'cheerio'
import crypto from 'crypto'
import { fetchPage, fetchResource } from './fetcher'
import { analyzeSite } from './analyzer'
import {
  captureInteractionState,
  looksLikeNotFound,
  renderPage,
  type InteractionCandidate,
  type RenderedPage,
} from './renderer'
import {
  ASSET_BUDGET,
  MAX_CRAWL_PAGES,
  MAX_INTERACTION_STATES,
  type AssetType,
  type CloneOptions,
  type ClonePageInfo,
  type CloneResult,
  type DownloadedAsset,
  type PageKind,
  type RenderMode,
} from './types'

// ---------------------------------------------------------------------------
// small helpers
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

function normalizeForMap(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`
  } catch {
    return url
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

const SKIP_HREF_EXTS = /\.(png|jpe?g|gif|webp|svg|ico|avif|bmp|css|js|mjs|pdf|zip|mp[34]|webm|wav|ogg|woff2?|ttf|otf|eot)$/i

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

function absolutizeCssRefs(cssText: string, baseUrl: string, store: AssetStore, referer: string): string {
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
  // neutralize Clonethat's own discovery markers
  $d('[data-clonethat-cta]').removeAttr('data-clonethat-cta')
}

// ---------------------------------------------------------------------------
// per-page source analysis (collect assets + css refs + crawl links)
// ---------------------------------------------------------------------------

interface PageSource {
  url: string
  finalUrl: string
  html: string
  kind: PageKind
  label?: string
  slug: string
  screenshot: Buffer | null
  rendered: boolean
  textLength: number
  title: string
}

interface PageScan {
  cssUrls: string[]
  elementTasks: PendingTask[]
  crawlCandidates: string[]
  bodyTextLength: number
}

function scanPage(source: PageSource, store: AssetStore): PageScan {
  const $ = cheerio.load(source.html)
  preclean($)
  const cssUrls: string[] = []
  const elementTasks: PendingTask[] = []
  const crawlCandidates: string[] = []
  const referer = source.finalUrl

  const enqueue = (abs: string | null, type: AssetType) => {
    if (abs) elementTasks.push({ url: abs, type })
  }

  $('link[href]').each((_, el) => {
    const $el = $(el) as unknown as cheerio.Cheerio<never>
    if (isStylesheetLink($el)) {
      const abs = absolutize(referer, ($el.attr('href') as string) ?? '')
      if (abs && !cssUrls.includes(abs)) cssUrls.push(abs)
    } else if (isIconLink($el)) {
      enqueue(absolutize(referer, ($el.attr('href') as string) ?? ''), 'icon')
    }
  })

  $('img').each((_, el) => {
    const $el = $(el)
    for (const key of ['src', 'data-src', 'data-original', 'data-lazy-src']) {
      enqueue(absolutize(referer, $el.attr(key)), 'image')
    }
    for (const key of ['srcset', 'data-srcset']) {
      const value = $el.attr(key)
      if (!value) continue
      for (const part of value.split(',')) {
        enqueue(absolutize(referer, part.trim().split(/\s+/)[0]), 'image')
      }
    }
  })

  $('picture source, video source, audio source').each((_, el) => {
    const $el = $(el)
    const srcset = $el.attr('srcset')
    if (srcset) {
      for (const part of srcset.split(',')) {
        enqueue(absolutize(referer, part.trim().split(/\s+/)[0]), 'image')
      }
    }
    enqueue(absolutize(referer, $el.attr('src')), guessTypeFromUrl(absolutize(referer, $el.attr('src')) ?? ''))
  })

  $('video, audio').each((_, el) => {
    const $el = $(el)
    for (const key of ['src', 'poster']) {
      enqueue(absolutize(referer, $el.attr(key)), guessTypeFromUrl(absolutize(referer, $el.attr(key)) ?? ''))
    }
  })

  // inline style blocks & style attributes: absolutize refs (queues downloads)
  $('style').each((_, el) => {
    const text = $(el).text()
    if (text.trim()) absolutizeCssRefs(text, referer, store, referer)
  })
  $('[style*="url("]').each((_, el) => {
    const style = $(el).attr('style')
    if (style) absolutizeCssRefs(style, referer, store, referer)
  })

  // same-origin crawl candidates (entry page only)
  const origin = new URL(referer).origin
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    const abs = absolutize(referer, href)
    if (!abs || !abs.startsWith(origin)) return
    if (SKIP_HREF_EXTS.test(new URL(abs).pathname)) return
    const norm = normalizeForMap(abs)
    if (norm === origin || norm === `${origin}`) return
    crawlCandidates.push(abs)
  })

  const bodyText = $('body').html() ?? ''
  const bodyTextLength = bodyText
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length

  return { cssUrls, elementTasks, crawlCandidates, bodyTextLength }
}

// ---------------------------------------------------------------------------
// slugs
// ---------------------------------------------------------------------------

function makeSlug(source: Omit<PageSource, 'slug'>, taken: Set<string>): string {
  let base: string
  if (source.kind === 'entry') {
    base = 'index'
  } else if (source.kind === 'state') {
    base = `index--${(source.label ?? 'state').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'state'}`
  } else {
    try {
      const u = new URL(source.url)
      base = u.pathname.split('/').filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 50) || 'page'
    } catch {
      base = 'page'
    }
  }
  let slug = base
  let n = 2
  while (taken.has(slug)) slug = `${base}-${n++}`
  taken.add(slug)
  return slug
}

// ---------------------------------------------------------------------------
// robots.txt awareness
// ---------------------------------------------------------------------------

async function checkRobots(url: string): Promise<boolean> {
  try {
    const u = new URL(url)
    const res = await fetchResource(new URL('/robots.txt', u.origin).toString(), { timeoutMs: 6000 })
    if (!res.ok || !res.body) return false
    const text = res.body.toString('utf8')
    let applies = false
    for (const rawLine of text.split('\n')) {
      const line = rawLine.split('#')[0].trim()
      if (!line) continue
      const [keyRaw, ...rest] = line.split(':')
      const key = keyRaw.trim().toLowerCase()
      const value = rest.join(':').trim()
      if (key === 'user-agent') applies = value === '*'
      else if (applies && key === 'disallow' && value) {
        const disPath = value.replace(/\*$/, '')
        if (u.pathname.startsWith(disPath)) return true
      }
    }
    return false
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// page acquisition (static vs browser, healing, interactions, crawl)
// ---------------------------------------------------------------------------

interface AcquireResult {
  sources: Omit<PageSource, 'slug'>[]
  rendered: boolean
  renderModeUsed: RenderMode
  autoHealed: { from: string; to: string; note: string } | null
  warnings: string[]
}

function staticTextLength(html: string): number {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length
}

async function acquirePages(opts: CloneOptions): Promise<AcquireResult> {
  const onProgress = opts.onProgress ?? (() => {})
  const warnings: string[] = []
  const sources: Omit<PageSource, 'slug'>[] = []
  let autoHealed: AcquireResult['autoHealed'] = null
  let rendered = false
  let renderModeUsed: RenderMode = opts.renderMode

  // -- static fetch of the entry page (with one retry) ---------------------
  onProgress(0, 'Fetching the page & following redirects…')
  let page = await fetchPage(opts.url)
  if (!page.ok && !page.body && page.error) {
    page = await fetchPage(opts.url) // single retry for flaky networks
  }
  const staticHtml = page.body ? page.body.toString('utf8') : ''
  const staticText = staticHtml ? staticTextLength(staticHtml) : 0
  const staticStatus = page.status

  const staticUsable = Boolean(staticHtml) && page.ok && staticText > 400

  const needsBrowser =
    opts.renderMode === 'browser' ||
    (opts.renderMode === 'auto' && (!staticUsable || staticStatus >= 400 || staticText <= 400))

  let entryHtml = staticHtml
  let entryFinal = page.url || opts.url
  let entryStatus = staticStatus
  let entryText = staticText
  let entryShot: Buffer | null = null
  let interactions: InteractionCandidate[] = []

  if (needsBrowser) {
    onProgress(1, 'Rendering in headless Chromium (JS executed)…')
    const rp: RenderedPage | null = await renderPage(opts.url)
    if (rp) {
      rendered = true
      renderModeUsed = 'browser'
      entryHtml = rp.html
      entryFinal = rp.finalUrl
      entryStatus = rp.status
      entryText = rp.textLength
      entryShot = rp.screenshot
      interactions = rp.interactions

      // -- auto-healing: /register-style URLs that render a 404 view -------
      if (looksLikeNotFound(rp.textSample) && rp.finalUrl) {
        const root = new URL(rp.finalUrl).origin + '/'
        onProgress(1, 'Requested URL looks like a 404 — healing to the site root…')
        const rootRender = await renderPage(root, { discover: true })
        if (rootRender && !looksLikeNotFound(rootRender.textSample)) {
          autoHealed = {
            from: opts.url,
            to: root,
            note: `The requested URL renders a "404 Not Found" view, so the engine cloned the site root instead — its interactive states (sign-up modals etc.) are included below.`,
          }
          entryHtml = rootRender.html
          entryFinal = rootRender.finalUrl
          entryStatus = rootRender.status
          entryText = rootRender.textLength
          entryShot = rootRender.screenshot
          interactions = rootRender.interactions
        }
      }
    } else {
      warnings.push('Headless browser was unavailable — fell back to static HTML cloning. JS-rendered sites may look empty.')
    }
  } else {
    renderModeUsed = 'static'
  }

  if (!entryHtml) {
    throw new Error(page.error
      ? `Could not reach the site: ${page.error}`
      : `The site responded with HTTP ${staticStatus} and no readable HTML.`)
  }

  sources.push({
    url: opts.url,
    finalUrl: entryFinal,
    html: entryHtml,
    kind: 'entry',
    screenshot: entryShot,
    rendered,
    textLength: entryText,
    title: '',
  })

  // -- interaction states (browser only) ------------------------------------
  if (rendered && interactions.length > 0) {
    onProgress(2, 'Replaying interactions to capture hidden UI…')
  }
  if (rendered) {
    let captured = 0
    for (const candidate of interactions) {
      if (captured >= MAX_INTERACTION_STATES) break
      const state = await captureInteractionState(entryFinal, candidate.label)
      if (!state) continue
      if (state.html === entryHtml) continue // click changed nothing
      sources.push({
        url: entryFinal,
        finalUrl: state.finalUrl,
        html: state.html,
        kind: 'state',
        label: candidate.label,
        screenshot: state.screenshot,
        rendered: true,
        textLength: state.textLength,
        title: '',
      })
      captured++
    }
  }

  // -- crawl same-origin links ----------------------------------------------
  if (opts.crawl) {
    onProgress(3, 'Crawling linked pages…')
    const scan = scanPage(sources[0] as PageSource, new AssetStore())
    const origin = new URL(entryFinal).origin
    const seen = new Set<string>([normalizeForMap(entryFinal), origin])
    const queue: string[] = []
    for (const c of scan.crawlCandidates) {
      const norm = normalizeForMap(c)
      if (seen.has(norm)) continue
      seen.add(norm)
      queue.push(c)
      if (queue.length >= MAX_CRAWL_PAGES) break
    }
    for (const link of queue) {
      const crawlRp = await renderPage(link, { discover: false, settleMs: 1200 }).catch(() => null)
      if (crawlRp && crawlRp.html) {
        // guard against same-origin links that redirect cross-origin
        if (!crawlRp.finalUrl.startsWith(origin)) continue
        sources.push({
          url: link,
          finalUrl: crawlRp.finalUrl,
          html: crawlRp.html,
          kind: 'page',
          screenshot: crawlRp.screenshot,
          rendered: true,
          textLength: crawlRp.textLength,
          title: '',
        })
      } else {
        warnings.push(`Could not clone linked page ${link}.`)
      }
    }
  }

  return { sources, rendered, renderModeUsed, autoHealed, warnings }
}

// ---------------------------------------------------------------------------
// main pipeline
// ---------------------------------------------------------------------------

export async function cloneSite(opts: CloneOptions): Promise<CloneResult> {
  const startedAt = Date.now()
  const onProgress = opts.onProgress ?? (() => {})
  const warnings: string[] = []

  const [robotsRestricted, acquired] = await Promise.all([
    checkRobots(opts.url),
    acquirePages(opts),
  ])
  if (robotsRestricted) warnings.push('robots.txt disallows this path for generic crawlers — clone anyway (you are responsible for authorization).')
  warnings.push(...acquired.warnings)

  const store = new AssetStore()
  const cssResults = new Map<string, { text: string; size: number } | null>()
  const allTasks: PendingTask[] = []
  const seenTasks = new Set<string>()
  let cssTotalBytes = 0

  // -- scan all pages, dedupe CSS + assets ----------------------------------
  const slugs = new Set<string>()
  const sources: PageSource[] = acquired.sources.map((s) => ({ ...s, slug: makeSlug(s, slugs) }))
  const entry = sources[0]
  const scans = new Map<string, PageScan>()

  for (const source of sources) {
    const scan = scanPage(source, store)
    scans.set(source.slug, scan)
    for (const cssUrl of scan.cssUrls) {
      if (!cssResults.has(cssUrl)) cssResults.set(cssUrl, null) // placeholder keeps order
    }
    for (const t of scan.elementTasks) {
      if (!seenTasks.has(t.url)) {
        seenTasks.add(t.url)
        allTasks.push(t)
      }
    }
  }

  // -- fetch stylesheets (recursive, shared across pages) -------------------
  onProgress(3, `Downloading stylesheets & assets (${allTasks.length} found)…`)
  const cssUrls = [...cssResults.keys()]
  await Promise.all(cssUrls.map(async (u) => {
    const r = await loadCss(u, 0, store, u)
    cssResults.set(u, r)
  }))
  for (const r of cssResults.values()) if (r) cssTotalBytes += r.size

  // -- download all element assets ------------------------------------------
  await runPool(allTasks, 8, async (t) => { await store.get(t.url, t.type, entry.finalUrl) })
  if (store.truncated) warnings.push('Asset budget reached — some assets were skipped and remain remote URLs.')

  // -- link map for offline navigation between cloned pages -----------------
  onProgress(4, 'Rewriting URLs, analyzing stack & packaging…')
  const linkMap = new Map<string, string>()
  for (const s of sources) {
    if (s.kind === 'state') continue
    linkMap.set(normalizeForMap(s.finalUrl), `${s.slug}.html`)
  }

  // -- materialize ------------------------------------------------------------
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

  const clonedNote = `<!-- Cloned with Clonethat on ${new Date().toISOString()} from ${entry.finalUrl} -->\n`

  const materialize = (source: PageSource, mode: 'single' | 'mirror'): string => {
    const $d = cheerio.load(source.html)
    preclean($d)

    const urlMap: UrlMapper = mode === 'single' ? inlineMapper : mirrorFromRootMapper

    $d('link[href]').each((_, el) => {
      const $el = $d(el) as unknown as cheerio.Cheerio<never>
      if (!isStylesheetLink($el)) {
        if (isIconLink($el)) {
          const abs = absolutize(source.finalUrl, ($el.attr('href') as string) ?? '')
          if (abs) $d(el).attr('href', urlMap(abs))
        }
        return
      }
      const abs = absolutize(source.finalUrl, ($el.attr('href') as string) ?? '')
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

    $d('style').each((_, el) => {
      const $el = $d(el)
      const raw = $el.text()
      if (!raw.trim()) return
      const absolutized = absolutizeCssRefs(raw, source.finalUrl, store, source.finalUrl)
      $el.text(rewriteCssUrls(absolutized, urlMap))
    })

    $d('[style]').each((_, el) => {
      const $el = $d(el)
      const style = $el.attr('style')
      if (!style || !style.includes('url(')) return
      $el.attr('style', rewriteCssUrls(absolutizeCssRefs(style, source.finalUrl, store, source.finalUrl), urlMap))
    })

    $d('img').each((_, el) => {
      const $el = $d(el)
      const mapAttr = (name: string) => {
        const abs = absolutize(source.finalUrl, $el.attr(name))
        if (!abs) return
        $el.attr(name, urlMap(abs))
      }
      if (!$el.attr('src') && $el.attr('data-src')) {
        $el.attr('src', urlMap(absolutize(source.finalUrl, $el.attr('data-src')) ?? ''))
        $el.removeAttr('data-src')
      } else {
        mapAttr('src')
      }
      for (const key of ['data-original', 'data-lazy-src']) $el.removeAttr(key)
      for (const key of ['srcset', 'data-srcset']) {
        const value = $el.attr(key)
        if (value) $el.attr(key, rewriteSrcset(value, urlMap, source.finalUrl))
      }
      $el.removeAttr('loading')
    })

    $d('source').each((_, el) => {
      const $el = $d(el)
      const srcset = $el.attr('srcset')
      if (srcset) $el.attr('srcset', rewriteSrcset(srcset, urlMap, source.finalUrl))
      const src = absolutize(source.finalUrl, $el.attr('src'))
      if (src) $el.attr('src', urlMap(src))
    })

    $d('video, audio').each((_, el) => {
      const $el = $d(el)
      for (const key of ['src', 'poster']) {
        const abs = absolutize(source.finalUrl, $el.attr(key))
        if (abs) $el.attr(key, urlMap(abs))
      }
    })

    $d('link[href]').each((_, el) => {
      const $el = $d(el) as unknown as cheerio.Cheerio<never>
      if (isIconLink($el)) {
        const abs = absolutize(source.finalUrl, ($el.attr('href') as string) ?? '')
        if (abs) $d(el).attr('href', urlMap(abs))
      }
    })

    // anchors: rewrite to cloned pages when possible, else absolute
    $d('a[href]').each((_, el) => {
      const abs = absolutize(source.finalUrl, $d(el).attr('href'))
      if (!abs) return
      const local = linkMap.get(normalizeForMap(abs))
      $d(el).attr('href', local ?? abs)
    })
    $d('form[action]').each((_, el) => {
      const abs = absolutize(source.finalUrl, $d(el).attr('action'))
      if (abs) $d(el).attr('action', abs)
    })
    $d('iframe[src]').each((_, el) => {
      const abs = absolutize(source.finalUrl, $d(el).attr('src'))
      if (abs) $d(el).attr('src', abs)
    })

    $d('script').each((_, el) => {
      const $el = $d(el)
      const type = ($el.attr('type') ?? '').toLowerCase()
      if (type === 'application/ld+json') return
      if (opts.keepScripts) {
        const abs = absolutize(source.finalUrl, $el.attr('src'))
        if (abs) $el.attr('src', abs)
      } else {
        $el.remove()
      }
    })

    return clonedNote + $d.html()
  }

  // build all outputs
  const singles = new Map<string, string>()
  const shots = new Map<string, Buffer>()
  const mirrorFiles = new Map<string, Buffer>()
  let htmlBytes = 0

  for (const source of sources) {
    singles.set(source.slug, materialize(source, 'single'))
    mirrorFiles.set(`${source.slug}.html`, Buffer.from(materialize(source, 'mirror'), 'utf8'))
    if (source.screenshot) shots.set(`${source.slug}.png`, source.screenshot)
    htmlBytes += Buffer.byteLength(source.html, 'utf8')
  }
  for (const asset of store.downloaded.values()) {
    mirrorFiles.set(`assets/${asset.hash}.${asset.ext}`, asset.buffer)
  }
  for (const [url, css] of cssResults.entries()) {
    if (!css) continue
    mirrorFiles.set(`assets/${sha1(url)}.css`, Buffer.from(rewriteCssUrls(css.text, mirrorFromCssMapper), 'utf8'))
  }

  const entrySingle = singles.get(entry.slug) ?? ''

  // -- analysis (entry page) --------------------------------------------------
  const cssTextsForAnalysis: string[] = []
  for (const css of cssResults.values()) if (css) cssTextsForAnalysis.push(css.text)
  const $entry = cheerio.load(entry.html)
  $entry('style').each((_, el) => {
    const t = $entry(el).text()
    if (t) cssTextsForAnalysis.push(t)
  })

  const rawTitle = $entry('title').first().text().trim()
  const ogTitle = $entry('meta[property="og:title"]').attr('content')?.trim() ?? ''
  const title = rawTitle || ogTitle || new URL(entry.finalUrl).hostname
  const description = ($entry('meta[name="description"]').attr('content')
    ?? $entry('meta[property="og:description"]').attr('content') ?? '').trim()
  const lang = $entry('html').attr('lang') ?? ''
  const ogImage = absolutize(entry.finalUrl, $entry('meta[property="og:image"]').attr('content')) ?? ''
  let favicon = ''
  $entry('link[href]').each((_, el) => {
    const $el = $entry(el) as unknown as cheerio.Cheerio<never>
    if (favicon || !isIconLink($el)) return
    favicon = absolutize(entry.finalUrl, ($el.attr('href') as string) ?? '') ?? ''
  })
  if (!favicon) {
    try { favicon = new URL('/favicon.ico', entry.finalUrl).toString() } catch { favicon = '' }
  }

  const analysis = analyzeSite(entry.html, cssTextsForAnalysis, entry.finalUrl, {
    title, description, lang, ogImage, favicon,
  })

  // -- stats -------------------------------------------------------------------
  const counts: Record<AssetType, number> = { image: 0, style: 0, script: 0, font: 0, media: 0, icon: 0, other: 0 }
  const domains = new Set<string>([new URL(entry.finalUrl).hostname])
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

  const pages: ClonePageInfo[] = sources.map((s) => ({
    slug: s.slug,
    title: s.kind === 'state' && s.label ? `${title} — ${s.label}` : pageTitleOf(s),
    sourceUrl: s.url,
    kind: s.kind,
    interactionLabel: s.label,
    hasScreenshot: Boolean(s.screenshot),
    textLength: s.textLength,
  }))

  const singleTotal = [...singles.values()].reduce((n, html) => n + Buffer.byteLength(html, 'utf8'), 0)

  const meta = {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    sourceUrl: opts.url,
    finalUrl: entry.finalUrl,
    title,
    keepScripts: opts.keepScripts,
    createdAt: Date.now(),
    renderMode: acquired.renderModeUsed,
    rendered: acquired.rendered,
    autoHealed: acquired.autoHealed,
    warnings,
    robotsRestricted,
    analysis,
    stats: {
      htmlBytes,
      singleBytes: singleTotal,
      totalBytes: store.totalBytes + cssTotalBytes + htmlBytes,
      requests: store.downloaded.size + cssResults.size + sources.length,
      counts,
      domains: [...domains].slice(0, 20),
      textLength: entry.textLength,
      durationMs: Date.now() - startedAt,
    },
    assets: assetsInfo,
    pages,
  }

  return { meta, singleHtml: entrySingle, mirrorHtml: '', files: mirrorFiles, singles, shots }
}

function pageTitleOf(source: PageSource): string {
  try {
    const $ = cheerio.load(source.html)
    return $('title').first().text().trim() || new URL(source.finalUrl).hostname
  } catch {
    return source.finalUrl
  }
}
