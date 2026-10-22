/**
 * Minimal in-memory fixed-window rate limiter (per IP + bucket).
 *
 * Good enough for a single long-lived instance (local dev, VPS, one Vercel
 * fluid instance). Phase 2 swaps the counter for Upstash Redis when the app
 * runs as many short-lived serverless instances — the call sites won't change.
 */

const buckets = new Map<string, { count: number; resetAt: number }>()

export interface RateResult {
  ok: boolean
  retryAfterSec: number
}

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now()

  // opportunistic cleanup so the map can't grow without bound under abuse
  if (buckets.size > 5_000) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k)
    }
  }

  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSec: 0 }
  }
  if (b.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) }
  }
  b.count++
  return { ok: true, retryAfterSec: 0 }
}

/** Best-effort client IP (proxy-aware). Falls back to a shared local key. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'local'
}
