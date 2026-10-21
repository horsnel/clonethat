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
