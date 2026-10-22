# Clonethat

**Clone any website. Rebuild it clean.** — headless Chromium rendering, interaction replay, multi-page crawl, and an AI rebuild engine that turns captured DOM into hand-readable **HTML + Tailwind** and a **React** component.

Product of **O.L.H.M.E.S**.

## Features

- **Headless rendering** — a real Chromium engine executes scripts and captures the DOM exactly as users see it (SPAs, modals, dead URLs with auto-heal)
- **Interaction replay** — clicks Sign Up / Log In-style CTAs to capture hidden UI states as separate pages
- **Multi-page crawl** — same-origin links, rewritten navigation, shared asset pool (400-asset / 60 MB budget)
- **Stack analysis** — 45+ technology signatures, palette extraction, font detection
- **AI Rebuild** — batched, fidelity-scored LLM rewrite of the captured DOM into semantic Tailwind HTML + React TSX, with verbatim-text probes that prevent hallucinated copy
- **Exports** — single-file HTML (assets inlined), full mirror ZIP with screenshots, rebuilt source
- **Ephemeral by default** — clones are hard-deleted after 24h (`RETENTION_HOURS`)
- **Guardrails** — consent gate, per-IP rate limits, SSRF-safe URL validation, always-JSON API responses

## Quickstart

```bash
bun install
bun run dev        # http://localhost:3000
```

## Configuration

Copy `.env.example` to `.env` and adjust. Everything works with sane defaults out of the box.

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | *(unset → z.ai sandbox)* | Set `openai` to use any OpenAI-compatible endpoint |
| `OPENAI_API_KEY` | — | Hosted AI key (users can also bring their own per request) |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible base URL |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model for the rebuild engine |
| `RETENTION_HOURS` | `24` | Clone lifetime before hard deletion |
| `CLONE_RATE_LIMIT` | `10` | Clones per IP per hour |
| `REBUILD_RATE_LIMIT` | `20` | AI rebuilds per IP per hour |
| `STORAGE_DRIVER` | `local` | Artifact storage (`local` today; blob in Phase 2) |
| `CLONES_DIR` | `./clones` | Artifact root |
| `UPSTASH_REDIS_REST_URL/TOKEN` | — | Serverless job-state backend (Phase 2 / Vercel) |

### BYOK (bring your own key)

In the workspace's **AI Rebuild** tab, open *Advanced* and paste an OpenAI-compatible key. It is sent only as a request header for that rebuild, never stored — the hosted tool costs nothing to run for AI usage.

## Architecture notes

- `src/lib/cloner/` — engine: fetcher (SSRF-guarded), renderer (Chromium singleton), rewriter (multi-page orchestrator), analyzer, rebuild (unit-based rebuild + text-probe fidelity scoring), store, jobs
- `src/lib/ai/provider.ts` — LLM abstraction: z.ai sandbox | env key | per-request BYOK
- `src/lib/cloner/storage.ts` — artifact storage seam (local filesystem today; blob-ready)
- `src/lib/cloner/jobs.ts` — background job registry (file | Upstash) so no HTTP request ever runs longer than a few seconds
- `src/lib/ratelimit.ts` — per-IP fixed-window limiter

## Legal

Use only on sites you own or have permission to clone. No phishing, no infringement. See `/tos` in the running app. Clones self-destruct in 24 hours.

---

product of **O.L.H.M.E.S** — MIT licensed, see [LICENSE](LICENSE).
