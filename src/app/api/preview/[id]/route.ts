import { NextRequest, NextResponse } from 'next/server'
import { readSingleHtml } from '@/lib/cloner/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Serve a cloned page. If the original page lacked a viewport meta tag,
 * inject one so the preview is properly scaled on phones instead of
 * rendering at desktop width.
 */
function withViewportMeta(html: string): string {
  if (/name=["']viewport["']/i.test(html)) return html
  const tag = '<meta name="viewport" content="width=device-width, initial-scale=1">'
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}\n${tag}`)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${tag}</head>`)
  return `${tag}\n${html}`
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const page = req.nextUrl.searchParams.get('page')
  const html = await readSingleHtml(id, page)
  if (html === null) {
    return NextResponse.json({ error: 'Clone page not found or expired.' }, { status: 404 })
  }
  return new NextResponse(withViewportMeta(html), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
