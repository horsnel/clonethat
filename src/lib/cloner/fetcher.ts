import { PAGE_TIMEOUT_MS, ASSET_TIMEOUT_MS } from './types'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export interface FetchResult {
  ok: boolean
  status: number
  url: string
  body: Buffer | null
  contentType: string
  error?: string
}

interface FetchOpts {
  timeoutMs?: number
  maxBytes?: number
  referer?: string
  accept?: string
}

export async function fetchResource(url: string, opts: FetchOpts = {}): Promise<FetchResult> {
  const { timeoutMs = ASSET_TIMEOUT_MS, maxBytes = Infinity, referer, accept } = opts
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: accept ?? '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(referer ? { Referer: referer } : {}),
      },
    })
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
    const buf = Buffer.from(await res.arrayBuffer())
    return {
      ok: res.ok,
      status: res.status,
      url: res.url || url,
      body: buf.length <= maxBytes ? buf : buf.subarray(0, maxBytes),
      contentType,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, status: 0, url, body: null, contentType: '', error: msg }
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchPage(url: string): Promise<FetchResult> {
  return fetchResource(url, {
    timeoutMs: PAGE_TIMEOUT_MS,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  })
}

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /\.local$/i,
  /\.internal$/i,
]

export function validateTargetUrl(raw: string): { url: string | null; error?: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { url: null, error: 'Please enter a URL.' }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withProtocol)
  } catch {
    return { url: null, error: 'That does not look like a valid URL.' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { url: null, error: 'Only http and https URLs are supported.' }
  }
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(parsed.hostname))) {
    return { url: null, error: 'Local and private addresses are not allowed.' }
  }
  return { url: parsed.toString() }
}
