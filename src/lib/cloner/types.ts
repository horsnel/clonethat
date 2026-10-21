export type AssetType = 'image' | 'style' | 'script' | 'font' | 'media' | 'icon' | 'other'

export type RenderMode = 'auto' | 'static' | 'browser'

export interface DownloadedAsset {
  url: string
  buffer: Buffer
  contentType: string
  ext: string
  hash: string
  size: number
}

export interface CloneAssetInfo {
  url: string
  path: string
  type: AssetType
  size: number
  ext: string
  inlined: boolean
}

export interface StackItem {
  name: string
  category: 'framework' | 'cms' | 'builder' | 'css' | 'library' | 'analytics' | 'infra'
}

export interface ColorInfo {
  hex: string
  count: number
}

export interface FontInfo {
  family: string
  count: number
}

export interface Analysis {
  title: string
  description: string
  lang: string
  finalUrl: string
  ogImage: string
  favicon: string
  stack: StackItem[]
  colors: ColorInfo[]
  fonts: FontInfo[]
  jsRendered: boolean
}

export interface CloneStats {
  htmlBytes: number
  singleBytes: number
  totalBytes: number
  requests: number
  counts: Record<AssetType, number>
  domains: string[]
  textLength: number
  durationMs: number
}

export type PageKind = 'entry' | 'state' | 'page'

export interface ClonePageInfo {
  slug: string
  title: string
  sourceUrl: string
  kind: PageKind
  interactionLabel?: string
  hasScreenshot: boolean
  textLength: number
}

export interface CloneMeta {
  id: string
  sourceUrl: string
  finalUrl: string
  title: string
  keepScripts: boolean
  createdAt: number
  renderMode: RenderMode
  rendered: boolean
  autoHealed: { from: string; to: string; note: string } | null
  warnings: string[]
  robotsRestricted: boolean
  analysis: Analysis
  stats: CloneStats
  assets: CloneAssetInfo[]
  pages: ClonePageInfo[]
}

export interface CloneResult {
  meta: CloneMeta
  singleHtml: string
  mirrorHtml: string
  files: Map<string, Buffer>
  singles: Map<string, string>
  shots: Map<string, Buffer>
}

export interface CloneOptions {
  url: string
  keepScripts: boolean
  renderMode: RenderMode
  crawl: boolean
}

export const ASSET_BUDGET = {
  maxAssets: 500,
  maxTotalBytes: 80 * 1024 * 1024,
  maxAssetBytes: 8 * 1024 * 1024,
  inlineCapBytes: 3 * 1024 * 1024,
}

export const PAGE_TIMEOUT_MS = 25_000
export const ASSET_TIMEOUT_MS = 12_000

export const MAX_CRAWL_PAGES = 4
export const MAX_INTERACTION_STATES = 2
