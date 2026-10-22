/**
 * Phase 1 smoke test — run with: bun scripts/test-provider.ts
 * Verifies the LLM provider abstraction (z.ai sandbox path) and the
 * in-memory rate limiter behave as expected.
 */
import { getLLM } from '../src/lib/ai/provider'
import { rateLimit } from '../src/lib/ratelimit'

async function main() {
  console.log('— provider smoke —')
  const llm = await getLLM()
  const reply = await llm.complete(
    'You are a test harness. Reply with exactly one word.',
    'Reply with: OK',
  )
  console.log('LLM reply:', reply.trim().slice(0, 60))
  if (!reply.trim()) throw new Error('empty LLM reply')

  console.log('— rate limit smoke —')
  let last = { ok: true, retryAfterSec: 0 }
  for (let i = 0; i < 12; i++) last = rateLimit('test-ip', 10, 60_000)
  console.log('12th request on a 10/hour limit:', last)
  if (last.ok) throw new Error('rate limiter did not trip at 11th request')

  console.log('ALL SMOKE TESTS PASSED')
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err)
  process.exit(1)
})
