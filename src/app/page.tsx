'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Hero } from '@/components/cloner/hero'
import { Workspace } from '@/components/cloner/workspace'
import type { CloneResponse, CloneListItem } from '@/components/cloner/shared'
import { formatBytes, formatDate, hostnameOf } from '@/components/cloner/shared'
import { Check, Globe, History, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react'

type View = { kind: 'idle' } | { kind: 'cloning' } | { kind: 'done'; result: CloneResponse }

const STEPS = [
  'Fetching page & following redirects',
  'Downloading images, fonts & stylesheets',
  'Rewriting URLs & inlining assets',
  'Analyzing tech stack & design tokens',
  'Packaging single-file and mirror exports',
]

export default function Home() {
  const [view, setView] = useState<View>({ kind: 'idle' })
  const [progressStep, setProgressStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<CloneListItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const lastUrl = useRef('')

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/clones')
      const data = await res.json()
      if (data.ok) setHistory(data.clones)
    } catch {
      /* history is best-effort */
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  useEffect(() => {
    if (view.kind !== 'cloning') return
    setProgressStep(0)
    const timer = setInterval(() => {
      setProgressStep((s) => Math.min(s + 1, STEPS.length - 2))
    }, 1600)
    return () => clearInterval(timer)
  }, [view.kind])

  const clone = useCallback(async (url: string, keepScripts: boolean) => {
    lastUrl.current = url
    setError(null)
    setView({ kind: 'cloning' })
    try {
      const res = await fetch('/api/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, keepScripts }),
      })
      const data = (await res.json()) as CloneResponse
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Cloning failed (HTTP ${res.status}).`)
      }
      setView({ kind: 'done', result: data })
      loadHistory()
      toast.success(`Cloned ${hostnameOf(data.meta.finalUrl)} — ${data.meta.stats.requests} requests captured`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong while cloning.'
      setError(message)
      setView({ kind: 'idle' })
      toast.error(message)
    }
  }, [loadHistory])

  const openFromHistory = useCallback(async (id: string) => {
    setView({ kind: 'cloning' })
    try {
      const res = await fetch(`/api/clones/${id}`)
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Clone expired.')
      setView({
        kind: 'done',
        result: {
          ok: true,
          id: data.meta.id,
          meta: data.meta,
          htmlPreview: '',
          htmlTruncated: true,
          htmlSize: data.meta.stats.singleBytes,
        },
      })
    } catch (err) {
      setView({ kind: 'idle' })
      toast.error(err instanceof Error ? err.message : 'Could not open that clone.')
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4">
          <button
            onClick={() => setView({ kind: 'idle' })}
            className="flex items-center gap-2.5"
            aria-label="CloneForge home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950">
              <Globe className="h-4.5 w-4.5" aria-hidden />
            </span>
            <span className="text-base font-bold tracking-tight">CloneForge</span>
            <span className="rounded-full border border-zinc-700 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
              beta
            </span>
          </button>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
            <span className="hidden sm:inline">Runs entirely on this server — nothing is uploaded anywhere</span>
            <span className="sm:hidden">Private</span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {view.kind === 'idle' && (
          <>
            <Hero loading={false} onClone={clone} />
            {error && (
              <div className="mx-auto -mt-8 mb-10 flex w-full max-w-2xl items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden />
                <p className="text-sm text-rose-200">{error}</p>
              </div>
            )}
            <HistoryStrip
              clones={history}
              loading={historyLoading}
              onOpen={openFromHistory}
              onRefresh={loadHistory}
            />
          </>
        )}

        {view.kind === 'cloning' && (
          <section className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-24" aria-label="Cloning progress">
            <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold">Cloning {hostnameOf(lastUrl.current)}…</h2>
            <p className="mt-1 text-sm text-zinc-500">Large sites can take up to a minute.</p>
            <ol className="mt-8 w-full space-y-3">
              {STEPS.map((step, i) => {
                const state = i < progressStep ? 'done' : i === progressStep ? 'active' : 'pending'
                return (
                  <li key={step} className="flex items-center gap-3 text-sm">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                        state === 'done'
                          ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400'
                          : state === 'active'
                            ? 'border-emerald-500/50 bg-emerald-500/10'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-700'
                      }`}
                    >
                      {state === 'done' ? (
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      ) : state === 'active' ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      ) : (
                        <span className="text-[10px]">{i + 1}</span>
                      )}
                    </span>
                    <span className={state === 'pending' ? 'text-zinc-600' : 'text-zinc-300'}>{step}</span>
                  </li>
                )
              })}
            </ol>
          </section>
        )}

        {view.kind === 'done' && (
          <Workspace result={view.result} onNewClone={() => setView({ kind: 'idle' })} />
        )}
      </main>

      <footer className="mt-auto border-t border-zinc-800/80 bg-zinc-950 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-zinc-600 sm:flex-row">
          <p>
            <span className="font-semibold text-zinc-500">CloneForge</span> — built for prototyping, archiving and
            learning. Only clone sites you own or have permission to use.
          </p>
          <p className="font-mono text-[10px]">Next.js 16 · assets served locally · exports are static HTML</p>
        </div>
      </footer>
    </div>
  )
}

function HistoryStrip({
  clones, loading, onOpen, onRefresh,
}: {
  clones: CloneListItem[]
  loading: boolean
  onOpen: (id: string) => void
  onRefresh: () => void
}) {
  if (loading && clones.length === 0) return null
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-16" aria-label="Recent clones">
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-zinc-600" aria-hidden />
        <h2 className="text-sm font-medium text-zinc-400">Recent clones</h2>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-zinc-600" aria-hidden />}
      </div>
      {clones.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-600">
          No clones yet — your first one will appear here.
        </p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {clones.map((c, i) => (
            <motion.button
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              onClick={() => onOpen(c.id)}
              className="group rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4 text-left transition-colors hover:border-emerald-500/40 hover:bg-zinc-900"
            >
              <p className="truncate text-sm font-medium text-zinc-200 group-hover:text-emerald-300">{c.title}</p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">{hostnameOf(c.finalUrl)}</p>
              <div className="mt-2.5 flex items-center gap-2 text-[10px] text-zinc-600">
                <span>{formatBytes(c.totalBytes)}</span>
                <span>·</span>
                <span>{c.requests} requests</span>
                <span>·</span>
                <span>{formatDate(c.createdAt)}</span>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </section>
  )
}
