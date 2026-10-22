import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { readMeta, readMirrorFiles, readSingleHtml } from '@/lib/cloner/store'
import { readRebuild } from '@/lib/cloner/rebuild'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeFileName(title: string, fallback: string): string {
  const base = title.replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60)
  return base || fallback
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const format = req.nextUrl.searchParams.get('format') ?? 'zip'
  const page = req.nextUrl.searchParams.get('page')

  const meta = await readMeta(id)
  if (!meta) {
    return NextResponse.json({ error: 'Clone not found or expired.' }, { status: 404 })
  }
  const name = safeFileName(meta.title, meta.id)

  if (format === 'rebuild') {
    const rebuilt = await readRebuild(id, page)
    if (!rebuilt) {
      return NextResponse.json({ error: 'No AI rebuild for this page yet.' }, { status: 404 })
    }
    const suffix = page && page !== 'index' ? `-${page}` : ''
    return new NextResponse(rebuilt.code, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}-tailwind${suffix}.html"`,
      },
    })
  }

  if (format === 'single') {
    const html = await readSingleHtml(id, page)
    if (html === null) {
      return NextResponse.json({ error: 'Clone page missing.' }, { status: 404 })
    }
    const suffix = page && page !== 'index' ? `-${page}` : ''
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}-clone${suffix}.html"`,
      },
    })
  }

  // format=zip — full mirror with assets + screenshots
  const files = await readMirrorFiles(id)
  if (!files) {
    return NextResponse.json({ error: 'Mirror files missing.' }, { status: 404 })
  }
  const zip = new JSZip()
  const root = zip.folder(name) ?? zip
  for (const [rel, buf] of files.entries()) {
    root.file(rel, buf)
  }
  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  return new NextResponse(new Uint8Array(content), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${name}-clone.zip"`,
      'Content-Length': String(content.length),
    },
  })
}
