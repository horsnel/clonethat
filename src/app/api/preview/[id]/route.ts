import { NextRequest, NextResponse } from 'next/server'
import { readSingleHtml } from '@/lib/cloner/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const page = req.nextUrl.searchParams.get('page')
  const html = await readSingleHtml(id, page)
  if (html === null) {
    return NextResponse.json({ error: 'Clone page not found or expired.' }, { status: 404 })
  }
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
