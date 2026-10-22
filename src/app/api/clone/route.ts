import { NextRequest, NextResponse } from 'next/server'
import { cloneSite } from '@/lib/cloner/rewriter'
import { saveClone } from '@/lib/cloner/store'
import { validateTargetUrl } from '@/lib/cloner/fetcher'
import { createJob, updateJob } from '@/lib/cloner/jobs'
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

export async function POST(req: NextRequest) {
  let body: { url?: string; keepScripts?: boolean; renderMode?: string; crawl?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  const { url, error } = validateTargetUrl(body.url ?? '')
  if (!url) {
    return NextResponse.json({ ok: false, error: error ?? 'Invalid URL.' }, { status: 400 })
  }
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
}
