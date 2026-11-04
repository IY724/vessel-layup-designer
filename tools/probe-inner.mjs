// -*- mode: js -*-
/** probe-inner.mjs — 探出各目标卡片内部可标注的子块 */
import { chromium } from 'playwright-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const url = 'file:///' + path.join(root, 'dist/index.html').replace(/\\/g, '/')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1620, height: 1020 } })
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(1500)

const desc = async (sel, nth = 0) => {
  const loc = page.locator(sel).nth(nth)
  if (!(await loc.count())) return null
  return loc.evaluate((el) => {
    const out = []
    const walk = (n, d) => {
      if (d > 2) return
      const r = n.getBoundingClientRect()
      if (r.width > 80 && r.height > 40) {
        out.push({ d, tag: n.tagName, cls: String(n.className).slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) })
      }
      ;[...n.children].forEach((c) => walk(c, d + 1))
    }
    walk(el, 0)
    return out.slice(0, 12)
  })
}

console.log('=== right-dome ===')
console.log(JSON.stringify(await desc('.layout > *:nth-child(2) .card', 2), null, 1))
console.log('=== right-vol ===')
console.log(JSON.stringify(await desc('.layout > *:nth-child(2) .card', 3), null, 1))
console.log('=== right-line ===')
console.log(JSON.stringify(await desc('.layout > *:nth-child(2) .card', 4), null, 1))

await page.getByRole('button', { name: '自动生成铺层', exact: true }).click()
await page.waitForTimeout(800)
console.log('=== modal-auto box children ===')
console.log(JSON.stringify(await desc('.modal > .box'), null, 1))
await browser.close()
