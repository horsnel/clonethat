import type { Analysis, ColorInfo, FontInfo, StackItem } from './types'

interface Rule {
  name: string
  category: StackItem['category']
  test: (all: string) => boolean
}

const RULES: Rule[] = [
  // --- Frameworks ---
  { name: 'Next.js', category: 'framework', test: (s) => s.includes('__NEXT_DATA__') || s.includes('/_next/static') },
  { name: 'Nuxt', category: 'framework', test: (s) => s.includes('__NUXT__') || s.includes('/_nuxt/') },
  { name: 'React', category: 'framework', test: (s) => /data-reactroot|__reactContainer|react\.production/.test(s) },
  { name: 'Vue', category: 'framework', test: (s) => /data-v-[0-9a-f]{6,}|vue\.runtime|new Vue\(/.test(s) },
  { name: 'Angular', category: 'framework', test: (s) => /ng-version|ng-app|angular\.min\.js/.test(s) },
  { name: 'Svelte', category: 'framework', test: (s) => /svelte-[a-z0-9]{6}|__sveltekit/.test(s) },
  { name: 'Astro', category: 'framework', test: (s) => /astro-island|\/_astro\//.test(s) },
  { name: 'Gatsby', category: 'framework', test: (s) => s.includes('___gatsby') || s.includes('gatsby-') },
  { name: 'Alpine.js', category: 'framework', test: (s) => /x-data=|alpine(js|\.min)?\.js/.test(s) },
  { name: 'HTMX', category: 'framework', test: (s) => /hx-get=|htmx\.org/.test(s) },
  // --- CMS ---
  { name: 'WordPress', category: 'cms', test: (s) => s.includes('wp-content') || s.includes('wp-includes') },
  { name: 'Shopify', category: 'cms', test: (s) => s.includes('cdn.shopify.com') || s.includes('Shopify.theme') },
  { name: 'Drupal', category: 'cms', test: (s) => s.includes('/sites/default/files') || s.includes('drupal') },
  { name: 'Joomla', category: 'cms', test: (s) => /joomla|\/media\/jui\//.test(s) },
  { name: 'Ghost', category: 'cms', test: (s) => s.includes('ghost-sdk') || s.includes('content_api_key') },
  // --- Builders ---
  { name: 'Wix', category: 'builder', test: (s) => s.includes('wix.com') || s.includes('wixstatic') },
  { name: 'Squarespace', category: 'builder', test: (s) => s.includes('squarespace') },
  { name: 'Webflow', category: 'builder', test: (s) => s.includes('data-wf-page') || s.includes('webflow') },
  { name: 'Framer', category: 'builder', test: (s) => s.includes('framerusercontent') || s.includes('framer.com') },
  { name: 'Carrd', category: 'builder', test: (s) => s.includes('carrd.co') },
  // --- CSS ---
  { name: 'Tailwind CSS', category: 'css', test: (s) => /class="[^"]*(?:flex items-center|justify-between|space-x-|bg-\[|text-(?:xs|sm|lg|xl|2xl|3xl))/.test(s) },
  { name: 'Bootstrap', category: 'css', test: (s) => /bootstrap(?:\.min)?\.(?:css|js)|col-(?:md|lg|sm)-|btn-primary/.test(s) },
  { name: 'Bulma', category: 'css', test: (s) => /bulma(?:\.min)?\.css|class="(?:column|hero |section)/.test(s) },
  { name: 'Font Awesome', category: 'css', test: (s) => /font-?awesome/i.test(s) },
  { name: 'Google Fonts', category: 'css', test: (s) => s.includes('fonts.googleapis.com') },
  // --- Libraries ---
  { name: 'jQuery', category: 'library', test: (s) => /jquery/i.test(s) },
  { name: 'GSAP', category: 'library', test: (s) => /gsap|TweenMax/.test(s) },
  { name: 'Swiper', category: 'library', test: (s) => /swiper/i.test(s) },
  { name: 'Lenis', category: 'library', test: (s) => /lenis/i.test(s) },
  { name: 'Three.js', category: 'library', test: (s) => /three(\.min)?\.js|THREE\./.test(s) },
  { name: 'Lottie', category: 'library', test: (s) => /lottie/i.test(s) },
  // --- Analytics / marketing ---
  { name: 'Google Analytics', category: 'analytics', test: (s) => /gtag\(|google-analytics\.com|googletagmanager\.com\/gtag/.test(s) },
  { name: 'Google Tag Manager', category: 'analytics', test: (s) => /googletagmanager\.com\/gtm\.js|GTM-/.test(s) },
  { name: 'Meta Pixel', category: 'analytics', test: (s) => /connect\.facebook\.net|fbq\(/.test(s) },
  { name: 'Hotjar', category: 'analytics', test: (s) => /hotjar/i.test(s) },
  { name: 'Segment', category: 'analytics', test: (s) => /cdn\.segment\.com|analytics\.track\(/.test(s) },
  { name: 'Intercom', category: 'analytics', test: (s) => /intercom/i.test(s) },
  { name: 'HubSpot', category: 'analytics', test: (s) => /hs-scripts\.com|hubspot/i.test(s) },
  { name: 'TikTok Pixel', category: 'analytics', test: (s) => /analytics\.tiktok\.com|ttq\./.test(s) },
  { name: 'Plausible', category: 'analytics', test: (s) => /plausible\.io/.test(s) },
  { name: 'Cloudflare Insights', category: 'analytics', test: (s) => /cloudflareinsights|beacon\.min\.js/.test(s) },
  // --- Infra ---
  { name: 'Cloudflare', category: 'infra', test: (s) => s.includes('/cdn-cgi/') || s.includes('cloudflare') },
  { name: 'Vercel', category: 'infra', test: (s) => s.includes('vercel') },
  { name: 'Stripe', category: 'infra', test: (s) => s.includes('js.stripe.com') },
  { name: 'Amazon S3 / CloudFront', category: 'infra', test: (s) => /cloudfront\.net|s3\.amazonaws\.com/.test(s) },
  { name: 'jsDelivr', category: 'infra', test: (s) => s.includes('cdn.jsdelivr.net') },
  { name: 'unpkg', category: 'infra', test: (s) => s.includes('unpkg.com') },
]

const GENERIC_FONT_TOKENS = new Set([
  'inherit', 'initial', 'unset', 'sans-serif', 'serif', 'monospace', 'cursive',
  'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded',
  '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'helvetica neue', 'arial',
])

export function analyzeSite(
  html: string,
  cssTexts: string[],
  finalUrl: string,
  opts: { title: string; description: string; lang: string; ogImage: string; favicon: string }
): Analysis {
  const haystack = html + '\n' + cssTexts.join('\n')
  const stack: StackItem[] = []
  for (const rule of RULES) {
    try {
      if (rule.test(haystack)) stack.push({ name: rule.name, category: rule.category })
    } catch {
      // ignore rule failures
    }
  }

  return {
    ...opts,
    finalUrl,
    stack,
    colors: extractColors(cssTexts.join('\n')),
    fonts: extractFonts(cssTexts.join('\n')),
    jsRendered: detectJsRendered(html),
  }
}

function detectJsRendered(html: string): boolean {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (!bodyMatch) return false
  const text = bodyMatch[1]
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const hasRenderMarkers = /__NEXT_DATA__|__NUXT__|id="root"|id="app"|id="__nuxt"/i.test(html)
  return text.length < 300 && hasRenderMarkers
}

function normalizeHex(raw: string): string | null {
  let hex = raw.trim().toLowerCase()
  if (hex.startsWith('#')) hex = hex.slice(1)
  if (/^[0-9a-f]{3}$/.test(hex)) {
    hex = hex.split('').map((c) => c + c).join('')
  } else if (!/^[0-9a-f]{6}$/.test(hex)) {
    if (/^[0-9a-f]{8}$/.test(hex)) hex = hex.slice(0, 6)
    else return null
  }
  return `#${hex}`
}

export function extractColors(css: string): ColorInfo[] {
  const counts = new Map<string, number>()
  const bump = (hex: string) => counts.set(hex, (counts.get(hex) ?? 0) + 1)

  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const hex = normalizeHex(m[0])
    if (hex) bump(hex)
  }
  for (const m of css.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g)) {
    const r = Math.min(255, +m[1]), g = Math.min(255, +m[2]), b = Math.min(255, +m[3])
    bump(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`)
  }
  for (const m of css.matchAll(/hsla?\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%/g)) {
    const [r, g, b] = hslToRgb(+m[1], +m[2] / 100, +m[3] / 100)
    bump(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`)
  }

  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .filter(([hex]) => hex !== '#ffffff' && hex !== '#000000')

  // de-dupe visually-near shades (keep the most frequent of each ~10% bucket)
  const kept: ColorInfo[] = []
  for (const [hex, count] of sorted) {
    const rgb = hexToRgb(hex)
    const tooClose = kept.some((k) => colorDistance(hexToRgb(k.hex), rgb) < 32)
    if (!tooClose) kept.push({ hex, count })
    if (kept.length >= 12) break
  }
  return kept
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

export function extractFonts(css: string): FontInfo[] {
  const counts = new Map<string, number>()
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const list = m[1]
    // take the first family in the list as the primary one
    const first = list.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') ?? ''
    const lower = first.toLowerCase()
    if (!first || GENERIC_FONT_TOKENS.has(lower) || lower.startsWith('var(')) continue
    if (first.length > 40) continue
    const pretty = first.replace(/\s+/g, ' ')
    counts.set(pretty, (counts.get(pretty) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([family, count]) => ({ family, count }))
}
