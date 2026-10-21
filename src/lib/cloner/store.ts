import { mkdir, readFile, writeFile, readdir, stat } from 'fs/promises'
import path from 'path'
import type { CloneMeta, CloneResult } from './types'

const CLONES_ROOT = path.join(process.cwd(), 'clones')

function cloneDir(id: string): string {
  // defensive: ids are generated internally, but never allow path traversal
  if (!/^[a-z0-9]{6,24}$/i.test(id)) throw new Error('Invalid clone id')
  return path.join(CLONES_ROOT, id)
}

export async function saveClone(result: CloneResult): Promise<void> {
  const dir = cloneDir(result.meta.id)
  await mkdir(path.join(dir, 'assets'), { recursive: true })
  await mkdir(path.join(dir, 'single'), { recursive: true })
  await mkdir(path.join(dir, 'shots'), { recursive: true })

  for (const [slug, html] of result.singles.entries()) {
    if (!/^[a-z0-9-]+$/i.test(slug)) continue
    await writeFile(path.join(dir, 'single', `${slug}.html`), Buffer.from(html, 'utf8'))
  }
  for (const [slug, buf] of result.shots.entries()) {
    if (!/^[a-z0-9-]+\.png$/i.test(slug)) continue
    await writeFile(path.join(dir, 'shots', slug), buf)
  }
  for (const [rel, buf] of result.files.entries()) {
    if (rel.includes('..')) continue
    const target = path.join(dir, 'mirror', rel)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, buf)
  }
  await writeFile(path.join(dir, 'meta.json'), JSON.stringify(result.meta, null, 2))
}

function safeSlug(slug: string | null): string {
  if (!slug) return 'index'
  return /^[a-z0-9-]+$/i.test(slug) ? slug : 'index'
}

export async function readSingleHtml(id: string, page?: string | null): Promise<string | null> {
  try {
    return await readFile(path.join(cloneDir(id), 'single', `${safeSlug(page ?? 'index')}.html`), 'utf8')
  } catch {
    return null
  }
}

export async function readShot(id: string, page?: string | null): Promise<Buffer | null> {
  try {
    return await readFile(path.join(cloneDir(id), 'shots', `${safeSlug(page ?? 'index')}.png`))
  } catch {
    return null
  }
}

export async function readMeta(id: string): Promise<CloneMeta | null> {
  try {
    const raw = await readFile(path.join(cloneDir(id), 'meta.json'), 'utf8')
    return JSON.parse(raw) as CloneMeta
  } catch {
    return null
  }
}

export async function readMirrorFiles(id: string): Promise<Map<string, Buffer> | null> {
  const mirrorRoot = path.join(cloneDir(id), 'mirror')
  const out = new Map<string, Buffer>()

  async function walk(dir: string, prefix: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(full, rel)
      } else {
        try {
          out.set(rel, await readFile(full))
        } catch { /* skip unreadable files */ }
      }
    }
  }

  await walk(mirrorRoot, '')
  if (out.size === 0) return null

  // include reference screenshots under a dedicated folder for verification
  try {
    const shotFiles = await readdir(path.join(cloneDir(id), 'shots'))
    for (const f of shotFiles) {
      if (!f.endsWith('.png')) continue
      out.set(`_screenshots/${f}`, await readFile(path.join(cloneDir(id), 'shots', f)))
    }
  } catch { /* optional */ }

  return out
}

export interface CloneListItem {
  id: string
  title: string
  sourceUrl: string
  finalUrl: string
  createdAt: number
  totalBytes: number
  requests: number
  stackCount: number
  pageCount: number
  rendered: boolean
}

export async function listClones(limit = 12): Promise<CloneListItem[]> {
  let entries
  try {
    entries = await readdir(CLONES_ROOT, { withFileTypes: true })
  } catch {
    return []
  }
  const items: CloneListItem[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const metaPath = path.join(CLONES_ROOT, entry.name, 'meta.json')
      const info = await stat(metaPath)
      if (Date.now() - info.mtimeMs > 1000 * 60 * 60 * 24 * 7) continue // keep 7 days
      const meta = JSON.parse(await readFile(metaPath, 'utf8')) as CloneMeta
      items.push({
        id: meta.id,
        title: meta.title,
        sourceUrl: meta.sourceUrl,
        finalUrl: meta.finalUrl,
        createdAt: meta.createdAt,
        totalBytes: meta.stats.totalBytes,
        requests: meta.stats.requests,
        stackCount: meta.analysis.stack.length,
        pageCount: meta.pages?.length ?? 1,
        rendered: meta.rendered,
      })
    } catch { /* skip broken entries */ }
  }
  return items.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
}
