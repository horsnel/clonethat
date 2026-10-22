import type { CloneMeta } from '@/lib/cloner/types'

export interface CloneResponse {
  ok: boolean
  id: string
  meta: CloneMeta
  htmlPreview: string
  htmlTruncated: boolean
  htmlSize: number
  error?: string
}

export interface CloneListItem {
  id: string
  title: string
  sourceUrl: string
  finalUrl: string
  createdAt: number
  totalBytes: number
  requests: number
  stackCount: number
  pageCount: number
  rendered: boolean
}

export type RenderModeUi = 'auto' | 'browser' | 'static'

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Parse a fetch Response as JSON without ever throwing the notorious
 * `Unexpected token 'I', "Internal S"...` error — if the server (or a proxy
 * in front of it) answers with plain text / HTML, surface a clear message.
 */
export async function safeJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    const hint = text.slice(0, 80).replace(/\s+/g, ' ').trim()
    throw new Error(
      res.ok
        ? 'The server returned an unexpected response. Please try again.'
        : `Request failed (HTTP ${res.status})${hint ? `: ${hint}` : '.'}`,
    )
  }
}

/** Minimal shape of the job state returned by GET /api/jobs/<id>. */
export interface JobStateUi {
  id: string
  kind: 'clone' | 'rebuild'
  label: string
  status: 'running' | 'done' | 'error'
  step: number
  totalSteps: number
  message: string
  error?: string
  cloneId?: string
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
