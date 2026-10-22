import { NextRequest, NextResponse } from 'next/server'
import { cloneSite } from '@/lib/cloner/rewriter'
import { saveClone, pruneExpiredClones } from '@/lib/cloner/store'
import { validateTargetUrl } from '@/lib/cloner/fetcher'
import { createJob, updateJob } from '@/lib/cloner/jobs'
import { clientIp, rateLimit } from '@/lib/ratelimit'
import type { RenderMode } from '@/lib/cloner/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Starts a clone as a BACKGROUND JOB and returns { jobId } immediately.
 *
 * Why: a full browser-rendered clone can take 1-3 minutes. Holding one HTTP
 * request open that long gets killed by proxies/gateways (plain-text 500,
 * which broke the client's res.json()). The client polls /api/jobs/<id>
 * with short requests instead — and gets real progress updates as a bonus.
 */

const TOTAL_STEPS = 5
const CLONE_LIMIT = Math.max(1, Number(process.env.CLONE_RATE_LIMIT ?? 10))
const CLONE_WINDOW_MS = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    let body: { url?: string; keepScripts?: boolean; renderMode?: string; crawl?: boolean; consent?: boolean }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
    }

    // Consent gate — this tool must never be a one-click phishing kit.
    if (body.consent !== true) {
      return NextResponse.json(
        { ok: false, error: 'You must confirm you own this site or have permission to clone it.' },
        { status: 400 },
      )
    }

    const { url, error } = validateTargetUrl(body.url ?? '')
    if (!url) {
      return NextResponse.json({ ok: false, error: error ?? 'Invalid URL.' }, { status: 400 })
    }

    const rl = rateLimit(`clone:${clientIp(req)}`, CLONE_LIMIT, CLONE_WINDOW_MS)
    if (!rl.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Rate limit reached (${CLONE_LIMIT} clones/hour). Try again in about ${Math.ceil(rl.retryAfterSec / 60)} min.`,
        },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    // Ephemeral by default: hard-delete clones past the retention window.
    void pruneExpiredClones().catch(() => {})

    const renderMode: RenderMode =
      body.renderMode === 'static' || body.renderMode === 'browser' ? body.renderMode : 'auto'

    const job = await createJob('clone', url, TOTAL_STEPS, 'Queued…')

    // fire-and-forget — every failure path must land in the job file
    void (async () => {
      try {
        const result = await cloneSite({
          url,
          keepScripts: Boolean(body.keepScripts),
          renderMode,
          crawl: body.crawl !== false,
          onProgress: (step, message) => void updateJob(job.id, { step, message }),
        })
        await saveClone(result)
        await updateJob(job.id, {
          status: 'done',
          step: TOTAL_STEPS - 1,
          message: 'Clone ready.',
          cloneId: result.meta.id,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error while cloning.'
        await updateJob(job.id, { status: 'error', error: message })
      }
    })()

    return NextResponse.json({ ok: true, jobId: job.id })
  } catch (err) {
    // last-resort guard: this route must ALWAYS answer with JSON
    const message = err instanceof Error ? err.message : 'Unexpected server error.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
