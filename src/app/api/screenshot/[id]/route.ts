import { NextRequest, NextResponse } from 'next/server'
import { readShot } from '@/lib/cloner/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const page = req.nextUrl.searchParams.get('page')
  const shot = await readShot(id, page)
  if (shot === null) {
    return NextResponse.json({ error: 'Screenshot not available for this clone.' }, { status: 404 })
  }
  return new NextResponse(new Uint8Array(shot), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
    },
  })
}
