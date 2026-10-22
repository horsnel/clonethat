import { NextRequest, NextResponse } from 'next/server'
import { readMirrorAsset } from '@/lib/cloner/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  css: 'text/css',
  js: 'text/javascript',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  mp4: 'video/mp4',
  webm: 'video/webm',
  json: 'application/json',
}

/** GET /api/asset/<id>/assets/<file> — serve a cloned asset for AI-rebuild previews. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; path: string[] }> },
) {
  const { id, path: parts } = await ctx.params
  const rel = (parts ?? []).join('/')
  const buf = await readMirrorAsset(id, rel)
  if (!buf) {
    return NextResponse.json({ error: 'Asset not found.' }, { status: 404 })
  }
  const ext = rel.split('.').pop()?.toLowerCase() ?? ''
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
