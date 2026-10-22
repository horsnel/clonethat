import { NextRequest, NextResponse } from 'next/server'
import { readMeta } from '@/lib/cloner/store'
import { readRebuild, rebuildPage } from '@/lib/cloner/rebuild'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function slugFrom(req: NextRequest): string {
  const s = req.nextUrl.searchParams.get('page') ?? 'index'
  return /^[a-z0-9-]+$/i.test(s) ? s : 'index'
}

/** GET — return the cached rebuild for a page (404 if none yet). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const cached = await readRebuild(id, slugFrom(req))
  if (!cached) {
    return NextResponse.json({ exists: false }, { status: 404 })
  }
  return NextResponse.json({ exists: true, ...cached })
}

/** POST — run (or re-run) the AI rebuild for a page. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const slug = slugFrom(req)

  const meta = await readMeta(id)
  if (!meta) {
    return NextResponse.json({ error: 'Clone not found or expired.' }, { status: 404 })
  }

  try {
    const out = await rebuildPage(id, slug, meta)
    return NextResponse.json({
      exists: true,
      code: out.code,
      react: out.react,
      previewHtml: out.previewHtml,
      inputChars: out.inputChars,
      notes: out.notes,
      durationMs: out.durationMs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI rebuild failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
