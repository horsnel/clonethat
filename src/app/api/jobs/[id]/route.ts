import { NextRequest, NextResponse } from 'next/server'
import { readJob } from '@/lib/cloner/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/jobs/<id> — poll a background clone/rebuild job. Always JSON. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const job = await readJob(id)
  if (!job) {
    return NextResponse.json(
      { ok: false, error: 'Job not found — the server may have restarted. Please try again.' },
      { status: 404 },
    )
  }
  return NextResponse.json({ ok: true, job })
}
