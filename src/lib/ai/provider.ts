/**
 * LLM provider abstraction for Clonethat.
 *
 * Three ways to resolve a client (first match wins):
 *  1. BYOK — a per-request key supplied by the user (x-byok-* headers),
 *     resolved via getLLM({ key, ... }). Zero AI cost for the host.
 *  2. Env  — OPENAI_API_KEY set (and LLM_PROVIDER != 'zai'): any
 *     OpenAI-compatible endpoint (OpenAI, Gemini, Groq, DeepSeek, Ollama…).
 *  3. Z.ai — the built-in sandbox SDK, used for local development.
 *
 * Every provider shares one retry policy (429 backoff, 5 attempts) so the
 * rebuild engine behaves identically no matter which backend is active.
 */

export interface LLMClient {
  /** One completion; retries rate limits internally, throws on hard failure. */
  complete(system: string, user: string): Promise<string>
}

export interface ByokConfig {
  key: string
  baseUrl?: string
  model?: string
}

const RETRY_ATTEMPTS = 5

async function withRetry(fn: () => Promise<string>): Promise<string> {
  let lastErr: unknown
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      const isRate = /429|rate/i.test(msg)
      if (!isRate || attempt === RETRY_ATTEMPTS - 1) break
      await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/* ----------------------------- z.ai sandbox ----------------------------- */

async function zaiClient(): Promise<LLMClient> {
  // dynamic import keeps the SDK optional (a Vercel deploy without it still builds)
  const { default: ZAI } = await import('z-ai-web-dev-sdk')
  const zai = await ZAI.create()
  return {
    async complete(system, user) {
      return withRetry(async () => {
        const completion = await zai.chat.completions.create({
          messages: [
            { role: 'assistant', content: system },
            { role: 'user', content: user },
          ],
          thinking: { type: 'disabled' },
        })
        const text = completion.choices[0]?.message?.content ?? ''
        if (!text.trim()) throw new Error('Empty AI response')
        return text
      })
    },
  }
}

/* ---------------------- OpenAI-compatible (env / BYOK) ------------------- */

function openaiClient(baseUrl: string, apiKey: string, model: string): LLMClient {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  return {
    async complete(system, user) {
      return withRetry(async () => {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        })
        if (!res.ok) {
          const hint = (await res.text()).slice(0, 200)
          throw new Error(`LLM provider error (HTTP ${res.status}): ${hint}`)
        }
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
        const text = data.choices?.[0]?.message?.content ?? ''
        if (!text.trim()) throw new Error('Empty AI response')
        return text
      })
    },
  }
}

/* ------------------------------- resolver -------------------------------- */

/** Resolve env/BYOK providers; returns null when the sandbox SDK should be used. */
export function resolveLLM(byok?: ByokConfig | null): LLMClient | null {
  if (byok?.key) {
    return openaiClient(
      byok.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      byok.key,
      byok.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    )
  }
  if (process.env.OPENAI_API_KEY && process.env.LLM_PROVIDER !== 'zai') {
    return openaiClient(
      process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      process.env.OPENAI_API_KEY,
      process.env.OPENAI_MODEL || 'gpt-4o-mini',
    )
  }
  return null
}

/** Default client for the current environment. */
export async function getLLM(byok?: ByokConfig | null): Promise<LLMClient> {
  const resolved = resolveLLM(byok)
  if (resolved) return resolved
  return zaiClient()
}
