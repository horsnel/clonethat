#!/bin/bash
# Package CloneForge deliverables for download:
#   1. famsuptasks-clone.zip      — the cloned site (multi-page mirror + screenshots + single-file HTMLs)
#   2. cloneforge-source.zip      — the full CloneForge Next.js project source

set -e
BASE=/home/z/my-project
DL=$BASE/download
CLONE_ID=d8d9e11187c2
CLONE=$BASE/clones/$CLONE_ID

# ---------- 1. Clone ZIP ----------
STAGE=$BASE/.stage-clone/famsuptasks-clone
rm -rf "$BASE/.stage-clone" && mkdir -p "$STAGE"

# Mirror site at zip root: ready to serve with any static server
cp -r "$CLONE/mirror/." "$STAGE/"

# Original screenshots next to it
mkdir -p "$STAGE/_screenshots"
cp -r "$CLONE/shots/." "$STAGE/_screenshots/" 2>/dev/null || true

# Convenience: self-contained single-file versions
mkdir -p "$STAGE/single-html"
cp -r "$CLONE/single/." "$STAGE/single-html/" 2>/dev/null || true

# Metadata + README
cp "$CLONE/meta.json" "$STAGE/clone-meta.json"

cat > "$STAGE/README.txt" <<'EOF'
CloneForge Clone — famsuptasks.com
==================================
Source requested : https://famsuptasks.com/register
Final URL        : https://famsuptasks.com/ (auto-healed: /register renders a client-side 404;
                   the real Sign-Up form is a modal captured as index--sign-up.html)
Captured pages   : index.html          (homepage)
                   index--sign-up.html (Sign-Up modal state  <- the register form)
                   index--log-in.html  (Log-In modal state)
Render mode      : headless Chromium (JS rendered) + interaction replay
Detected stack   : Svelte, Tailwind CSS, Meta Pixel, Cloudflare
Brand color      : #ff7300

HOW TO USE
----------
The root of this folder IS the site (index.html + assets/). To view:
  - Just open index.html in a browser (assets are relative), or
  - Serve it:  python3 -m http.server 8080   then visit http://localhost:8080

  index--sign-up.html contains the "Create an account" register form
  captured by replaying the Sign-Up button click on the original site.

  single-html/  — each page as ONE self-contained file (assets inlined as base64),
                  no assets folder needed.
  _screenshots/ — screenshots of the ORIGINAL site pages for fidelity comparison.
  clone-meta.json — full engine metadata (analysis, warnings, timestamps).
EOF

cd "$STAGE" && zip -qr "$DL/famsuptasks-clone.zip" . -x ".*"
rm -rf "$BASE/.stage-clone"
echo "[1/2] clone zip -> $DL/famsuptasks-clone.zip ($(du -h "$DL/famsuptasks-clone.zip" | cut -f1))"

# ---------- 2. Project source ZIP ----------
cd "$BASE"
zip -qr "$DL/cloneforge-source.zip" \
  src public prisma scripts tests examples \
  package.json tsconfig.json next.config.ts tailwind.config.ts postcss.config.mjs \
  components.json eslint.config.mjs Caddyfile bun.lock \
  -x "node_modules/*" ".next/*" "src/generated/*"
echo "[2/2] source zip -> $DL/cloneforge-source.zip ($(du -h "$DL/cloneforge-source.zip" | cut -f1))"

echo "---verify---"
unzip -l "$DL/famsuptasks-clone.zip" | head -20
echo "..."
unzip -l "$DL/cloneforge-source.zip" | tail -5
