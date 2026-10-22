# Project Worklog

---
Task ID: 1
Agent: main (Z.ai)
Task: Build "CloneForge" — a powerful website cloner web app (Type 3: Interactive Web Development)

Work Log:
- Initialized fullstack environment (init-fullstack.sh), Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui
- Installed cheerio@1.2.0 + jszip@3.10.2
- Built cloner engine in src/lib/cloner/:
  - fetcher.ts: browser-UA fetching, timeouts, byte caps, URL validation with SSRF guard (blocks localhost/private ranges)
  - rewriter.ts: full pipeline — cheerio DOM walk, linked-CSS recursive @import inlining, url() absolutization, concurrent asset downloads (pool of 8, dedupe, 400-asset / 60MB budget), lazy-load data-src recovery, srcset rewriting, dual materialization (single-file with base64 data-URIs + mirror with assets/ folder), script stripping (JSON-LD kept)
  - analyzer.ts: 45+ tech-stack signatures (frameworks/CMS/builders/CSS/libraries/analytics/infra), CSS color extraction (hex/rgb/hsl, perceptual de-dupe to 12 swatches), font-family frequency analysis, JS-rendered-site detection
  - store.ts: filesystem persistence under clones/<id>/ (single.html, mirror/, meta.json), 7-day retention, history listing
- API routes: POST /api/clone, GET /api/preview/[id], GET /api/download/[id]?format=single|zip, GET /api/clones, GET /api/clones/[id]
- UI: dark terminal aesthetic (zinc-950 + emerald accent), hero with URL form + example chips + JS toggle, animated cloning progress steps, workspace with analysis sidebar (site profile / stack badges / click-to-copy palette / typography bars / stats grid / asset browser), Preview + Code tabs, desktop/tablet/mobile viewport toggles, export bar (Mirror ZIP, Single HTML, Copy HTML), recent-clones history grid, sticky footer with responsible-use note
- Fixed one runtime error: bare `Image` global reference in analysis-panel.tsx (→ ImageIcon)
- E2E verified with agent-browser: home render, clone quotes.toscrape.com via UI (8 requests, Bootstrap+Google Fonts detected), live iframe preview renders cloned site fully, Code tab, history re-open of books.toscrape.com clone (35 requests, 1.27MB single-file, images inlined), mobile 390px layout, zero console/page errors, lint clean

Stage Summary:
- Deliverable: runnable Next.js app at /home/z/my-project (port 3000, auto dev server)
- Verified working endpoints: /api/clone (200), /api/preview/[id] (text/html), /api/download/[id] (zip+single), /api/clones
- Test artifacts: download/cloneworkspace.png, download/clone-books.png, download/clone-mobile.png
- Clone data stored under /home/z/my-project/clones/

---
Task ID: 2
Agent: main (Z.ai)
Task: Upgrade engine to v2 until it can clone https://famsuptasks.com/register

Work Log:
- Probed target: famsuptasks.com/register is a Svelte SPA; /register has NO server route (404 + shell). The real register UI is a MODAL opened by the "Sign Up" button on the homepage. A raw-HTML cloner can never capture it.
- Located existing Chromium at ~/.cache/ms-playwright/chromium-1200; installed playwright-core (no browser download needed)
- Built renderer.ts: lazy singleton headless Chromium, renderPage() (networkidle wait + settle + rendered DOM + innerText sample + screenshot + CTA discovery), captureInteractionState() (replays CTA clicks on fresh pages to capture modal/drawer states), looksLikeNotFound()
- Rewrote rewriter.ts as multi-page orchestrator: render modes (auto/static/browser), auto-escalation when static HTML is thin/404, AUTO-HEALING (requested URL renders 404 view -> clone the origin root and note it), interaction-state capture (max 2), same-origin crawl (max 4 pages) with cross-origin redirect guard, robots.txt awareness (warning), shared AssetStore + CSS cache across pages, per-page slugs (index, index--sign-up, about...), internal-link rewriting to local .html files for offline navigation
- Fixed 3 real bugs during debugging: (1) noscript/Meta-Pixel text polluting cheerio .text() broke 404 detection -> switched to browser innerText sample; (2) over-escaped regex in CTA matcher (\\\\s in TS string); (3) evaluate() closure over Node-side `max` variable silently throwing in browser context -> pass as args object
- store.ts v2: single/ (per-page), mirror/ (multi-page + assets/), shots/ (original screenshots), meta.json with pages[]; 7-day retention
- API v2: POST /api/clone {renderMode, crawl}, GET /api/preview/[id]?page=slug, GET /api/screenshot/[id]?page=slug, GET /api/download/[id]?format=single|zip&page=slug (ZIP includes _screenshots/)
- UI v2: render-engine Select (Auto/Browser/Static) + crawl + keepScripts toggles, capture pills (Main page / State · Sign Up ...), Compare tab (original screenshot vs live clone side-by-side), auto-heal info banner, warnings list, RENDERED/N-captures history badges
- Verified vs target: POST /api/clone famsuptasks.com/register -> auto-escalated to Chromium, auto-healed to root, captured 3 pages (index, index--log-in, index--sign-up), 22 requests, 1.16MB, stack Svelte+Tailwind+Meta Pixel+Cloudflare, palette #ff7300; sign-up state HTML contains full Create-an-account form with 0 remote images; ZIP (28 files) has all 3 HTML pages + assets + _screenshots; agent-browser E2E: state pills switch, register modal renders in iframe, Compare tab matches original, zero page errors, lint clean

Stage Summary:
- Engine v2 can clone JS-rendered SPAs, hidden interaction states (register modals), and dead URLs (auto-heal)
- Target requirement MET: famsuptasks.com/register cloned with the register UI as index--sign-up.html (preview + exports)
- Test artifacts: download/famsu-signup-clone.png, download/famsu-compare.png
- Known limits: cloned pages are static captures (no re-executed app logic unless keepScripts), media iframes stay remote, captcha-protected sites not bypassed

---
Task ID: 3
Agent: main (Z.ai)
Task: Package CloneForge deliverables for download (clone ZIP + project source ZIP)

Work Log:
- Verified latest clone d8d9e11187c2 = famsuptasks.com (auto-healed, 3 pages incl. index--sign-up)
- Wrote scripts/package-downloads.sh
- Built download/famsuptasks-clone.zip (5.2M): multi-page mirror at root (index.html, index--sign-up.html, index--log-in.html + assets/), _screenshots/ of original, single-html/ self-contained versions, clone-meta.json, README.txt with usage instructions
- Built download/cloneforge-source.zip (218K): full Next.js source (src/, public/, prisma/, scripts/, configs) excluding node_modules/.next/clones
- Verified both archives list all key files; dev server still running on port 3000

Stage Summary:
- User-facing downloads ready: download/famsuptasks-clone.zip, download/cloneforge-source.zip

---
Task ID: 4
Agent: main (Z.ai)
Task: Add AI Rebuild feature (clone -> clean Tailwind HTML + React component via GLM)

Work Log:
- Loaded LLM skill; z-ai-web-dev-sdk already installed; added serverExternalPackages to next.config.ts
- Built src/lib/cloner/rebuild.ts:
  - slimForRebuild: strips scripts/styles/comments/base64/long attrs + cheerio removal of announcer/progressier junk
  - extractOverlay: isolates the open modal branch for interaction-state pages (fixed inset-0 / modal / dialog heuristics)
  - extractUnits: deterministic rebuild units - descends framework wrapper divs to the shallowest sibling level, batches <=12KB (no mid-element cuts)
  - Generation: batch mode = independent best-of-N attempts scored by text-probe fidelity (missingProbes vs source DOM); single-shot mode = append-continuation until </html>; 429 retry w/ backoff + semaphore(3) concurrency cap
  - dedupeSections, ensureCdnScript, toPreviewHtml (compiled site CSS + CDN, asset refs -> /api/asset/<id>/)
  - Preview derived at read time; stores rebuild/<slug>.html + .tsx only
- API: POST/GET /api/rebuild/[id]?page=slug; GET /api/asset/[id]/[...path] (serves mirror assets); download format=rebuild
- UI: 4th workspace tab "AI Rebuild" with Preview / HTML + Tailwind / React sub-views, copy + download, animated progress, error retry
- Fixed through 6 debug iterations: (1) output-token truncation -> auto-continuation; (2) hallucinated endings -> continuation prompts now carry full source DOM; (3) mid-section chunk cuts -> cheerio body-children extraction; (4) empty-fragment replies -> hasContent detection + retry; (5) runaway 79KB append loops -> best-of retry + runaway guard; (6) giant-SVG preview -> ensureCdnScript + compiled CSS + CDN cascade
- Verified vs famsu clone d8d9e11187c2: index rebuild 29KB/2.5min with ALL real sections (hero, stats, how-it-works, features, dashboard, testimonials, FAQ, CTA, footer) - zero hallucinations, zero missing probes; sign-up state 5KB overlay-only rebuild in 17s with full form
- E2E via agent-browser: AI Rebuild tab loads cache, preview renders rebuilt page with real assets, HTML/React code views work, zero console errors

Stage Summary:
- AI Rebuild v1 shipped: captured DOM -> clean semantic Tailwind HTML + React TSX, verified by automated text-probe fidelity checks
- Screenshots: download/rebuild-index.png, download/rebuild-signup.png, download/e2e-rebuild-tab.png, download/e2e-react-view.png

---
Task ID: 5
Agent: main (Z.ai)
Task: Fix "Unexpected token 'I', "Internal S"... is not valid JSON" clone error + mobile optimization

Work Log:
- Root cause: multi-minute clone/rebuild requests hold one HTTP connection open; gateways/proxies in front of the preview kill slow requests and return plain-text "Internal Server Error", which the client's res.json() chokes on. Proven server-side: a killed client's clone still completed and saved (clones/996902c226fc).
- Built src/lib/cloner/jobs.ts: file-backed job registry (clones/.jobs/<id>.json) with create/read/update, 2h TTL pruning; survives dev-server reloads
- cloneSite/rebuildPage now accept onProgress(step, message); hooks placed at fetch, render, auto-heal, interaction replay, crawl, asset download, packaging / DOM read, token extraction, Tailwind rebuild, React generation, polish
- API: POST /api/clone and POST /api/rebuild/[id] now start background jobs and return {jobId} in <300ms; new GET /api/jobs/[id] poll endpoint (always JSON, 404 with friendly message if server restarted); /api/clones + /api/clones/[id] wrapped in try/catch so every route returns JSON
- Client: safeJson() helper (parses text first, never throws "Unexpected token"); clone() = start job -> poll every 2s -> real progress steps + live emerald status line -> load clone meta on done; tolerate up to 7 consecutive poll failures; 10min deadline. ensureRebuild() same pattern. Removed fake progress timers.
- Mobile: ensureViewportMeta post-processing on AI-rebuilt HTML (verified in stored rebuild/index.html); preview route injects viewport meta into cloned pages lacking it; hero badge wraps instead of overflowing at 390px; workspace Tabs = icons-only below sm (AI chip collapses to "AI")
- tsconfig excludes clones/download/.next (stored rebuild artifacts broke tsc); fixed cheerio.Element -> domhandler AnyNode in extractUnits
- E2E at 390px: cloned famsuptasks.com/register via UI (POST 241ms, polled job, auto-heal + 3 captures, workspace rendered); ran AI rebuild via UI (job done in 309s, preview shows real headlines/CTAs, responsive); desktop 1440px unchanged; lint + tsc clean
- Repackaged cloneforge-source.zip (130 files incl. jobs.ts + jobs API); refreshed famsuptasks-clone.zip

Stage Summary:
- Clone/rebuild no longer break on gateway timeouts: every request is short; progress is real (engine hooks), UI never parses non-JSON
- Mobile: app fully usable at 390px; cloned + rebuilt pages carry viewport meta
- Screenshots: download/mobile-home.png, mobile-progress.png, mobile-workspace.png, mobile-rebuild-running.png, mobile-rebuild-done.png, desktop-final.png
