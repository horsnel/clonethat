/* Explore famsuptasks.com: render homepage, extract links/routes */
import { chromium } from 'playwright-core'

const EXEC = '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

async function main() {
  const browser = await chromium.launch({
    executablePath: EXEC,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 900 }, locale: 'en-US' })
  const page = await ctx.newPage()
  try {
    const resp = await page.goto('https://famsuptasks.com', { waitUntil: 'domcontentloaded', timeout: 45000 })
    console.log('home status:', resp?.status())
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(3000)
    console.log('title:', await page.title())
    console.log('innerText len:', await page.evaluate(() => document.body.innerText.length))
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('a[href]')].map((a) => (a as HTMLAnchorElement).getAttribute('href')).slice(0, 40)
    )
    console.log('links:', JSON.stringify(links, null, 0))
    const text = await page.evaluate(() => document.body.innerText.slice(0, 500))
    console.log('text sample:', JSON.stringify(text))
    // try common auth routes
    for (const route of ['/register', '/signup', '/sign-up', '/login', '/auth/login', '/auth/register', '/create-account']) {
      const r = await page.goto(`https://famsuptasks.com${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null)
      await page.waitForTimeout(1200)
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 120).replace(/\n/g, ' | '))
      const inputs = await page.evaluate(() => document.querySelectorAll('input').length)
      console.log(`${route} -> status ${r?.status()} inputs=${inputs} text="${bodyText.slice(0, 90)}"`)
    }
  } finally {
    await browser.close()
  }
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
