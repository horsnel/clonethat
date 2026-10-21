import { NextRequest, NextResponse } from 'next/server'
import { readMeta } from '@/lib/cloner/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const meta = await readMeta(id)
  if (!meta) {
    return NextResponse.json({ ok: false, error: 'Clone not found or expired.' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, meta })
}
