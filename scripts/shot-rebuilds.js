/* Screenshot the AI-rebuild previews (index + sign-up) for visual verification */
const { chromium } = require('playwright-core')
const path = require('path')

const CHROMIUM = process.env.HOME + '/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  // fetch cached previews from the API
  const fs = require('fs')
  for (const slug of ['index', 'index--sign-up']) {
    const res = await fetch(`http://localhost:3000/api/rebuild/d8d9e11187c2?page=${slug}`)
    if (!res.ok) { console.log(slug, 'no rebuild yet:', res.status); continue }
    const data = await res.json()
    const tmp = `/tmp/rb-${slug}.html`
    fs.writeFileSync(tmp, data.previewHtml)
    await page.goto('file://' + tmp, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(800)
    const out = `/home/z/my-project/download/rebuild-${slug}.png`
    await page.screenshot({ path: out, fullPage: slug === 'index' })
    const textLen = (await page.evaluate(() => document.body.innerText.length))
    const imgCount = await page.evaluate(() => document.querySelectorAll('img').length)
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll('img')].filter((i) => !i.complete || i.naturalWidth === 0).length)
    console.log(`${slug}: text=${textLen} chars, imgs=${imgCount}, broken=${broken} -> ${out}`)
  }

  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
