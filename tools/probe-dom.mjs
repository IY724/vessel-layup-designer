// -*- mode: js -*-
/** probe-dom.mjs — 探出界面结构，为逐板块截图定位选择器 */
import { chromium } from 'playwright-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const url = 'file:///' + path.join(root, 'dist/index.html').replace(/\\/g, '/')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(1200)

const dump = await page.evaluate(() => {
  const out = {}
  out.topbarButtons = [...document.querySelectorAll('.topbar button')].map((b) => b.textContent.trim())
  out.layoutChildren = [...document.querySelectorAll('.layout > *')].map((e) => e.className)
  out.panes = [...document.querySelectorAll('.pane')].map((e) => e.className)
  out.cards = [...document.querySelectorAll('.card')].map((e) => {
    const h = e.querySelector('h2,h3,.ttl,.hd')
    return { cls: e.className, title: (h ? h.textContent : e.textContent).trim().slice(0, 40) }
  })
  out.groups = [...document.querySelectorAll('.grp')].map((e) => {
    const h = e.querySelector('h3,h4,.ttl')
    return { cls: e.className, title: (h ? h.textContent : e.textContent).trim().slice(0, 40) }
  })
  out.helpDots = document.querySelectorAll('.help-dot').length
  // 左栏分组
  out.leftGroups = [...document.querySelectorAll('.layout > *:first-child .grp, .layout > *:first-child .card')].map(
    (e) => ({ cls: e.className, title: e.textContent.trim().slice(0, 30) })
  )
  out.hasCanvas = document.querySelectorAll('canvas').length
  out.hasSvg = document.querySelectorAll('svg').length
  return out
})
console.log(JSON.stringify(dump, null, 2))

// 打开自动生成铺层弹窗看结构
await page.getByRole('button', { name: '自动生成铺层', exact: true }).click()
await page.waitForTimeout(800)
const modal = await page.evaluate(() => {
  const m = document.querySelector('.modal')
  if (!m) return null
  return {
    cls: m.className,
    title: (m.querySelector('h2,h3,.ttl')?.textContent || '').trim().slice(0, 50),
    tables: m.querySelectorAll('table').length,
    rows: m.querySelectorAll('tr').length,
    buttons: [...m.querySelectorAll('button')].map((b) => b.textContent.trim()).slice(0, 12),
    box: (() => { const r = m.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } })(),
  }
})
console.log('\nAUTO MODAL:', JSON.stringify(modal, null, 2))

await browser.close()
