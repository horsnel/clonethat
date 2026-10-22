/**
 * Artifact storage seam for Clonethat.
 *
 * Today everything uses the local filesystem adapter rooted at `clones/`
 * (override the root with CLONES_DIR). The interface is the exact seam the
 * serverless deploy (Phase 2) needs: implement the same seven operations on
 * top of Vercel Blob / S3 and set STORAGE_DRIVER=blob — nothing else in the
 * codebase touches the filesystem for clone artifacts.
 */

import { mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises'
import path from 'path'

export interface DirEntry {
  name: string
  isDir: boolean
}

export interface StorageAdapter {
  read(rel: string): Promise<Buffer>
  readText(rel: string): Promise<string>
  write(rel: string, data: Buffer | string): Promise<void>
  mkdir(rel: string): Promise<void>
  remove(rel: string, opts?: { recursive?: boolean }): Promise<void>
  list(rel: string): Promise<DirEntry[]>
  mtime(rel: string): Promise<number>
}

const ROOT = process.env.CLONES_DIR
  ? path.resolve(process.env.CLONES_DIR)
  : path.join(process.cwd(), 'clones')

function abs(rel: string): string {
  const p = path.resolve(ROOT, rel)
  if (p !== ROOT && !p.startsWith(ROOT + path.sep)) throw new Error('Invalid storage path')
  return p
}

const local: StorageAdapter = {
  async read(rel) {
    return readFile(abs(rel))
  },
  async readText(rel) {
    return readFile(abs(rel), 'utf8')
  },
  async write(rel, data) {
    const p = abs(rel)
    await mkdir(path.dirname(p), { recursive: true })
    await writeFile(p, typeof data === 'string' ? Buffer.from(data, 'utf8') : data)
  },
  async mkdir(rel) {
    await mkdir(abs(rel), { recursive: true })
  },
  async remove(rel, opts) {
    await rm(abs(rel), { force: true, recursive: opts?.recursive ?? false })
  },
  async list(rel) {
    const entries = await readdir(abs(rel), { withFileTypes: true }).catch(() => [])
    return entries.map((e) => ({ name: e.name, isDir: e.isDirectory() }))
  },
  async mtime(rel) {
    return (await stat(abs(rel))).mtimeMs
  },
}

function createStorage(): StorageAdapter {
  const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase()
  if (driver === 'local') return local
  throw new Error(`Unknown STORAGE_DRIVER "${driver}" — supported: local (blob adapter lands in Phase 2)`)
}

export const storage: StorageAdapter = createStorage()
export { ROOT as CLONES_ROOT }
