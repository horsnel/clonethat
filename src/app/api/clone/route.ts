import { NextRequest, NextResponse } from 'next/server'
import { cloneSite } from '@/lib/cloner/rewriter'
import { saveClone } from '@/lib/cloner/store'
import { validateTargetUrl } from '@/lib/cloner/fetcher'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HTML_PREVIEW_CAP = 300_000

export async function POST(req: NextRequest) {
  let body: { url?: string; keepScripts?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  const { url, error } = validateTargetUrl(body.url ?? '')
  if (!url) {
    return NextResponse.json({ ok: false, error: error ?? 'Invalid URL.' }, { status: 400 })
  }

  try {
    const result = await cloneSite({ url, keepScripts: Boolean(body.keepScripts) })
    await saveClone(result)
    return NextResponse.json({
      ok: true,
      id: result.meta.id,
      meta: result.meta,
      htmlPreview: result.singleHtml.slice(0, HTML_PREVIEW_CAP),
      htmlTruncated: result.singleHtml.length > HTML_PREVIEW_CAP,
      htmlSize: result.singleHtml.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error while cloning.'
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
