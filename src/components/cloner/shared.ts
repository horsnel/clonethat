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
