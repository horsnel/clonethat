import type { CloneMeta, CloneResult } from './types'
import { storage } from './storage'

/**
 * Clone artifact persistence, routed through the storage seam.
 *
 * Retention is ephemeral by default (RETENTION_HOURS, default 24): every
 * clone is hard-deleted after the window. For a public tool this is the
 * safest posture — nothing user-supplied is hosted longer than a day.
 */

const RETENTION_MS =
  Math.max(1, Number(process.env.RETENTION_HOURS ?? 24) || 24) * 60 * 60 * 1000

function cloneRel(id: string): string {
  // defensive: ids are generated internally, but never allow path traversal
  if (!/^[a-z0-9]{6,24}$/i.test(id)) throw new Error('Invalid clone id')
  return id
}

export async function saveClone(result: CloneResult): Promise<void> {
  const base = cloneRel(result.meta.id)
  for (const [slug, html] of result.singles.entries()) {
    if (!/^[a-z0-9-]+$/i.test(slug)) continue
    await storage.write(`${base}/single/${slug}.html`, html)
  }
  for (const [slug, buf] of result.shots.entries()) {
    if (!/^[a-z0-9-]+\.png$/i.test(slug)) continue
    await storage.write(`${base}/shots/${slug}`, buf)
  }
  for (const [rel, buf] of result.files.entries()) {
    if (rel.includes('..')) continue
    await storage.write(`${base}/mirror/${rel}`, buf)
  }
  await storage.write(`${base}/meta.json`, JSON.stringify(result.meta, null, 2))
}

function safeSlug(slug: string | null): string {
  if (!slug) return 'index'
  return /^[a-z0-9-]+$/i.test(slug) ? slug : 'index'
}

export async function readSingleHtml(id: string, page?: string | null): Promise<string | null> {
  try {
    return await storage.readText(`${cloneRel(id)}/single/${safeSlug(page ?? 'index')}.html`)
  } catch {
    return null
  }
}

export async function readShot(id: string, page?: string | null): Promise<Buffer | null> {
  try {
    return await storage.read(`${cloneRel(id)}/shots/${safeSlug(page ?? 'index')}.png`)
  } catch {
    return null
  }
}

export async function readMeta(id: string): Promise<CloneMeta | null> {
  try {
    const raw = await storage.readText(`${cloneRel(id)}/meta.json`)
    return JSON.parse(raw) as CloneMeta
  } catch {
    return null
  }
}

/** Serve a single file from a clone's mirror/assets/ folder (for AI-rebuild previews). */
export async function readMirrorAsset(id: string, relPath: string): Promise<Buffer | null> {
  const clean = relPath.replace(/\\/g, '/')
  if (clean.includes('..') || !clean.startsWith('assets/')) return null
  if (!/^[a-z0-9/._-]+$/i.test(clean)) return null
  try {
    return await storage.read(`${cloneRel(id)}/mirror/${clean}`)
  } catch {
    return null
  }
}

export async function readMirrorFiles(id: string): Promise<Map<string, Buffer> | null> {
  const base = `${cloneRel(id)}/mirror`
  const out = new Map<string, Buffer>()

  async function walk(prefix: string): Promise<void> {
    const entries = await storage.list(prefix ? `${base}/${prefix}` : base)
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDir) {
        await walk(rel)
      } else {
        try {
          out.set(rel, await storage.read(`${base}/${rel}`))
        } catch { /* skip unreadable files */ }
      }
    }
  }

  await walk('')
  if (out.size === 0) return null

  // include reference screenshots under a dedicated folder for verification
  try {
    const shotFiles = await storage.list(`${cloneRel(id)}/shots`)
    for (const f of shotFiles) {
      if (f.isDir || !f.name.endsWith('.png')) continue
      out.set(`_screenshots/${f.name}`, await storage.read(`${cloneRel(id)}/shots/${f.name}`))
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
    entries = await storage.list('.')
  } catch {
    return []
  }
  const items: CloneListItem[] = []
  for (const entry of entries) {
    if (!entry.isDir || entry.name.startsWith('.')) continue
    try {
      const metaPath = `${entry.name}/meta.json`
      const mtime = await storage.mtime(metaPath)
      if (Date.now() - mtime > RETENTION_MS) continue // hidden past the retention window
      const meta = JSON.parse(await storage.readText(metaPath)) as CloneMeta
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

/**
 * Hard-delete clones older than the retention window (ephemeral by default).
 * Called opportunistically when a new clone starts; also safe to run from a
 * cron in Phase 2.
 */
export async function pruneExpiredClones(): Promise<number> {
  let entries
  try {
    entries = await storage.list('.')
  } catch {
    return 0
  }
  let pruned = 0
  for (const entry of entries) {
    if (!entry.isDir || entry.name.startsWith('.')) continue
    try {
      const mtime = await storage.mtime(`${entry.name}/meta.json`)
      if (Date.now() - mtime > RETENTION_MS) {
        await storage.remove(entry.name, { recursive: true })
        pruned++
      }
    } catch {
      /* no meta.json (foreign dir) — leave it alone */
    }
  }
  return pruned
}
