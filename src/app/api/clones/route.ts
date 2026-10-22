import { NextResponse } from 'next/server'
import { listClones } from '@/lib/cloner/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const clones = await listClones()
    return NextResponse.json({ ok: true, clones })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not list clones.'
    return NextResponse.json({ ok: false, error: message, clones: [] }, { status: 500 })
  }
}
