'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { AnalysisPanel } from './analysis-panel'
import type { ClonePageInfo, CloneMeta } from '@/lib/cloner/types'
import { formatBytes, hostnameOf, safeJson, sleep, type CloneResponse, type JobStateUi } from './shared'
import {
  AlertTriangle, Check, Code2, Copy, Download, ExternalLink,
  FileArchive, Info, Layers, Loader2, Monitor, MousePointerClick,
  Package, RefreshCw, ShieldAlert, Smartphone, Sparkles, SplitSquareHorizontal, Tablet, Wand2,
} from 'lucide-react'

interface RebuildData {
  code: string
  react: string | null
  previewHtml: string
}

const REBUILD_STEPS = [
  'Reading the captured DOM…',
  'Extracting design tokens…',
  'Rebuilding layout with Tailwind…',
  'Generating React component…',
  'Polishing the code…',
]

interface WorkspaceProps {
  result: Pick<CloneResponse, 'id' | 'meta' | 'htmlPreview' | 'htmlTruncated' | 'htmlSize'>
  onNewClone: () => void
}

type Device = 'desktop' | 'tablet' | 'mobile'

const DEVICE_CLASS: Record<Device, string> = {
  desktop: 'w-full',
  tablet: 'w-full max-w-[768px]',
  mobile: 'w-full max-w-[390px]',
}

function pageLabel(p: ClonePageInfo): string {
  if (p.kind === 'entry') return 'Main page'
  if (p.kind === 'state') return `State · ${p.interactionLabel ?? 'interaction'}`
  try {
    return new URL(p.sourceUrl).pathname
  } catch {
    return p.slug
  }
}

export function Workspace({ result, onNewClone }: WorkspaceProps) {
  const { id, meta, htmlPreview, htmlTruncated, htmlSize } = result
  const pages: ClonePageInfo[] = meta.pages ?? []
  const [activeSlug, setActiveSlug] = useState(pages[0]?.slug ?? 'index')
  const [device, setDevice] = useState<Device>('desktop')
  const [iframeKey, setIframeKey] = useState(0)
  const [copied, setCopied] = useState(false)
  const [zipLoading, setZipLoading] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)
  const [codeText, setCodeText] = useState<string | null>(null)
  const [codeTruncated, setCodeTruncated] = useState(false)
  const [rebuild, setRebuild] = useState<RebuildData | null>(null)
  const [rebuildLoading, setRebuildLoading] = useState(false)
  const [rebuildError, setRebuildError] = useState<string | null>(null)
  const [rebuildStep, setRebuildStep] = useState(0)
  const [rebuildView, setRebuildView] = useState<'preview' | 'html' | 'react'>('preview')
  // BYOK — optional per-request AI credentials; kept in memory only, never stored
  const [byokKey, setByokKey] = useState('')
  const [byokBase, setByokBase] = useState('')
  const [byokModel, setByokModel] = useState('')
  const previewBase = `/api/preview/${id}`
  const previewUrl = `${previewBase}?page=${activeSlug}`
  const shotUrl = `/api/screenshot/${id}?page=${activeSlug}`
  const activePage = useMemo(() => pages.find((p) => p.slug === activeSlug), [pages, activeSlug])

  useEffect(() => {
    setActiveSlug(pages[0]?.slug ?? 'index')
    setDevice('desktop')
    setIframeKey((k) => k + 1)
    setCodeText(htmlPreview || null)
    setCodeTruncated(htmlTruncated)
    setRebuild(null)
    setRebuildError(null)
  }, [id])

  useEffect(() => {
    setIframeKey((k) => k + 1)
    setCodeText(null)
    setCodeTruncated(false)
    setRebuild(null)
    setRebuildError(null)
    setRebuildView('preview')
  }, [activeSlug])

  // rotate progress messages while the AI is working
  useEffect(() => {
    if (!rebuildLoading) return
    const t = setInterval(() => setRebuildStep((s) => (s + 1) % REBUILD_STEPS.length), 3200)
    return () => clearInterval(t)
  }, [rebuildLoading])

  const ensureRebuild = useCallback(async () => {
    if (rebuildLoading) return
    setRebuildLoading(true)
    setRebuildError(null)
    try {
      // 1. cached?
      let res = await fetch(`/api/rebuild/${id}?page=${activeSlug}`)
      let data = await safeJson<{ exists: boolean; error?: string; jobId?: string; code?: string; react?: string | null; previewHtml?: string }>(res)

      // 2. not cached -> start the background rebuild job, then poll it.
      //    The job pattern keeps every HTTP request short so no gateway can
      //    kill a multi-minute rebuild (which used to surface as a broken
      //    JSON parse error in the UI).
      if (!data.exists && res.status === 404) {
        const headers: Record<string, string> = {}
        if (byokKey.trim()) {
          headers['x-byok-key'] = byokKey.trim()
          if (byokBase.trim()) headers['x-byok-baseurl'] = byokBase.trim()
          if (byokModel.trim()) headers['x-byok-model'] = byokModel.trim()
        }
        const startRes = await fetch(`/api/rebuild/${id}?page=${activeSlug}`, { method: 'POST', headers })
        const start = await safeJson<{ jobId?: string; error?: string }>(startRes)
        if (!startRes.ok || !start.jobId) {
          throw new Error(start.error || `Could not start the rebuild (HTTP ${startRes.status}).`)
        }
        const deadline = Date.now() + 10 * 60 * 1000
        let consecutiveFailures = 0
        let done: JobStateUi | null = null
        while (Date.now() < deadline) {
          await sleep(2000)
          try {
            const jobRes = await fetch(`/api/jobs/${start.jobId}`)
            const jobData = await safeJson<{ ok: boolean; job?: JobStateUi }>(jobRes)
            if (jobData.ok && jobData.job) {
              consecutiveFailures = 0
              done = jobData.job
              const idx = REBUILD_STEPS.findIndex((s) => jobData.job!.message.startsWith(s.slice(0, 10)))
              if (idx >= 0) setRebuildStep(idx)
              if (jobData.job.status === 'done' || jobData.job.status === 'error') break
            }
          } catch {
            consecutiveFailures++
            if (consecutiveFailures >= 8) throw new Error('Lost contact with the server while rebuilding.')
          }
        }
        if (!done) throw new Error('The AI rebuild timed out after 10 minutes.')
        if (done.status === 'error') throw new Error(done.error || 'AI rebuild failed.')

        // 3. job finished -> read the persisted rebuild
        res = await fetch(`/api/rebuild/${id}?page=${activeSlug}`)
        data = await safeJson<{ exists: boolean; code?: string; react?: string | null; previewHtml?: string; error?: string }>(res)
      }

      if (!res.ok || !data.exists || !data.code) {
        throw new Error(data.error ?? 'Rebuild unavailable.')
      }
      setRebuild({ code: data.code, react: data.react ?? null, previewHtml: data.previewHtml ?? '' })
      setRebuildStep(REBUILD_STEPS.length - 1)
    } catch (e) {
      setRebuildError(e instanceof Error ? e.message : 'AI rebuild failed.')
    } finally {
      setRebuildLoading(false)
    }
  }, [id, activeSlug, rebuildLoading])

  const copyRebuild = async (text: string | null, label: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied to clipboard`)
    } catch {
      toast.error('Could not copy to clipboard.')
    }
  }

  const loadCode = useCallback(async () => {
    if (codeText) return
    setCodeLoading(true)
    try {
      const res = await fetch(`/api/download/${id}?format=single&page=${activeSlug}`)
      if (!res.ok) throw new Error('fetch failed')
      const text = await res.text()
      const truncated = text.length > 300_000
      setCodeText(truncated ? text.slice(0, 300_000) : text)
      setCodeTruncated(truncated)
    } catch {
      toast.error('Could not load the HTML source.')
    } finally {
      setCodeLoading(false)
    }
  }, [id, activeSlug, codeText])

  const copyHtml = async () => {
    try {
      const res = await fetch(`/api/download/${id}?format=single&page=${activeSlug}`)
      if (!res.ok) throw new Error()
      const text = await res.text()
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Full HTML copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy — try the download button instead.')
    }
  }

  const downloadZip = () => {
    setZipLoading(true)
    toast.info('Packaging mirror ZIP…')
    window.location.href = `/api/download/${id}?format=zip`
    setTimeout(() => setZipLoading(false), 2500)
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto w-full max-w-7xl px-4 py-6"
      aria-label="Clone workspace"
    >
      {/* header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/15">
              <Check className="mr-1 h-3 w-3" aria-hidden /> Clone ready
            </Badge>
            {meta.rendered && (
              <Badge variant="outline" className="gap-1 border-teal-500/40 bg-teal-500/10 text-[11px] text-teal-300">
                <Monitor className="h-3 w-3" aria-hidden /> Chromium-rendered
              </Badge>
            )}
            {pages.length > 1 && (
              <Badge variant="outline" className="gap-1 border-zinc-700 text-[11px] text-zinc-300">
                <Layers className="h-3 w-3" aria-hidden /> {pages.length} captures
              </Badge>
            )}
            <span className="text-xs text-zinc-500">{hostnameOf(meta.finalUrl)}</span>
          </div>
          <h2 className="mt-1.5 truncate text-lg font-semibold text-zinc-100 sm:text-xl">{meta.title}</h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={downloadZip}
            disabled={zipLoading}
            className="gap-1.5 bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            {zipLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FileArchive className="h-3.5 w-3.5" aria-hidden />}
            Mirror ZIP
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`/api/download/${id}?format=single&page=${activeSlug}`, '_blank')}
            className="gap-1.5 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Single HTML
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={copyHtml}
            className="gap-1.5 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-zinc-100"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            Copy HTML
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onNewClone}
            className="gap-1.5 text-zinc-400 hover:text-zinc-100"
          >
            <Package className="h-3.5 w-3.5" aria-hidden />
            New clone
          </Button>
        </div>
      </div>

      {/* auto-heal notice */}
      {meta.autoHealed && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-teal-500/30 bg-teal-500/10 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" aria-hidden />
          <div className="text-sm">
            <p className="font-medium text-teal-200">Auto-healing engaged</p>
            <p className="mt-0.5 text-teal-200/70">{meta.autoHealed.note}</p>
          </div>
        </div>
      )}

      {/* warnings */}
      {meta.warnings.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
          <ul className="list-inside list-disc space-y-1 text-sm text-amber-200/90">
            {meta.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      {meta.analysis.jsRendered && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
          <div className="text-sm">
            <p className="font-medium text-amber-200">This site renders its content with JavaScript.</p>
            <p className="mt-0.5 text-amber-200/70">
              The static clone may look empty. Try the <strong>“Always render”</strong> engine for browser-captured fidelity.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="order-2 lg:order-1" aria-label="Analysis">
          <AnalysisPanel meta={meta} />
        </aside>

        <div className="order-1 min-w-0 lg:order-2">
          {/* page/state selector */}
          {pages.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Captured pages">
              {pages.map((p) => (
                <button
                  key={p.slug}
                  role="tab"
                  aria-selected={activeSlug === p.slug}
                  onClick={() => setActiveSlug(p.slug)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeSlug === p.slug
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                      : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {p.kind === 'state' ? (
                    <MousePointerClick className="h-3 w-3" aria-hidden />
                  ) : (
                    <Layers className="h-3 w-3" aria-hidden />
                  )}
                  {pageLabel(p)}
                </button>
              ))}
            </div>
          )}

          <Tabs defaultValue="preview" onValueChange={(v) => v === 'code' && loadCode()}>
            <TabsList className="mb-3 grid w-full max-w-[480px] grid-cols-4 border border-zinc-800 bg-zinc-900">
              <TabsTrigger value="preview" className="gap-1 px-1 text-[10px] sm:text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-300">
                <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="hidden sm:inline">Preview</span>
              </TabsTrigger>
              <TabsTrigger value="compare" className="gap-1 px-1 text-[10px] sm:text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-300">
                <SplitSquareHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="hidden sm:inline">Compare</span>
              </TabsTrigger>
              <TabsTrigger value="code" className="gap-1 px-1 text-[10px] sm:text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-300">
                <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="hidden sm:inline">Code</span>
              </TabsTrigger>
              <TabsTrigger value="rebuild" className="gap-1 px-1 text-[10px] sm:text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-300">
                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="sm:hidden">AI</span> <span className="hidden sm:inline">AI Rebuild</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="preview" className="mt-0">
              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
                <div className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/80 px-3 py-2">
                  <div className="flex items-center gap-1" role="group" aria-label="Preview viewport size">
                    {(
                      [
                        ['desktop', Monitor],
                        ['tablet', Tablet],
                        ['mobile', Smartphone],
                      ] as const
                    ).map(([d, Icon]) => (
                      <button
                        key={d}
                        onClick={() => setDevice(d)}
                        aria-label={`${d} viewport`}
                        aria-pressed={device === d}
                        className={`rounded-md p-2 transition-colors ${
                          device === d
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </button>
                    ))}
                    <span className="ml-1 hidden font-mono text-[10px] text-zinc-600 sm:inline">
                      {device === 'desktop' ? '1280+' : device === 'tablet' ? '768' : '390'}px
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="hidden max-w-[240px] truncate rounded-md bg-zinc-950 px-2.5 py-1 font-mono text-[10px] text-zinc-500 md:inline">
                      {previewUrl}
                    </span>
                    <button
                      onClick={() => setIframeKey((k) => k + 1)}
                      aria-label="Reload preview"
                      className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden />
                    </button>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open preview in new tab"
                      className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </a>
                  </div>
                </div>
                <div className="flex justify-center bg-zinc-950 p-0 sm:p-4">
                  <iframe
                    key={`${iframeKey}-${activeSlug}`}
                    src={previewUrl}
                    title={`Cloned preview${activePage ? ` of ${activePage.title}` : ''}`}
                    className={`h-[62vh] min-h-[440px] border-0 bg-white transition-all duration-300 sm:rounded-lg sm:shadow-2xl sm:shadow-black/60 ${DEVICE_CLASS[device]}`}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="compare" className="mt-0">
              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
                <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 py-2">
                  <span className="text-xs text-zinc-400">Original (live screenshot) vs Clone (served locally)</span>
                  <a
                    href={shotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-emerald-400 hover:text-emerald-300"
                  >
                    Open original ↗
                  </a>
                </div>
                <div className="grid gap-0 bg-zinc-950 md:grid-cols-2">
                  <div className="border-b border-zinc-800 p-3 md:border-b-0 md:border-r">
                    <p className="mb-2 text-center text-[10px] uppercase tracking-wider text-zinc-600">Original</p>
                    <div className="flex h-[52vh] min-h-[360px] items-start justify-center overflow-hidden rounded-lg border border-zinc-800 bg-white">
                      <img
                        src={shotUrl}
                        alt={`Original screenshot of ${activePage?.title ?? meta.title}`}
                        className="w-full object-cover object-top"
                      />
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="mb-2 text-center text-[10px] uppercase tracking-wider text-zinc-600">Clone</p>
                    <div className="flex h-[52vh] min-h-[360px] items-start justify-center overflow-hidden rounded-lg border border-zinc-800 bg-white">
                      <iframe
                        key={`cmp-${iframeKey}-${activeSlug}`}
                        src={previewUrl}
                        title={`Clone comparison of ${activePage?.title ?? meta.title}`}
                        className="h-full w-full border-0"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="code" className="mt-0">
              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 py-2">
                  <span className="font-mono text-xs text-zinc-500">
                    {activeSlug}.html
                    {codeText && ` · ${formatBytes(new Blob([codeText]).size)}`}
                    {codeTruncated && ' · showing first 300 KB'}
                  </span>
                  {codeLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" aria-hidden />
                  ) : (
                    <button
                      onClick={copyHtml}
                      aria-label="Copy HTML source"
                      className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </div>
                <pre className="cloner-scroll max-h-[62vh] min-h-[440px] overflow-auto p-4 font-mono text-[11px] leading-relaxed text-zinc-400">
                  <code>{codeLoading ? 'Loading source…' : codeText ?? 'Open the Code tab to load the source.'}</code>
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="rebuild" className="mt-0">
              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
                {rebuildLoading && (
                  <div className="flex h-[62vh] min-h-[440px] flex-col items-center justify-center gap-4 bg-zinc-950">
                    <div className="relative">
                      <Sparkles className="h-10 w-10 animate-pulse text-emerald-400" aria-hidden />
                      <span className="absolute -inset-4 animate-ping rounded-full border border-emerald-500/20" aria-hidden />
                    </div>
                    <p className="text-sm font-medium text-zinc-200">{REBUILD_STEPS[rebuildStep]}</p>
                    <p className="max-w-sm text-center text-xs text-zinc-500">
                      The AI is rewriting the captured page as clean semantic code — this typically takes 1–3 minutes.
                    </p>
                  </div>
                )}

                {!rebuildLoading && rebuildError && (
                  <div className="flex h-[62vh] min-h-[440px] flex-col items-center justify-center gap-4 bg-zinc-950 p-6">
                    <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden />
                    <p className="max-w-md text-center text-sm text-zinc-300">{rebuildError}</p>
                    <Button size="sm" onClick={ensureRebuild} className="gap-1.5 bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400">
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry rebuild
                    </Button>
                  </div>
                )}

                {!rebuildLoading && !rebuildError && rebuild && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/80 px-3 py-2">
                      <div className="flex items-center gap-1" role="tablist" aria-label="Rebuild output view">
                        {(
                          [
                            ['preview', Monitor, 'Preview'],
                            ['html', Code2, 'HTML + Tailwind'],
                            ['react', Wand2, 'React'],
                          ] as const
                        ).map(([v, Icon, label]) => (
                          <button
                            key={v}
                            role="tab"
                            aria-selected={rebuildView === v}
                            onClick={() => setRebuildView(v)}
                            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                              rebuildView === v
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                            }`}
                          >
                            <Icon className="mr-1 inline h-3 w-3" aria-hidden />
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => copyRebuild(rebuildView === 'react' ? rebuild.react : rebuild.code, rebuildView === 'react' ? 'React component' : 'HTML')}
                          aria-label="Copy rebuilt code"
                          className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                        >
                          <Copy className="h-4 w-4" aria-hidden />
                        </button>
                        <a
                          href={`/api/download/${id}?format=rebuild&page=${activeSlug}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Download rebuilt HTML"
                          className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                        >
                          <Download className="h-4 w-4" aria-hidden />
                        </a>
                      </div>
                    </div>

                    {rebuildView === 'preview' && (
                      <div className="flex justify-center bg-zinc-950 p-0 sm:p-4">
                        <iframe
                          srcDoc={rebuild.previewHtml}
                          title="AI rebuilt page preview"
                          sandbox="allow-same-origin"
                          className="h-[62vh] min-h-[440px] w-full border-0 bg-white transition-all duration-300 sm:rounded-lg sm:shadow-2xl sm:shadow-black/60"
                        />
                      </div>
                    )}

                    {rebuildView === 'html' && (
                      <pre className="cloner-scroll max-h-[62vh] min-h-[440px] overflow-auto bg-zinc-950 p-4 font-mono text-[11px] leading-relaxed text-emerald-200/80">
                        <code>{rebuild.code}</code>
                      </pre>
                    )}

                    {rebuildView === 'react' && (
                      <pre className="cloner-scroll max-h-[62vh] min-h-[440px] overflow-auto bg-zinc-950 p-4 font-mono text-[11px] leading-relaxed text-sky-200/80">
                        <code>{rebuild.react ?? 'React output unavailable for this page.'}</code>
                      </pre>
                    )}

                    <div className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-900/60 px-4 py-2">
                      <Sparkles className="h-3 w-3 text-emerald-500" aria-hidden />
                      <p className="text-[11px] text-zinc-500">
                        Generated by AI from the captured DOM — clean Tailwind utilities, semantic tags, no trackers. Review before production use.
                      </p>
                    </div>
                  </>
                )}

                {!rebuildLoading && !rebuildError && !rebuild && (
                  <div className="flex h-[62vh] min-h-[440px] flex-col items-center justify-center gap-4 bg-zinc-950 p-6">
                    <Sparkles className="h-8 w-8 text-emerald-400" aria-hidden />
                    <p className="text-sm font-medium text-zinc-200">Rebuild this page with AI</p>
                    <p className="max-w-md text-center text-xs text-zinc-500">
                      The engine will convert the captured DOM into clean, hand-readable HTML with Tailwind CSS — plus a React component — instead of the raw site dump.
                    </p>
                    <Button size="sm" onClick={ensureRebuild} className="gap-1.5 bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden /> Rebuild with AI
                    </Button>
                    <details className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                      <summary className="cursor-pointer select-none text-xs text-zinc-500 transition-colors hover:text-zinc-300">
                        Advanced — bring your own AI key (optional)
                      </summary>
                      <div className="mt-2.5 space-y-2">
                        <Input
                          type="password"
                          value={byokKey}
                          onChange={(e) => setByokKey(e.target.value)}
                          placeholder="OpenAI-compatible API key (sk-…)"
                          autoComplete="off"
                          className="h-8 border-zinc-800 bg-zinc-950 text-[11px]"
                        />
                        <div className="flex gap-2">
                          <Input
                            value={byokBase}
                            onChange={(e) => setByokBase(e.target.value)}
                            placeholder="Base URL (optional)"
                            autoComplete="off"
                            className="h-8 border-zinc-800 bg-zinc-950 text-[11px]"
                          />
                          <Input
                            value={byokModel}
                            onChange={(e) => setByokModel(e.target.value)}
                            placeholder="Model (optional)"
                            autoComplete="off"
                            className="h-8 border-zinc-800 bg-zinc-950 text-[11px]"
                          />
                        </div>
                        <p className="text-[10px] leading-relaxed text-zinc-600">
                          Used only for this rebuild and sent as a request header — never stored. Works with any
                          OpenAI-compatible endpoint (OpenAI, Gemini, Groq, DeepSeek, local Ollama). Leave empty to
                          use the server&apos;s built-in model.
                        </p>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </motion.section>
  )
}
