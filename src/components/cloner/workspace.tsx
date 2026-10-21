'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { AnalysisPanel } from './analysis-panel'
import type { CloneMeta } from '@/lib/cloner/types'
import { formatBytes, hostnameOf, type CloneResponse } from './shared'
import {
  AlertTriangle, Check, Code2, Copy, Download, ExternalLink,
  FileArchive, Loader2, Monitor, Package, RefreshCw, Smartphone, Tablet,
} from 'lucide-react'

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

export function Workspace({ result, onNewClone }: WorkspaceProps) {
  const { id, meta, htmlPreview, htmlTruncated, htmlSize } = result
  const [device, setDevice] = useState<Device>('desktop')
  const [iframeKey, setIframeKey] = useState(0)
  const [copied, setCopied] = useState(false)
  const [zipLoading, setZipLoading] = useState(false)
  const [codeText, setCodeText] = useState<string | null>(htmlPreview)
  const [codeTruncated, setCodeTruncated] = useState(htmlTruncated)
  const [codeLoading, setCodeLoading] = useState(false)
  const previewUrl = `/api/preview/${id}`
  const codeCache = useRef<string | null>(htmlPreview)

  const loadCode = useCallback(async () => {
    if (codeCache.current) return
    setCodeLoading(true)
    try {
      const res = await fetch(`/api/download/${id}?format=single`)
      if (!res.ok) throw new Error('fetch failed')
      const text = await res.text()
      const truncated = text.length > 300_000
      codeCache.current = truncated ? text.slice(0, 300_000) : text
      setCodeText(codeCache.current)
      setCodeTruncated(truncated)
    } catch {
      toast.error('Could not load the HTML source.')
    } finally {
      setCodeLoading(false)
    }
  }, [id])

  useEffect(() => {
    // reset per-clone caches when the clone changes
    codeCache.current = htmlPreview || null
    setCodeText(htmlPreview || null)
    setCodeTruncated(htmlTruncated)
    setDevice('desktop')
    setIframeKey((k) => k + 1)
  }, [id, htmlPreview, htmlTruncated])

  const copyHtml = async () => {
    try {
      let text = codeCache.current
      if (!text || htmlTruncated) {
        const res = await fetch(`/api/download/${id}?format=single`)
        if (!res.ok) throw new Error()
        text = await res.text()
      }
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
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/15">
              <Check className="mr-1 h-3 w-3" aria-hidden /> Clone ready
            </Badge>
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
            onClick={() => window.open(`/api/download/${id}?format=single`, '_blank')}
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

      {meta.analysis.jsRendered && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
          <div className="text-sm">
            <p className="font-medium text-amber-200">This site renders its content with JavaScript.</p>
            <p className="mt-0.5 text-amber-200/70">
              The static clone may look empty. Re-clone with <strong>“Run JavaScript”</strong> enabled for
              closer fidelity, or expect mostly framework scaffolding here.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* analysis sidebar */}
        <aside className="order-2 lg:order-1" aria-label="Analysis">
          <AnalysisPanel meta={meta} />
        </aside>

        {/* preview + code */}
        <div className="order-1 min-w-0 lg:order-2">
          <Tabs defaultValue="preview" onValueChange={(v) => v === 'code' && loadCode()}>
            <TabsList className="mb-3 grid w-full max-w-[280px] grid-cols-2 bg-zinc-900 border border-zinc-800">
              <TabsTrigger value="preview" className="gap-1.5 data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-300">
                <Monitor className="h-3.5 w-3.5" aria-hidden /> Preview
              </TabsTrigger>
              <TabsTrigger value="code" className="gap-1.5 data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-300">
                <Code2 className="h-3.5 w-3.5" aria-hidden /> Code
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
                    key={iframeKey}
                    src={previewUrl}
                    title={`Cloned preview of ${meta.title}`}
                    className={`h-[62vh] min-h-[440px] border-0 bg-white transition-all duration-300 sm:rounded-lg sm:shadow-2xl sm:shadow-black/60 ${DEVICE_CLASS[device]}`}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="code" className="mt-0">
              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 py-2">
                  <span className="font-mono text-xs text-zinc-500">
                    index.html · {formatBytes(htmlSize)}
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
                  <code>{codeLoading ? 'Loading source…' : codeText ?? 'No source available.'}</code>
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </motion.section>
  )
}
