import path from 'path'
import { mkdir, readFile, readdir, writeFile, rm, rename } from 'fs/promises'

/**
 * Background-job registry with swappable backends.
 *
 * Long operations (clone ~1-3 min, AI rebuild ~1-3 min) cannot be served by a
 * single long-held HTTP request: proxies/gateways in front of the app kill
 * slow requests and return a plain-text 500, which the client then fails to
 * parse as JSON. Instead, routes start a job here, return the job id at once,
 * and the client polls GET /api/jobs/<id> (each poll is a fast request).
 *
 * Backends (auto-selected at boot):
 *  - file   (default): clones/.jobs/<id>.json — survives dev-server reloads.
 *  - upstash: when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set,
 *    job state lives in Upstash Redis instead. This is the serverless-ready
 *    path: the filesystem is ephemeral on Vercel/Lambda, Redis is not.
 *    (Phase 2 adds a QStash trigger so the job also RUNS serverlessly.)
 */

export type JobKind = 'clone' | 'rebuild'
export type JobStatus = 'running' | 'done' | 'error'

export interface JobState {
  id: string
  kind: JobKind
  label: string
  status: JobStatus
  /** index into the UI progress-step list */
  step: number
  totalSteps: number
  /** short human-readable description of the current activity */
  message: string
  error?: string
  /** clone jobs: id of the saved clone, for the client to open when done */
  cloneId?: string
  createdAt: number
  updatedAt: number
}

const JOB_TTL_MS = 2 * 60 * 60 * 1000 // keep finished jobs 2h for polling clients

interface JobBackend {
  save(job: JobState): Promise<void>
  load(id: string): Promise<JobState | null>
  prune(): Promise<void>
}

/* ------------------------------ file backend ----------------------------- */

const JOBS_DIR = path.join(process.cwd(), 'clones', '.jobs')

/**
 * Atomic, serialized job-file writes.
 *
 * Progress updates fire-and-forget, so several save() calls can overlap.
 * A bare writeFile truncates in place — two overlapping writes splice into
 * corrupted JSON (observed in production: `..."updatedAt":1792}atedAt":…}`),
 * which made every later poll 404. Fix: one in-flight write per job id, each
 * landing via temp-file + rename (atomic on POSIX).
 */
const writeQueues = new Map<string, Promise<void>>()

async function atomicWriteJob(p: string, data: string): Promise<void> {
  await mkdir(JOBS_DIR, { recursive: true })
  const tmp = `${p}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 6)}.tmp`
  await writeFile(tmp, data, 'utf8')
  await rename(tmp, p)
}

async function saveFileJob(job: JobState): Promise<void> {
  const id = job.id
  const prev = writeQueues.get(id) ?? Promise.resolve()
  const task = prev.then(() => atomicWriteJob(jobPath(id), JSON.stringify(job)))
  const settled = task.catch(() => {
    /* best effort — the clone itself matters more than the progress file */
  })
  writeQueues.set(id, settled)
  try {
    await settled
  } finally {
    if (writeQueues.get(id) === settled) writeQueues.delete(id)
  }
}

function jobPath(id: string): string {
  // ids are generated here; guard anyway against path traversal
  if (!/^[a-z0-9]+$/i.test(id)) throw new Error('Invalid job id.')
  return path.join(JOBS_DIR, `${id}.json`)
}

const fileBackend: JobBackend = {
  async save(job) {
    await saveFileJob(job)
  },
  async load(id) {
    try {
      const raw = await readFile(jobPath(id), 'utf8')
      return JSON.parse(raw) as JobState
    } catch {
      return null
    }
  },
  async prune() {
    try {
      const names = await readdir(JOBS_DIR)
      const now = Date.now()
      await Promise.all(
        names
          .filter((n) => n.endsWith('.json'))
          .map(async (n) => {
            try {
              const raw = await readFile(path.join(JOBS_DIR, n), 'utf8')
              const job = JSON.parse(raw) as JobState
              if (now - job.createdAt > JOB_TTL_MS) {
                await rm(path.join(JOBS_DIR, n), { force: true })
              }
            } catch {
              /* unreadable entry — leave it */
            }
          }),
      )
    } catch {
      /* dir may not exist yet */
    }
  },
}

/* ----------------------------- upstash backend ---------------------------- */

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN

function upstashCommand(command: string, body?: string): Promise<unknown> {
  return fetch(`${upstashUrl}/${command}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${upstashToken}` },
    body,
  }).then((r) => r.json())
}

const upstashBackend: JobBackend = {
  async save(job) {
    try {
      await upstashCommand(`set/job:${job.id}?EX=${Math.floor(JOB_TTL_MS / 1000)}`, JSON.stringify(job))
    } catch {
      /* best effort */
    }
  },
  async load(id) {
    if (!/^[a-z0-9:]+$/i.test(id)) return null
    try {
      const res = (await upstashCommand(`get/job:${id}`)) as { result?: string | null }
      if (!res.result) return null
      return JSON.parse(res.result) as JobState
    } catch {
      return null
    }
  },
  async prune() {
    // Redis EX handles TTL — nothing to sweep
  },
}

/* ------------------------------- public API ------------------------------- */

const backend: JobBackend =
  upstashUrl && upstashToken ? upstashBackend : fileBackend

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export async function createJob(
  kind: JobKind,
  label: string,
  totalSteps: number,
  message: string,
): Promise<JobState> {
  const now = Date.now()
  const job: JobState = {
    id: newId(),
    kind,
    label,
    status: 'running',
    step: 0,
    totalSteps,
    message,
    createdAt: now,
    updatedAt: now,
  }
  await backend.save(job)
  void backend.prune().catch(() => {})
  return job
}

export async function readJob(id: string): Promise<JobState | null> {
  const job = await backend.load(id)
  if (!job) return null
  // belt & braces: treat ancient jobs as gone even if the backend kept them
  if (Date.now() - job.createdAt > JOB_TTL_MS) return null
  return job
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<JobState, 'step' | 'message' | 'status' | 'error' | 'cloneId'>>,
): Promise<void> {
  const job = await readJob(id)
  if (!job) return
  await backend.save({ ...job, ...patch, updatedAt: Date.now() })
}
