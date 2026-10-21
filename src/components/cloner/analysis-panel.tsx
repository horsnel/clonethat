'use client'

import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { CloneMeta, StackItem } from '@/lib/cloner/types'
import { formatBytes } from './shared'
import {
  FileCode2, FileType2, Globe2, Image as ImageIcon, Layers, Palette,
  Signal, Type, Weight, Braces,
} from 'lucide-react'

const CATEGORY_STYLE: Record<StackItem['category'], string> = {
  framework: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  cms: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  builder: 'text-violet-300 border-violet-500/40 bg-violet-500/10',
  css: 'text-teal-300 border-teal-500/40 bg-teal-500/10',
  library: 'text-lime-300 border-lime-500/40 bg-lime-500/10',
  analytics: 'text-rose-300 border-rose-500/40 bg-rose-500/10',
  infra: 'text-zinc-300 border-zinc-600/60 bg-zinc-500/10',
}

const TYPE_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  style: FileCode2,
  script: Braces,
  font: Type,
  media: Signal,
  icon: ImageIcon,
  other: Layers,
}

export function AnalysisPanel({ meta }: { meta: CloneMeta }) {
  const { analysis, stats, assets } = meta

  const copyHex = (hex: string) => {
    navigator.clipboard.writeText(hex).then(
      () => toast.success(`${hex} copied`),
      () => toast.error('Clipboard unavailable')
    )
  }

  const statItems = [
    { icon: Weight, label: 'Cloned weight', value: formatBytes(stats.totalBytes) },
    { icon: Signal, label: 'Requests', value: String(stats.requests) },
    { icon: ImageIcon, label: 'Images', value: String(stats.counts.image) },
    { icon: FileCode2, label: 'Stylesheets', value: String(stats.counts.style) },
    { icon: Type, label: 'Fonts', value: String(stats.counts.font) },
    { icon: Globe2, label: 'Domains', value: String(stats.domains.length) },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-zinc-800/80 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <Layers className="h-4 w-4 text-emerald-400" aria-hidden />
            Site profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-zinc-100">{meta.title}</p>
          <a
            href={meta.finalUrl}
            target="_blank"
            rel="noreferrer"
            className="block truncate font-mono text-xs text-emerald-400/90 hover:text-emerald-300 hover:underline"
          >
            {meta.finalUrl}
          </a>
          {analysis.description && (
            <p className="line-clamp-3 text-xs leading-relaxed text-zinc-500">{analysis.description}</p>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {analysis.lang && <Badge variant="outline" className="text-[10px] text-zinc-400">{analysis.lang}</Badge>}
            <Badge variant="outline" className="text-[10px] text-zinc-400">
              {formatBytes(stats.singleBytes)} single-file
            </Badge>
            <Badge variant="outline" className="text-[10px] text-zinc-400">
              {(stats.durationMs / 1000).toFixed(1)}s clone
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-800/80 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <Braces className="h-4 w-4 text-emerald-400" aria-hidden />
            Tech stack
            <Badge variant="secondary" className="ml-auto bg-zinc-800 text-[10px] text-zinc-400">
              {analysis.stack.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {analysis.stack.length === 0 ? (
            <p className="text-xs text-zinc-500">No known technologies detected — a hand-crafted site.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {analysis.stack.map((s) => (
                <Badge
                  key={s.name}
                  variant="outline"
                  className={`text-[11px] font-medium ${CATEGORY_STYLE[s.category]}`}
                >
                  {s.name}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {analysis.colors.length > 0 && (
        <Card className="border-zinc-800/80 bg-zinc-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <Palette className="h-4 w-4 text-emerald-400" aria-hidden />
              Color palette
              <span className="ml-auto text-[10px] font-normal text-zinc-600">click to copy</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-6 gap-1.5" role="list" aria-label="Extracted colors">
              {analysis.colors.map((c) => (
                <button
                  key={c.hex}
                  role="listitem"
                  title={`${c.hex} · ${c.count} uses`}
                  onClick={() => copyHex(c.hex)}
                  className="group relative h-9 rounded-md border border-zinc-700/60 transition-transform hover:scale-110 hover:border-zinc-500"
                  style={{ backgroundColor: c.hex }}
                  aria-label={`Copy color ${c.hex}`}
                >
                  <span className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200 opacity-0 shadow transition-opacity group-hover:opacity-100">
                    {c.hex}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {analysis.fonts.length > 0 && (
        <Card className="border-zinc-800/80 bg-zinc-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <Type className="h-4 w-4 text-emerald-400" aria-hidden />
              Typography
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {analysis.fonts.map((f) => {
              const max = analysis.fonts[0].count || 1
              return (
                <div key={f.family} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-zinc-200" style={{ fontFamily: `"${f.family}", sans-serif` }}>
                      {f.family}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-zinc-600">{f.count}×</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-emerald-500/70"
                      style={{ width: `${Math.max(8, (f.count / max) * 100)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      <Card className="border-zinc-800/80 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-zinc-300">Clone stats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {statItems.map((item) => (
              <div key={item.label} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
                  <item.icon className="h-3 w-3" aria-hidden />
                  {item.label}
                </div>
                <p className="mt-1 font-mono text-sm font-semibold text-zinc-100">{item.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {assets.length > 0 && (
        <Card className="border-zinc-800/80 bg-zinc-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <FileType2 className="h-4 w-4 text-emerald-400" aria-hidden />
              Assets
              <Badge variant="secondary" className="ml-auto bg-zinc-800 text-[10px] text-zinc-400">
                {assets.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="cloner-scroll max-h-96 overflow-y-auto px-6 pb-4">
              {assets.slice(0, 50).map((a) => {
                const Icon = TYPE_ICON[a.type] ?? Layers
                return (
                  <div key={a.url} className="flex items-center gap-2.5 border-b border-zinc-800/60 py-2 last:border-0">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[11px] text-zinc-400" title={a.url}>
                        {a.url.split('/').pop()?.slice(0, 40) || a.url}
                      </p>
                      <p className="truncate text-[10px] text-zinc-600">
                        {a.inlined ? 'inlined' : a.path} · {a.type}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-zinc-500">{formatBytes(a.size)}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {stats.domains.length > 1 && (
        <>
          <Separator className="bg-zinc-800/60" />
          <p className="px-1 text-[10px] leading-relaxed text-zinc-600">
            External domains: {stats.domains.slice(1, 6).join(', ')}
            {stats.domains.length > 6 ? ` +${stats.domains.length - 6} more` : ''}
          </p>
        </>
      )}
    </div>
  )
}
