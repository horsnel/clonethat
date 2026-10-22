import { NextRequest, NextResponse } from 'next/server'
import { readMeta } from '@/lib/cloner/store'
import { readRebuild, rebuildPage } from '@/lib/cloner/rebuild'
import { createJob, updateJob } from '@/lib/cloner/jobs'
import { getLLM, type ByokConfig } from '@/lib/ai/provider'
import { clientIp, rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const REBUILD_LIMIT = Math.max(1, Number(process.env.REBUILD_RATE_LIMIT ?? 20))
const REBUILD_WINDOW_MS = 60 * 60 * 1000

function slugFrom(req: NextRequest): string {
  const s = req.nextUrl.searchParams.get('page') ?? 'index'
  return /^[a-z0-9-]+$/i.test(s) ? s : 'index'
}

/** BYOK: optional per-request OpenAI-compatible credentials (never persisted). */
function byokFrom(req: NextRequest): ByokConfig | null {
  const key = req.headers.get('x-byok-key')
  if (!key) return null
  return {
    key,
    baseUrl: req.headers.get('x-byok-baseurl') || undefined,
    model: req.headers.get('x-byok-model') || undefined,
  }
}

/** GET — return the cached rebuild for a page (404 if none yet). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const cached = await readRebuild(id, slugFrom(req))
    if (!cached) {
      return NextResponse.json({ exists: false }, { status: 404 })
    }
    return NextResponse.json({ exists: true, ...cached })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not read the rebuild.'
    return NextResponse.json({ exists: false, error: message }, { status: 500 })
  }
}

/**
 * POST — start the AI rebuild as a BACKGROUND JOB, return { jobId } at once.
 * AI rebuilds take 1-3 minutes; holding the request open gets killed by
 * gateways. The client polls /api/jobs/<id>, then re-GETs this route to
 * read the persisted result.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const slug = slugFrom(req)

    const rl = rateLimit(`rebuild:${clientIp(req)}`, REBUILD_LIMIT, REBUILD_WINDOW_MS)
    if (!rl.ok) {
      return NextResponse.json(
        {
          error: `Rate limit reached (${REBUILD_LIMIT} rebuilds/hour). Try again in about ${Math.ceil(rl.retryAfterSec / 60)} min.`,
        },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const meta = await readMeta(id)
    if (!meta) {
      return NextResponse.json({ error: 'Clone not found or expired.' }, { status: 404 })
    }

    const llm = await getLLM(byokFrom(req))

    const job = await createJob(
      'rebuild',
      `${id}/${slug}`,
      5,
      'Reading the captured DOM…',
    )

    void (async () => {
      try {
        await updateJob(job.id, { step: 1, message: 'Extracting design tokens…' })
        const out = await rebuildPage(
          id,
          slug,
          meta,
          (step, message) => void updateJob(job.id, { step, message }),
          llm,
        )
        await updateJob(job.id, {
          status: 'done',
          step: 4,
          message: `Rebuilt in ${Math.max(1, Math.round(out.durationMs / 1000))}s.`,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'AI rebuild failed.'
        await updateJob(job.id, { status: 'error', error: message })
      }
    })()

    return NextResponse.json({ exists: false, jobId: job.id, started: true })
  } catch (err) {
    // last-resort guard: this route must ALWAYS answer with JSON
    const message = err instanceof Error ? err.message : 'Unexpected server error.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
