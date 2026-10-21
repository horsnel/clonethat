'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Hammer, PackageOpen, ScanSearch, Sparkles, Globe, Zap, Loader2,
} from 'lucide-react'

interface HeroProps {
  loading: boolean
  onClone: (url: string, keepScripts: boolean) => void
  initialUrl?: string
}

const EXAMPLES = [
  'books.toscrape.com',
  'quotes.toscrape.com',
  'example.com',
  'info.cern.ch',
]

const FEATURES = [
  {
    icon: Zap,
    title: 'Deep asset cloning',
    desc: 'Every image, stylesheet, font and lazy-loaded asset is downloaded, deduped and rewritten — nothing left behind on the origin server.',
  },
  {
    icon: ScanSearch,
    title: 'Stack & design analysis',
    desc: 'Detects 45+ frameworks, CMSs and trackers. Extracts the color palette and font stack straight from the site\'s CSS.',
  },
  {
    icon: PackageOpen,
    title: 'One-click export',
    desc: 'Download a single portable HTML file with everything inlined, or a full mirror ZIP ready to deploy on any static host.',
  },
]

export function Hero({ loading, onClone, initialUrl = '' }: HeroProps) {
  const [url, setUrl] = useState(initialUrl)
  const [keepScripts, setKeepScripts] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (url.trim() && !loading) onClone(url.trim(), keepScripts)
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
            Deep cloning engine · 45+ stack signatures
          </Badge>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">
            Clone any website.
            <br />
            <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-lime-200 bg-clip-text text-transparent">
              In seconds.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-zinc-400 sm:text-lg">
            Paste a URL — CloneForge downloads every asset, rewrites all references,
            analyzes the tech stack and hands you a ready-to-deploy copy.
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

          <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <div className="flex items-center gap-2.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-1.5">
              <Switch
                id="keep-scripts"
                checked={keepScripts}
                onCheckedChange={setKeepScripts}
                aria-label="Run JavaScript in the clone"
              />
              <Label htmlFor="keep-scripts" className="cursor-pointer text-xs text-zinc-400">
                Run JavaScript <span className="text-zinc-600">(for JS-rendered sites)</span>
              </Label>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
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
