import type { Metadata } from 'next'
import Link from 'next/link'
import { BrandMark, Wordmark } from '@/components/cloner/brand'
import { ShieldCheck } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Terms of Service — Clonethat',
  description: 'Acceptable use, rights, privacy and takedown policy for Clonethat. Product of O.L.H.M.E.S.',
}

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: '1. What Clonethat is',
    body: [
      'Clonethat is a developer utility. It fetches publicly accessible web pages, captures their rendered DOM, downloads publicly referenced assets, and produces an offline copy plus an optional AI-generated rebuild of the layout as clean HTML with Tailwind CSS and a React component.',
      'It is intended for prototyping, redesign reference, migrations, archiving pages you are responsible for, and learning how the web is built. It is not intended — and may not be used — to deceive anyone.',
    ],
  },
  {
    title: '2. Acceptable use',
    body: [
      'You may only use Clonethat on sites you own or for which you have the right holder\'s permission. You confirm this every time you run a clone.',
      'You may not use Clonethat to create phishing pages, credential-harvesting forms, fraudulent copies of brands, or any content that impersonates a person or organisation with intent to deceive.',
      'You may not use Clonethat to infringe copyright, trademark or other rights, to circumvent access controls, to bypass paywalls or bot defences, or to load sites in a way that disrupts their operation.',
      'Rate limits apply. Automated abuse, scraping of this tool itself, and attempts to exceed fair use may result in blocking.',
    ],
  },
  {
    title: '3. Your responsibility for cloned content',
    body: [
      'You are solely responsible for what you clone and what you do with the output. Cloned pages and AI rebuilds are provided as-is, with no warranty of any kind, and may contain errors, incomplete assets, or content whose rights belong to third parties.',
      'If you publish or reuse anything produced with Clonethat, it is your job to make sure you have the rights to do so.',
    ],
  },
  {
    title: '4. Privacy & data retention',
    body: [
      'Clonethat runs without accounts. Clones and AI rebuilds are stored temporarily to power previews and downloads, and are automatically and permanently deleted after 24 hours (the retention window may be shorter on private deployments).',
      'We do not sell or share clone contents. Standard, anonymised request logs may be kept briefly for abuse protection and reliability.',
      'If you supply your own AI key (BYOK), it is sent only with your rebuild request and is never stored or logged.',
    ],
  },
  {
    title: '5. DMCA / takedowns',
    body: [
      'If you believe content produced through Clonethat infringes your rights, contact the operator through the GitHub repository of this project (open an issue marked "takedown") with: the URL(s) involved, proof of ownership, and a good-faith statement. Verified requests are actioned promptly, and clones expire automatically within 24 hours in any case.',
    ],
  },
  {
    title: '6. The service',
    body: [
      'Clonethat is offered free of charge, as-is and when-available. The operator may change, suspend or discontinue any part of it at any time, and may refuse service for abuse.',
      'The operator of Clonethat is O.L.H.M.E.S.',
    ],
  },
]

export default function TosPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Clonethat home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-400 text-zinc-950">
              <BrandMark className="h-5 w-5" />
            </span>
            <Wordmark className="text-base" />
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            ← Back to the tool
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <div className="mb-10 flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-teal-400" aria-hidden />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Short version: clone only what you have the rights to clone. Don&apos;t build scams with this.
            </p>
          </div>
        </div>

        <div className="space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="mb-3 text-base font-semibold text-zinc-100">{s.title}</h2>
              <div className="space-y-2.5">
                {s.body.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-zinc-400">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-12 border-t border-zinc-800/80 pt-6 font-mono text-[11px] text-zinc-600">
          Clonethat — product of <strong className="font-bold text-zinc-400">O.L.H.M.E.S</strong>
        </p>
      </main>
    </div>
  )
}
