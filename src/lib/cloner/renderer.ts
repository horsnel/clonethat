import { chromium, type Browser, type BrowserContext } from 'playwright-core'

const CHROMIUM_CANDIDATES = [
  process.env.CLONEFORGE_CHROMIUM,
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  '/home/z/.cache/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-linux64/chrome-headless-shell',
].filter(Boolean) as string[]

export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
export const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

let browserPromise: Promise<Browser | null> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null

const IDLE_CLOSE_MS = 3 * 60 * 1000

function scheduleIdleClose(browser: Browser) {
  if (closeTimer) clearTimeout(closeTimer)
  closeTimer = setTimeout(() => {
    browser.close().catch(() => {})
    if (browserPromise) browserPromise = null
  }, IDLE_CLOSE_MS)
  closeTimer.unref?.()
}

export async function getBrowser(): Promise<Browser | null> {
  if (browserPromise) {
    const b = await browserPromise
    if (b && b.isConnected()) {
      scheduleIdleClose(b)
      return b
    }
    browserPromise = null
  }
  browserPromise = (async () => {
    for (const exec of CHROMIUM_CANDIDATES) {
      try {
        const browser = await chromium.launch({
          executablePath: exec,
          args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--hide-scrollbars'],
        })
        scheduleIdleClose(browser)
        return browser
      } catch {
        continue
      }
    }
    return null
  })()
  return browserPromise
}

export interface InteractionCandidate {
  label: string
}

export interface RenderedPage {
  html: string
  finalUrl: string
  status: number
  textLength: number
  textSample: string
  screenshot: Buffer | null
  interactions: InteractionCandidate[]
}

interface RenderOpts {
  settleMs?: number
  screenshot?: boolean
  timeoutMs?: number
  discover?: boolean
}

const CTA_RE_SOURCE =
  '^(sign\\s?up|register|create\\s+(an\\s+)?account|get\\s+started|log\\s?in|login|join(\\s+now)?|start\\s+earning|start\\s+a\\s+campaign|open\\s+account)$'

async function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    userAgent: DESKTOP_UA,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'Africa/Lagos',
    deviceScaleFactor: 1,
  })
}

/** Find CTA-like buttons/links that likely reveal hidden UI (modals, drawers). */
async function discoverOnPage(page: import('playwright-core').Page, max: number): Promise<InteractionCandidate[]> {
  try {
    const found = await page.evaluate((args: { reSource: string; cap: number }) => {
      const re = new RegExp(args.reSource, 'i')
      const out: string[] = []
      const seen = new Set<string>()
      for (const el of document.querySelectorAll('button, a, [role="button"]')) {
        const label = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
        const key = label.toLowerCase()
        if (!label || !re.test(label) || seen.has(key)) continue
        const anchor = el as HTMLAnchorElement
        if (anchor.tagName === 'A' && anchor.getAttribute('href')?.startsWith('http')) continue
        seen.add(key)
        out.push(label)
        if (out.length >= args.cap) break
      }
      return out
    }, { reSource: CTA_RE_SOURCE, cap: max * 3 })
    const unique: InteractionCandidate[] = []
    for (const label of found) {
      if (!unique.some((u) => u.label.toLowerCase() === label.toLowerCase())) unique.push({ label })
      if (unique.length >= max) break
    }
    return unique
  } catch {
    return []
  }
}

/** Load a URL in headless Chromium and capture the fully-rendered DOM. */
export async function renderPage(url: string, opts: RenderOpts = {}): Promise<RenderedPage | null> {
  const browser = await getBrowser()
  if (!browser) return null
  const { settleMs = 2200, screenshot = true, timeoutMs = 45_000, discover = true } = opts
  const ctx = await newContext(browser)
  const page = await ctx.newPage()
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(settleMs)
    const html = await page.content()
    const textLength = await page.evaluate(() => document.body.innerText.length)
    const textSample = await page.evaluate(() => document.body.innerText.trim().replace(/\s+/g, ' ').slice(0, 120))
    const interactions = discover ? await discoverOnPage(page, 3) : []
    const shot = screenshot ? await page.screenshot({ type: 'png' }).catch(() => null) : null
    return {
      html,
      finalUrl: page.url(),
      status: resp?.status() ?? 0,
      textLength,
      textSample,
      screenshot: shot ? Buffer.from(shot) : null,
      interactions,
    }
  } catch {
    return null
  } finally {
    await ctx.close().catch(() => {})
  }
}

/** Replay a CTA click on a fresh page and capture the revealed UI state (modals, drawers). */
export async function captureInteractionState(
  url: string,
  label: string,
  opts: RenderOpts = {}
): Promise<RenderedPage | null> {
  const browser = await getBrowser()
  if (!browser) return null
  const { settleMs = 1500, screenshot = true, timeoutMs = 40_000 } = opts
  const ctx = await newContext(browser)
  const page = await ctx.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {})
    await page.waitForTimeout(1200)

    const clicked = await page.evaluate((target: string) => {
      const want = target.trim().toLowerCase()
      for (const el of document.querySelectorAll('button, a, [role="button"]')) {
        const t = (el.textContent ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
        if (t === want) {
          ;(el as HTMLElement).click()
          return true
        }
      }
      return false
    }, label)
    if (!clicked) return null
    await page.waitForTimeout(settleMs)

    const html = await page.content()
    const textLength = await page.evaluate(() => document.body.innerText.length)
    const textSample = await page.evaluate(() => document.body.innerText.trim().replace(/\s+/g, ' ').slice(0, 120))
    const shot = screenshot ? await page.screenshot({ type: 'png' }).catch(() => null) : null
    return {
      html,
      finalUrl: page.url(),
      status: 200,
      textLength,
      textSample,
      screenshot: shot ? Buffer.from(shot) : null,
      interactions: [],
    }
  } catch {
    return null
  } finally {
    await ctx.close().catch(() => {})
  }
}

export function looksLikeNotFound(text: string): boolean {
  const t = text.trim().toLowerCase().slice(0, 120)
  return /^404\b/.test(t) || /^not found/.test(t) || /^page not found/.test(t) || /^404\s*\|?\s*not found/.test(t)
}
