/* Click Sign Up / Log In buttons and trace navigation */
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
    await page.goto('https://famsuptasks.com', { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2500)

    // find elements whose text mentions Sign Up / Log In
    const candidates = await page.evaluate(() => {
      const out: { tag: string; text: string; href: string | null }[] = []
      for (const el of document.querySelectorAll('a, button, [role="button"]')) {
        const t = (el.textContent ?? '').trim().toLowerCase()
        if (t.includes('sign up') || t.includes('log in') || t.includes('login') || t.includes('register') || t.includes('start earning')) {
          out.push({ tag: el.tagName, text: t.slice(0, 40), href: (el as HTMLAnchorElement).href ?? null })
        }
      }
      return out
    })
    console.log('candidates:', JSON.stringify(candidates, null, 1))

    // click the first "sign up"-ish element
    for (const label of ['Sign Up', 'Start Earning']) {
      const el = page.locator(`text=${label}`).first()
      if (await el.count() > 0) {
        console.log(`clicking "${label}"...`)
        await el.click({ timeout: 5000 }).catch((e) => console.log('click failed:', e.message.split('\n')[0]))
        await page.waitForTimeout(3000)
        console.log('URL now:', page.url())
        const inputs = await page.evaluate(() => document.querySelectorAll('input').length)
        const text = await page.evaluate(() => document.body.innerText.slice(0, 200).replace(/\n/g, ' | '))
        console.log(`inputs=${inputs} text="${text}"`)
        await page.screenshot({ path: `/tmp/famsu-${label.replace(/\s+/g, '-')}.png` })
        break
      }
    }
  } finally {
    await browser.close()
  }
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
