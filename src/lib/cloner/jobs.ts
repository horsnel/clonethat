import { mkdir, readFile, readdir, writeFile, rm } from 'fs/promises'
import path from 'path'

/**
 * File-backed background-job registry.
 *
 * Long operations (clone ~1-3 min, AI rebuild ~1-3 min) cannot be served by a
 * single long-held HTTP request: proxies/gateways in front of the app kill
 * slow requests and return a plain-text 500, which the client then fails to
 * parse as JSON. Instead, routes start a job here, return the job id at once,
 * and the client polls GET /api/jobs/<id> (each poll is a fast request).
 *
 * State lives on disk (clones/.jobs/<id>.json) so it survives dev-server
 * module reloads and can be inspected after the fact.
 */

const JOBS_DIR = path.join(process.cwd(), 'clones', '.jobs')
const JOB_TTL_MS = 2 * 60 * 60 * 1000 // keep finished jobs 2h for polling clients

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

function jobPath(id: string): string {
  // ids are generated here; guard anyway against path traversal
  if (!/^[a-z0-9]+$/i.test(id)) throw new Error('Invalid job id.')
  return path.join(JOBS_DIR, `${id}.json`)
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

async function pruneOldJobs(): Promise<void> {
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
}

export async function createJob(
  kind: JobKind,
  label: string,
  totalSteps: number,
  message: string,
): Promise<JobState> {
  await mkdir(JOBS_DIR, { recursive: true })
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
  await writeFile(jobPath(job.id), JSON.stringify(job), 'utf8')
  void pruneOldJobs()
  return job
}

export async function readJob(id: string): Promise<JobState | null> {
  try {
    const raw = await readFile(jobPath(id), 'utf8')
    return JSON.parse(raw) as JobState
  } catch {
    return null
  }
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<JobState, 'step' | 'message' | 'status' | 'error' | 'cloneId'>>,
): Promise<void> {
  const job = await readJob(id)
  if (!job) return
  const next: JobState = { ...job, ...patch, updatedAt: Date.now() }
  try {
    await writeFile(jobPath(id), JSON.stringify(next), 'utf8')
  } catch {
    /* best effort — the clone itself matters more than the progress file */
  }
}
