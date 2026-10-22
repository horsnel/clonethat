'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Hero } from '@/components/cloner/hero'
import { Workspace } from '@/components/cloner/workspace'
import type { CloneResponse, CloneListItem, RenderModeUi, JobStateUi } from '@/components/cloner/shared'
import { formatBytes, formatDate, hostnameOf, safeJson, sleep } from '@/components/cloner/shared'
import { Check, History, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { BrandMark, Wordmark } from '@/components/cloner/brand'

type View = { kind: 'idle' } | { kind: 'cloning' } | { kind: 'done'; result: CloneResponse }

const STEPS = [
  'Fetching page & following redirects',
  'Rendering in headless Chromium (JS executed)',
  'Replaying interactions to capture hidden UI',
  'Crawling linked pages & downloading assets',
  'Rewriting URLs, analyzing stack & packaging',
]

export default function Home() {
  const [view, setView] = useState<View>({ kind: 'idle' })
  const [progressStep, setProgressStep] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<CloneListItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const lastUrl = useRef('')

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/clones')
      const data = await safeJson<{ ok: boolean; clones: CloneListItem[] }>(res)
      if (data.ok) setHistory(data.clones)
    } catch {
      /* history is best-effort */
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  const loadCloneById = useCallback(async (id: string): Promise<CloneResponse> => {
    const res = await fetch(`/api/clones/${id}`)
    const data = await safeJson<{ ok: boolean; meta: CloneResponse['meta']; error?: string }>(res)
    if (!res.ok || !data.ok) throw new Error(data.error || 'Clone not found.')
    return {
      ok: true,
      id: data.meta.id,
      meta: data.meta,
      htmlPreview: '',
      htmlTruncated: true,
      htmlSize: data.meta.stats.singleBytes,
    }
  }, [])

  const clone = useCallback(async (
    url: string,
    opts: { keepScripts: boolean; renderMode: RenderModeUi; crawl: boolean }
  ) => {
    lastUrl.current = url
    setError(null)
    setProgressMsg('Starting the clone engine…')
    setView({ kind: 'cloning' })
    try {
      // 1. kick off the background job — returns in well under a second,
    //    so no proxy/gateway can time the request out
      const startRes = await fetch('/api/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          keepScripts: opts.keepScripts,
          renderMode: opts.renderMode,
          crawl: opts.crawl,
          consent: true, // the hero's checkbox gate is the only path here; the server verifies anyway
        }),
      })
      const start = await safeJson<{ ok: boolean; jobId?: string; error?: string }>(startRes)
      if (!startRes.ok || !start.ok || !start.jobId) {
        throw new Error(start.error || `Could not start the clone (HTTP ${startRes.status}).`)
      }

      // 2. poll the job — every request is short, transient poll failures
      //    are tolerated (the clone keeps running server-side)
      const deadline = Date.now() + 10 * 60 * 1000
      let consecutiveFailures = 0
      let finished: JobStateUi | null = null
      while (Date.now() < deadline) {
        await sleep(2000)
        try {
          const res = await fetch(`/api/jobs/${start.jobId}`)
          const data = await safeJson<{ ok: boolean; job?: JobStateUi; error?: string }>(res)
          if (data.ok && data.job) {
            consecutiveFailures = 0
            finished = data.job
            if (data.job.step > 0 || data.job.message) {
              setProgressStep(Math.min(data.job.step, STEPS.length - 1))
              setProgressMsg(data.job.message)
            }
            if (data.job.status === 'done' || data.job.status === 'error') break
          }
        } catch {
          consecutiveFailures++
          if (consecutiveFailures >= 8) {
            throw new Error('Lost contact with the server while cloning. Please try again.')
          }
        }
      }
      if (!finished) throw new Error('The clone timed out after 10 minutes.')
      if (finished.status === 'error') throw new Error(finished.error || 'Cloning failed.')
      if (!finished.cloneId) throw new Error('Cloning finished but the result was lost — please try again.')

      // 3. load the finished clone's metadata and show the workspace
      const result = await loadCloneById(finished.cloneId)
      setView({ kind: 'done', result })
      loadHistory()
      const captures = result.meta.pages?.length ?? 1
      toast.success(
        `Cloned ${hostnameOf(result.meta.finalUrl)} — ${result.meta.stats.requests} requests, ${captures} capture${captures > 1 ? 's' : ''}`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong while cloning.'
      setError(message)
      setView({ kind: 'idle' })
      toast.error(message)
    }
  }, [loadHistory, loadCloneById])

  const openFromHistory = useCallback(async (id: string) => {
    setView({ kind: 'cloning' })
    try {
      const result = await loadCloneById(id)
      setView({ kind: 'done', result })
    } catch (err) {
      setView({ kind: 'idle' })
      toast.error(err instanceof Error ? err.message : 'Could not open that clone.')
    }
  }, [loadCloneById])

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4">
          <button
            onClick={() => setView({ kind: 'idle' })}
            className="flex items-center gap-2.5"
            aria-label="Clonethat home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950">
              <BrandMark className="h-5 w-5" />
            </span>
            <Wordmark className="text-base" />
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
            <p className="mt-1 text-sm text-zinc-500">Browser rendering takes a little longer — usually 15–60s.</p>
            {progressMsg && (
              <p className="mt-2 max-w-sm text-center font-mono text-[11px] text-emerald-400/90" aria-live="polite">
                {progressMsg}
              </p>
            )}
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
            <span className="font-semibold text-zinc-500">Clonethat</span> — built for prototyping, archiving and
            learning. Only clone sites you own or have permission to use. ·{' '}
            <Link href="/tos" className="underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-400">
              Terms
            </Link>
          </p>
          <p className="font-mono text-[10px]">
            product of <strong className="font-bold text-zinc-400">O.L.H.M.E.S</strong>
          </p>
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
              <div className="flex items-center gap-1.5">
                {c.rendered && (
                  <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1 py-0.5 text-[9px] font-medium text-emerald-300">
                    RENDERED
                  </span>
                )}
                {c.pageCount > 1 && (
                  <span className="rounded border border-zinc-700 px-1 py-0.5 text-[9px] text-zinc-400">
                    {c.pageCount} captures
                  </span>
                )}
              </div>
              <p className="mt-1.5 truncate text-sm font-medium text-zinc-200 group-hover:text-emerald-300">{c.title}</p>
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
