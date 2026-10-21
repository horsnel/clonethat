import { NextResponse } from 'next/server'
import { listClones } from '@/lib/cloner/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const clones = await listClones()
  return NextResponse.json({ ok: true, clones })
}
