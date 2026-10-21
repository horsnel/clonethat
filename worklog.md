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
