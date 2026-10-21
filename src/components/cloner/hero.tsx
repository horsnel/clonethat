'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Hammer, PackageOpen, ScanSearch, Sparkles, Globe, Zap, Loader2, Cpu, FileCode2, Wand2, Link2,
} from 'lucide-react'
import type { RenderModeUi } from './shared'

interface HeroProps {
  loading: boolean
  onClone: (url: string, opts: { keepScripts: boolean; renderMode: RenderModeUi; crawl: boolean }) => void
  initialUrl?: string
}

const EXAMPLES = [
  'famsuptasks.com/register',
  'books.toscrape.com',
  'quotes.toscrape.com',
  'example.com',
]

const FEATURES = [
  {
    icon: Wand2,
    title: 'Headless browser rendering',
    desc: 'A real Chromium engine loads the page, runs every script, and captures the DOM exactly as users see it — SPAs, modals and all.',
  },
  {
    icon: ScanSearch,
    title: 'Interaction replay & analysis',
    desc: 'The engine clicks Sign Up / Log In style CTAs to capture hidden states, detects 45+ technologies, and extracts palette + fonts from CSS.',
  },
  {
    icon: PackageOpen,
    title: 'Multi-page, deploy-ready export',
    desc: 'Crawls same-origin links, rewrites navigation between cloned pages, and ships a single-file HTML or full mirror ZIP.',
  },
]

export function Hero({ loading, onClone, initialUrl = '' }: HeroProps) {
  const [url, setUrl] = useState(initialUrl)
  const [keepScripts, setKeepScripts] = useState(false)
  const [crawl, setCrawl] = useState(true)
  const [renderMode, setRenderMode] = useState<RenderModeUi>('auto')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (url.trim() && !loading) onClone(url.trim(), { keepScripts, renderMode, crawl })
  }

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(16,185,129,0.25), transparent), linear-gradient(rgba(63,63,70,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(63,63,70,0.25) 1px, transparent 1px)',
          backgroundSize: 'auto, 56px 56px, 56px 56px',
        }}
      />
      <div className="relative mx-auto w-full max-w-3xl px-4 pt-16 pb-12 sm:pt-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <Badge variant="outline" className="mb-5 gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
            <Sparkles className="h-3 w-3" aria-hidden />
            Chromium rendering · interaction replay · multi-page crawl
          </Badge>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">
            Clone any website.
            <br />
            <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-lime-200 bg-clip-text text-transparent">
              Even the JavaScript.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-zinc-400 sm:text-lg">
            CloneForge renders pages in a real browser, replays interactions to capture hidden UI,
            crawls linked pages and hands you a ready-to-deploy copy.
          </p>
        </motion.div>

        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="mx-auto mt-9 w-full max-w-2xl"
          aria-label="Clone a website"
        >
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-3 shadow-2xl shadow-black/50 backdrop-blur sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Globe className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-zinc-500" aria-hidden />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                aria-label="Website URL to clone"
                className="h-12 border-0 bg-transparent pl-10 font-mono text-sm shadow-none focus-visible:ring-1 focus-visible:ring-emerald-500/60 sm:text-base"
              />
            </div>
            <Button
              type="submit"
              disabled={loading || !url.trim()}
              className="h-12 gap-2 bg-emerald-500 px-6 font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Hammer className="h-4 w-4" aria-hidden />
              )}
              {loading ? 'Cloning…' : 'Clone site'}
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Select value={renderMode} onValueChange={(v) => setRenderMode(v as RenderModeUi)}>
                      <SelectTrigger
                        aria-label="Rendering engine"
                        className="h-9 w-[190px] gap-2 border-zinc-800 bg-zinc-900/60 text-xs text-zinc-300"
                      >
                        <Cpu className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                        <SelectItem value="auto">
                          <span className="flex items-center gap-2"><Wand2 className="h-3.5 w-3.5 text-emerald-400" />Auto — smart escalate</span>
                        </SelectItem>
                        <SelectItem value="browser">
                          <span className="flex items-center gap-2"><Cpu className="h-3.5 w-3.5 text-emerald-400" />Always render (Chromium)</span>
                        </SelectItem>
                        <SelectItem value="static">
                          <span className="flex items-center gap-2"><FileCode2 className="h-3.5 w-3.5 text-emerald-400" />Fast static HTML</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-zinc-900 border-zinc-800 text-zinc-200">
                  Auto tries fast static fetch, escalates to a real browser when the page needs JavaScript
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3.5 py-2">
              <Switch id="crawl" checked={crawl} onCheckedChange={setCrawl} aria-label="Crawl linked pages" />
              <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Link2 className="h-3 w-3" aria-hidden /> Crawl linked pages
              </span>
            </label>

            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3.5 py-2">
              <Switch id="keep-scripts-hero" checked={keepScripts} onCheckedChange={setKeepScripts} aria-label="Run JavaScript in the clone" />
              <span className="text-xs text-zinc-400">Run JS in clone</span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
            <span className="text-xs text-zinc-600">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setUrl(ex)}
                className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 font-mono text-xs text-zinc-400 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
              >
                {ex}
              </button>
            ))}
          </div>
        </motion.form>
      </div>

      <div className="relative mx-auto grid w-full max-w-5xl gap-4 px-4 pb-16 sm:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}
          >
            <Card className="h-full border-zinc-800/80 bg-zinc-900/50">
              <CardContent className="p-6">
                <div className="mb-3 inline-flex rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5">
                  <f.icon className="h-5 w-5 text-emerald-300" aria-hidden />
                </div>
                <h3 className="mb-2 font-semibold text-zinc-100">{f.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-400">{f.desc}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
