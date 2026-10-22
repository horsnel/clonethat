import { readFile, writeFile, mkdir } from 'fs/promises'
import path from 'path'
import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import ZAI from 'z-ai-web-dev-sdk'
import type { CloneMeta, ClonePageInfo } from './types'

const CLONES_ROOT = path.join(process.cwd(), 'clones')
const MAX_INPUT_CHARS = 60_000
const SVG_KEEP_CHARS = 500
const FULL_REBUILD_LIMIT = 16_000
const BATCH_SIZE = 12_000
const MAX_LLM_ROUNDS = 3
const JUNK_RE = /aria-live|svelte-announcer|progressier|sr-only|skip-link|visually-hidden|pointer-events-none/i

function cloneDir(id: string): string {
  if (!/^[a-z0-9]{6,24}$/i.test(id)) throw new Error('Invalid clone id')
  return path.join(CLONES_ROOT, id)
}

function safeSlug(slug: string | null | undefined): string {
  if (!slug) return 'index'
  return /^[a-z0-9-]+$/i.test(slug) ? slug : 'index'
}

/* ------------------------------------------------------------------ */
/* HTML slimming — shrink a captured page to LLM-friendly input        */
/* ------------------------------------------------------------------ */

export interface SlimResult {
  doc: string
  notes: string[]
}

export function slimForRebuild(html: string): SlimResult {
  const notes: string[] = []
  let out = html

  const styleBlocks = out.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) ?? []
  if (styleBlocks.length) notes.push(`${styleBlocks.length} <style> block(s) removed`)
  out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')

  const scripts = out.match(/<script\b[\s\S]*?<\/script>/gi) ?? []
  if (scripts.length) notes.push(`${scripts.length} script(s) removed`)
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  out = out.replace(/<script\b[^>]*\/>/gi, '')

  out = out.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
  out = out.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '<iframe-removed></iframe-removed>')
  out = out.replace(/<!--[\s\S]*?-->/g, '')

  // truncate bulky inline SVG internals, keep the tag + classes
  out = out.replace(/(<svg\b[^>]*>)([\s\S]*?)(<\/svg>)/gi, (_m, open: string, inner: string, close: string) => {
    if (inner.length <= SVG_KEEP_CHARS) return _m
    return `${open}${inner.slice(0, SVG_KEEP_CHARS)}<!-- svg paths truncated -->${close}`
  })

  // kill base64 payloads
  out = out.replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/gi, 'DATA_URI')

  // strip long framework / state attributes
  out = out.replace(/\sdata-[a-z0-9_-]{2,40}="[^"]{80,}"/gi, '')
  out = out.replace(/\ssrcset="[^"]{120,}"/gi, '')
  out = out.replace(/\sstyle="[^"]{200,}"/gi, '')

  // strip invisible utility branches (announcers, backdrops, live regions)
  try {
    const $ = cheerio.load(out)
    const junk = $("[aria-live], [class*='svelte-announcer'], [class*='progressier'], [style*='clip: rect']")
    if (junk.length) {
      junk.remove()
      notes.push(`${junk.length} invisible utility element(s) removed`)
      out = $.html()
    }
  } catch { /* non-fatal */ }

  // collapse whitespace
  out = out.replace(/\r/g, '')
  out = out.replace(/[ \t]{2,}/g, ' ')
  out = out.replace(/\n\s*\n+/g, '\n')

  return { doc: out.trim(), notes }
}

/* ------------------------------------------------------------------ */
/* Overlay extraction (interaction states) + unit extraction           */
/* ------------------------------------------------------------------ */

/** For state captures, isolate the open modal/overlay branch from the capture. */
export function extractOverlay(doc: string): string | null {
  try {
    const $ = cheerio.load(doc)
    let best: string | null = null
    $('div, section, aside, dialog').each((_, el) => {
      const cls = ($(el).attr('class') ?? '') + ' ' + ($(el).attr('role') ?? '')
      const overlayish =
        /dialog|\bmodal\b|overlay|drawer/i.test(cls) ||
        (/fixed/.test(cls) && /inset-0/.test(cls) && !/inset-x/.test(cls))
      if (!overlayish) return
      const html = $.html(el)
      if (html.length > 1200 && (!best || html.length > best.length)) best = html
    })
    return best
  } catch {
    return null
  }
}

/**
 * Break the body into rebuild units: descend framework wrapper divs to the
 * shallowest meaningful sibling level, then batch consecutive siblings by size.
 * Deterministic — no mid-element cuts, no guessing.
 */
export function extractUnits(doc: string): string[] {
  const raw: string[] = []
  const collect = ($: cheerio.CheerioAPI, els: AnyNode[], depth: number): void => {
    for (const el of els) {
      const cls = ($(el).attr('class') ?? '') + ' ' + ($(el).attr('style') ?? '')
      if (JUNK_RE.test(cls) && depth > 0) continue
      const h = $.html(el)
      const textLen = $(el).text().replace(/\s+/g, '').length
      const hasMedia = /<img|<video|<svg/i.test(h)
      if (!textLen && !hasMedia) continue
      if (h.length > BATCH_SIZE && depth < 6) {
        const kids = $(el).children().toArray()
        if (kids.length >= 1) {
          collect($, kids, depth + 1)
          continue
        }
      }
      raw.push(h)
    }
  }

  try {
    const $ = cheerio.load(doc)
    collect($, $('body').children().toArray(), 0)
  } catch {
    return []
  }
  if (!raw.length) return []

  // batch consecutive units up to BATCH_SIZE
  const batches: string[] = []
  let cur = ''
  for (const u of raw) {
    if (cur && cur.length + u.length > BATCH_SIZE) {
      batches.push(cur)
      cur = ''
    }
    cur += (cur ? '\n' : '') + u
  }
  if (cur.trim()) batches.push(cur)
  return batches
}

/* ------------------------------------------------------------------ */
/* Prompt construction                                                 */
/* ------------------------------------------------------------------ */

function pageDescription(page: ClonePageInfo | undefined): string {
  if (!page) return 'a webpage'
  if (page.kind === 'state') {
    return `an interaction state: the "${page.interactionLabel ?? 'interactive'}" modal/overlay captured while open on top of the page.`
  }
  if (page.kind === 'entry') return 'the main entry page'
  return `a subpage at ${page.sourceUrl}`
}

function designContext(meta: CloneMeta): string {
  const colors = meta.analysis.colors.slice(0, 6).map((c) => c.hex)
  const fonts = meta.analysis.fonts.slice(0, 3).map((f) => f.family)
  return [
    `- Title: ${meta.analysis.title || meta.title}`,
    `- Brand palette (most used): ${colors.join(', ') || 'unknown'}`,
    `- Fonts: ${fonts.join(', ') || 'system stack'}`,
  ].join('\n')
}

const HTML_SYSTEM = [
  'You are an elite frontend engineer who rebuilds web pages as immaculate, hand-crafted HTML5 + Tailwind CSS.',
  'You reply with CODE ONLY — no prose, no explanations, no markdown code fences.',
].join('\n')

const REACT_SYSTEM = [
  'You are an elite React + TypeScript engineer who converts captured page DOMs into production-quality components.',
  'You reply with CODE ONLY — no prose, no explanations, no markdown code fences.',
].join('\n')

const SHARED_RULES = [
  '3. Reproduce the EXACT visual design: colors (use arbitrary values like bg-[#ff7300] when the exact shade matters), spacing, typography, borders, radii, shadows, and layout at desktop + a mobile breakpoint.',
  '4. TEXT FIDELITY IS CRITICAL: copy every headline, paragraph, button label, badge, and link text EXACTLY character-for-character from the provided DOM. NEVER invent brand names, statistics, testimonials, CTA labels, or filler copy that is not present in the DOM. If text is unclear or missing, omit it — do not guess.',
  '5. Preserve href values as given. Keep image src values EXACTLY as provided (they point to a local assets/ folder) — never modify asset paths.',
  '6. Drop trackers, scripts, and framework artifacts (svelte/astro attributes, aria-live announcers). Recreate interactivity hints with Tailwind hover:/focus: classes only.',
].join('\n')

function htmlUserPrompt(doc: string, meta: CloneMeta, page: ClonePageInfo | undefined, batchNote: string): string {
  return [
    'Rebuild the provided page DOM as a clean, semantic HTML5 document styled entirely with Tailwind CSS utility classes.',
    '',
    'STRICT RULES:',
    '1. Output ONLY clean HTML markup. No markdown fences, no commentary.',
    '2. Reproduce the EXACT visual design: colors (use arbitrary values like bg-[#ff7300] when the exact shade matters), spacing, typography, borders, radii, shadows, and layout at desktop + a mobile breakpoint.',
    SHARED_RULES,
    '7. Use semantic elements (<header>, <nav>, <main>, <section>, <footer>) and clean, consistently indented markup.',
    '8. Add brief section comments like <!-- Hero -->, <!-- Features -->, <!-- Footer -->.',
    '',
    `This page is: ${pageDescription(page)}`,
    'Site context:',
    designContext(meta),
    '',
    batchNote,
    '',
    'PAGE DOM:',
    doc,
  ].filter(Boolean).join('\n')
}

function reactUserPrompt(doc: string, meta: CloneMeta, page: ClonePageInfo | undefined, batchNote: string): string {
  return [
    'Convert the provided page DOM into React component code (TSX) styled with Tailwind CSS utility classes.',
    '',
    'STRICT RULES:',
    '1. Output ONLY clean TSX code. No markdown fences, no commentary.',
    '2. Reproduce the EXACT visual design with Tailwind classes; use arbitrary values like bg-[#ff7300] when needed.',
    SHARED_RULES,
    '7. Use semantic JSX (header, main, section, footer). Keep the code compact: if an inline SVG has more than 8 shapes, replace it with a simplified 1-2 path placeholder icon of the same size/color.',
    '8. Extract repeated visual patterns into local arrays rendered with .map() (include a key prop).',
    '',
    `This page is: ${pageDescription(page)}`,
    'Site context:',
    designContext(meta),
    '',
    batchNote,
    '',
    'PAGE DOM:',
    doc,
  ].filter(Boolean).join('\n')
}

/* ------------------------------------------------------------------ */
/* LLM plumbing                                                        */
/* ------------------------------------------------------------------ */

async function callLLM(system: string, user: string): Promise<string> {
  const zai = await ZAI.create()
  let lastErr: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: system },
          { role: 'user', content: user },
        ],
        thinking: { type: 'disabled' },
      })
      const text = completion.choices[0]?.message?.content ?? ''
      if (!text.trim()) throw new Error('Empty AI response')
      return text
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      const isRate = /429|rate/i.test(msg)
      if (!isRate || attempt === 4) break
      await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/** Tiny semaphore to cap concurrent LLM calls (rate-limit friendly). */
function createSemaphore(limit: number) {
  let active = 0
  const queue: Array<() => void> = []
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((r) => queue.push(r))
    active++
    try {
      return await fn()
    } finally {
      active--
      queue.shift()?.()
    }
  }
}

function stripFences(text: string): string {
  let out = text.trim()
  const fence = out.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/)
  if (fence) out = fence[1]
  if (out.startsWith('```')) out = out.slice(out.indexOf('\n') + 1)
  if (out.endsWith('```')) out = out.slice(0, -3)
  return out.trim()
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Distinctive visible-text probes from a source DOM chunk, biased to its tail. */
function textProbes(frag: string, max = 16): string[] {
  try {
    const $ = cheerio.load(frag)
    const probes: string[] = []
    $('h1, h2, h3, h4, button, a, li, p, span, label').each((_, el) => {
      const t = ($(el).text() ?? '').replace(/\s+/g, ' ').trim()
      if (t.length >= 10 && t.length <= 90 && !probes.some((p) => norm(p) === norm(t))) probes.push(t)
    })
    return probes.slice(-max)
  } catch {
    return []
  }
}

function missingProbes(probes: string[], output: string): string[] {
  const hay = norm(output)
  return probes.filter((p) => !hay.includes(norm(p)))
}

function continuationPrompt(user: string, acc: string, instruction: string): string {
  return [
    'You are continuing your own previous generation for the SAME task. Below are (1) the original task with the full source DOM, and (2) the tail of what you already output.',
    'Continue EXACTLY from where the previous output stopped — do not repeat content, do not restart, do not paraphrase the source: copy its text character-for-character.',
    instruction,
    '',
    '=== ORIGINAL TASK (full source) ===',
    user,
    '',
    '=== YOUR PREVIOUS OUTPUT TAIL (continue right after this) ===',
    acc.slice(-1200),
  ].join('\n')
}

/** Call the LLM, auto-continuing until `isDone` says the accumulated output is complete. */
async function callLLMComplete(
  system: string,
  user: string,
  isDone: (acc: string) => boolean,
  continuationInstruction: string,
): Promise<string> {
  let acc = ''
  if (isDone(acc)) return acc
  for (let round = 0; round < MAX_LLM_ROUNDS; round++) {
    const prompt = round === 0 ? user : continuationPrompt(user, acc, continuationInstruction)
    const chunk = stripFences(await callLLM(system, prompt))
    // stop if the model is re-outputting content we already have (runaway guard)
    const probeHead = norm(chunk).slice(0, 260)
    if (acc && probeHead.length > 120 && norm(acc).includes(probeHead)) break
    acc = acc ? `${acc}\n${chunk}` : chunk
    if (isDone(acc)) return acc
  }
  return acc
}

/** Drop duplicated labeled sections (keep the last, usually the fuller rebuild). */
function dedupeSections(out: string): string {
  const parts = out.split(/(?=<!-- [A-Za-z][^>]{0,40}? -->)/)
  const lastPos = new Map<string, number>()
  parts.forEach((p, i) => {
    const m = p.match(/^<!-- ([A-Za-z][^>]{0,40}?) -->/)
    if (m) lastPos.set(norm(m[1]), i)
  })
  const dropped = new Set<number>()
  const seen = new Map<string, number>()
  parts.forEach((p, i) => {
    const m = p.match(/^<!-- ([A-Za-z][^>]{0,40}?) -->/)
    if (!m) return
    const key = norm(m[1])
    if (seen.has(key) && lastPos.get(key) !== i) dropped.add(i)
    else seen.set(key, i)
  })
  return parts.filter((_, i) => !dropped.has(i)).join('')
}

/** Batch mode: independent attempts, keep the one with the fewest probe misses (no stitching artifacts). */
async function generateWithRetry(
  system: string,
  user: string,
  score: (out: string) => number,
): Promise<string> {
  let best = ''
  let bestScore = Infinity
  for (let round = 0; round < MAX_LLM_ROUNDS; round++) {
    const prompt = round === 0
      ? user
      : [
          'Your previous attempt was INCOMPLETE or INACCURATE for the task below. Output a COMPLETE corrected replacement from scratch — every listed element, every text item copied character-for-character from the source DOM.',
          '',
          '=== ORIGINAL TASK (full source) ===',
          user,
        ].join('\n')
    const out = stripFences(await callLLM(system, prompt))
    const sc = score(out)
    if (sc === 0) return out
    if (sc < bestScore) {
      best = out
      bestScore = sc
    }
  }
  return best
}

function looksCompleteHtml(s: string): boolean {
  return /<\/html>\s*$/i.test(s.trim())
}

function looksCompleteReact(s: string): boolean {
  const t = s.trim().replace(/export default\s+\w+\s*;?\s*$/i, '').trim()
  if (!/[};]$/.test(t)) return false
  let bal = 0
  for (const ch of t) {
    if (ch === '{') bal++
    else if (ch === '}') bal--
  }
  return bal <= 1 && bal >= -3
}

/** Normalize the generated TSX: fix brace drift and guarantee a default export. */
function finalizeReact(src: string): string {
  let t = src.trim().replace(/export default\s+\w+\s*;?\s*$/i, '').trim()
  const bal = (s: string) => {
    let n = 0
    for (const ch of s) {
      if (ch === '{') n++
      else if (ch === '}') n--
    }
    return n
  }
  const b = bal(t)
  if (b > 0) t += '\n' + '}'.repeat(b)
  if (b < 0) {
    const lines = t.split('\n')
    let need = -b
    for (let i = lines.length - 1; i >= 0 && need > 0; i--) {
      const l = lines[i].trim()
      if (l === '}' || l === '};') {
        lines.splice(i, 1)
        need--
      }
    }
    t = lines.join('\n')
  }
  if (!/^export default/m.test(t)) {
    const name = t.match(/function\s+([A-Za-z0-9_$]+)/)?.[1] ?? 'Page'
    t += `\n\nexport default ${name};`
  }
  return t
}

/* ------------------------------------------------------------------ */
/* Shells                                                              */
/* ------------------------------------------------------------------ */

function htmlShell(title: string, lang: string, body: string): string {
  return [
    '<!DOCTYPE html>',
    `<html lang="${lang || 'en'}">`,
    '<head>',
    ' <meta charset="utf-8">',
    ' <meta name="viewport" content="width=device-width, initial-scale=1">',
    ` <title>${title.replace(/[<&>]/g, '')}</title>`,
    ' <script src="https://cdn.tailwindcss.com"></' + 'script>',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
  ].join('\n')
}

function reactShell(body: string): string {
  return ['export default function Page() {', '  return (', '    <>', body, '    </>', '  )', '}'].join('\n')
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

export interface RebuildPayload {
  code: string
  react: string | null
  previewHtml: string
}

export async function readRebuild(id: string, slug: string | null): Promise<RebuildPayload | null> {
  const s = safeSlug(slug)
  try {
    const dir = path.join(cloneDir(id), 'rebuild')
    const [code, react] = await Promise.all([
      readFile(path.join(dir, `${s}.html`), 'utf8'),
      readFile(path.join(dir, `${s}.tsx`), 'utf8').catch(() => null),
    ])
    // derive the preview shell at read time (compiled CSS + CDN fallback)
    let previewHtml = ensureCdnScript(code)
    try {
      const mirrorHtml = await readFile(path.join(cloneDir(id), 'mirror', `${s}.html`), 'utf8')
      previewHtml = toPreviewHtml(code, id, await collectCompiledCss(id, mirrorHtml))
    } catch { /* mirror missing — plain code preview */ }
    return { code, react, previewHtml }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Preview post-processing                                             */
/* ------------------------------------------------------------------ */

async function collectCompiledCss(id: string, mirrorHtml: string): Promise<string> {
  const hrefs = [...mirrorHtml.matchAll(/<link[^>]+href="(assets\/[^"]+\.css)"/gi)].map((m) => m[1])
  const chunks: string[] = []
  for (const href of hrefs) {
    try {
      const css = await readFile(path.join(cloneDir(id), 'mirror', href), 'utf8')
      chunks.push(css)
    } catch { /* optional */ }
  }
  return chunks.join('\n\n')
}

/** Guarantee a viewport meta tag exists (deterministic post-fix for mobile rendering). */
function ensureViewportMeta(code: string): string {
  if (/name=["']viewport["']/i.test(code)) return code
  const tag = '<meta name="viewport" content="width=device-width, initial-scale=1">'
  if (/<head[^>]*>/i.test(code)) return code.replace(/<head[^>]*>/i, (m) => `${m}\n ${tag}`)
  if (/<meta charset[^>]*>/i.test(code)) return code.replace(/<meta charset[^>]*>/i, (m) => `${m}\n${tag}`)
  if (/<title[^>]*>/i.test(code)) return code.replace(/<title[^>]*>/i, (m) => `${tag}\n${m}`)
  return `${tag}\n${code}`
}

function ensureCdnScript(code: string): string {
  if (/cdn\.tailwindcss\.com/i.test(code)) return code
  const tag = '<script src="https://cdn.tailwindcss.com"></' + 'script>'
  if (/<head[^>]*>/i.test(code)) return code.replace(/<head[^>]*>/i, (m) => `${m}\n ${tag}`)
  if (/<title[^>]*<\/title>/i.test(code)) return code.replace(/<title[^>]*<\/title>/i, (m) => `${m}\n${tag}`)
  return `${tag}\n${code}`
}

function toPreviewHtml(code: string, id: string, compiledCss: string): string {
  let out = ensureCdnScript(code)
  out = out.replace(/(src|href)="(assets\/[^"]+)"/g, `$1="/api/asset/${id}/$2"`)
  if (compiledCss) {
    // compiled site CSS first (offline fallback), Tailwind CDN after (its utilities win the cascade)
    const block = `<style data-cloneforge-compiled>${compiledCss}</style>\n <script src="https://cdn.tailwindcss.com"></` + `script>`
    if (/<script[^>]*cdn\.tailwindcss\.com[^>]*><\/script>/i.test(out)) {
      out = out.replace(/<script[^>]*cdn\.tailwindcss\.com[^>]*><\/script>/i, block)
    } else if (/<head[^>]*>/i.test(out)) {
      out = out.replace(/<head[^>]*>/i, (m) => `${m}\n ${block}`)
    } else {
      out = `${block}\n${out}`
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Main entry                                                          */
/* ------------------------------------------------------------------ */

export interface RebuildOutcome extends RebuildPayload {
  slug: string
  inputChars: number
  notes: string[]
  durationMs: number
}

export async function rebuildPage(
  id: string,
  slug: string | null,
  meta: CloneMeta,
  onProgress: (step: number, message: string) => void = () => {},
): Promise<RebuildOutcome> {
  const s = safeSlug(slug)
  const started = Date.now()

  // 1. load captured DOM (mirror first, single-file fallback)
  let mirrorHtml: string
  try {
    mirrorHtml = await readFile(path.join(cloneDir(id), 'mirror', `${s}.html`), 'utf8')
  } catch {
    mirrorHtml = await readFile(path.join(cloneDir(id), 'single', `${s}.html`), 'utf8')
  }

  // 2. slim + state-overlay isolation
  let slim = slimForRebuild(mirrorHtml)
  const page = meta.pages?.find((p) => p.slug === s)
  if (page?.kind === 'state') {
    const overlay = extractOverlay(slim.doc)
    if (overlay) slim = { doc: overlay, notes: [...slim.notes, 'overlay branch isolated from the state capture'] }
  }
  if (slim.doc.length > MAX_INPUT_CHARS) {
    slim = { doc: slim.doc.slice(0, MAX_INPUT_CHARS) + '\n<!-- truncated -->', notes: [...slim.notes, `input truncated to ${MAX_INPUT_CHARS} chars`] }
  }

  // 3. deterministic unit extraction
  const batches = extractUnits(slim.doc)
  const batched = batches.length > 1 || (batches.length === 1 && slim.doc.length > FULL_REBUILD_LIMIT)
  const sourceParts = batched ? batches : [slim.doc]
  onProgress(2, `Rebuilding layout with Tailwind… (${sourceParts.length} section group${sourceParts.length > 1 ? 's' : ''})`)

  // 4. compiled CSS for the preview shell
  const compiledCss = await collectCompiledCss(id, mirrorHtml)

  async function generateHtml(part: string): Promise<string> {
    const probes = textProbes(part)
    const note = batched
      ? 'You are rebuilding ONE consecutive slice of the page body (complete sibling elements, in order). Rebuild ALL of them — never skip, never add sections that are not in the DOM below. Headings and button labels must be copied verbatim — never rephrase them or add question marks.'
      : 'Output ONE complete HTML document starting with <!DOCTYPE html> and ending with </html>.'
    const user = htmlUserPrompt(part, meta, page, note)
    if (batched) {
      const raw = await generateWithRetry(HTML_SYSTEM, user, (out) =>
        out.trim().length < 200 ? 99 : missingProbes(probes, out).length,
      )
      return dedupeSections(raw)
    }
    return callLLMComplete(HTML_SYSTEM, user, (acc) => looksCompleteHtml(acc), 'Output ONLY the raw continuation so the document ends with </html>.')
  }

  async function generateReact(part: string): Promise<string> {
    const probes = textProbes(part)
    const note = batched
      ? 'You are rebuilding ONE consecutive slice of the page body. Output BARE JSX only — no function wrapper, no imports, no export line; rebuild ALL sibling elements below in order, never skip, never invent extra sections. Headings and button labels must be copied verbatim.'
      : 'Output ONE complete component file: start with `export default function Page() {`.'
    const user = reactUserPrompt(part, meta, page, note)
    if (batched) {
      const raw = await generateWithRetry(REACT_SYSTEM, user, (out) =>
        out.trim().length < 200 ? 99 : missingProbes(probes, out).length,
      )
      return dedupeSections(raw)
    }
    return finalizeReact(await callLLMComplete(REACT_SYSTEM, user, (acc) => looksCompleteReact(acc), 'Output ONLY the raw continuation so the component closes all braces.'))
  }

  // one shared rate-limit budget: max 3 LLM calls in flight across both formats
  const limit = createSemaphore(3)

  const [htmlRes, reactRes] = await Promise.allSettled([
    (async () => {
      const parts = await Promise.all(sourceParts.map((part) => limit(() => generateHtml(part))))
      onProgress(3, 'Generating React component…')
      const body = parts.join('\n')
      return batched ? htmlShell(meta.analysis.title || meta.title, meta.analysis.lang, body) : body
    })(),
    (async () => {
      const parts = await Promise.all(sourceParts.map((part) => limit(() => generateReact(part))))
      const body = parts.join('\n')
      return batched ? reactShell(body) : body
    })(),
  ])

  if (htmlRes.status !== 'fulfilled') {
    throw new Error(`AI rebuild failed: ${htmlRes.reason instanceof Error ? htmlRes.reason.message : String(htmlRes.reason)}`)
  }

  const code = ensureViewportMeta(ensureCdnScript(htmlRes.value))
  if (!code.toLowerCase().includes('<!doctype') && !code.toLowerCase().includes('<html')) {
    throw new Error('AI returned unexpected output (no HTML document detected)')
  }
  const react = reactRes.status === 'fulfilled' ? stripFences(reactRes.value) : null
  const previewHtml = toPreviewHtml(code, id, compiledCss)
  onProgress(4, 'Polishing the code…')

  // 5. persist (preview shell is derived at read time)
  const dir = path.join(cloneDir(id), 'rebuild')
  await mkdir(dir, { recursive: true })
  await Promise.all([
    writeFile(path.join(dir, `${s}.html`), Buffer.from(code, 'utf8')),
    react ? writeFile(path.join(dir, `${s}.tsx`), Buffer.from(react, 'utf8')) : Promise.resolve(),
  ])

  return {
    slug: s,
    code,
    react,
    previewHtml,
    inputChars: slim.doc.length,
    notes: slim.notes,
    durationMs: Date.now() - started,
  }
}
