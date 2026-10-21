/* Standalone test: render famsuptasks.com/register with headless Chromium */
import { chromium } from 'playwright-core'

const EXEC = '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

async function main() {
  const browser = await chromium.launch({
    executablePath: EXEC,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  })
  const page = await ctx.newPage()
  try {
    const resp = await page.goto('https://famsuptasks.com/register', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    })
    console.log('goto status:', resp?.status())
    // wait for network to settle + JS to render
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => console.log('networkidle timeout (ok)'))
    await page.waitForTimeout(2500)
    const html = await page.content()
    const title = await page.title()
    const textLen = await page.evaluate(() => document.body.innerText.length)
    const inputs = await page.evaluate(() => document.querySelectorAll('input').length)
    const buttons = await page.evaluate(() => document.querySelectorAll('button, [role="button"]').length)
    const styles = await page.evaluate(() => document.querySelectorAll('style').length)
    console.log('title:', title)
    console.log('rendered html bytes:', html.length)
    console.log('body innerText length:', textLen)
    console.log('inputs:', inputs, '| buttons:', buttons, '| style tags:', styles)
    await page.screenshot({ path: '/tmp/famsu-rendered.png' })
    console.log('screenshot saved')
  } finally {
    await browser.close()
  }
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
// debug second pass: log body html + console errors
