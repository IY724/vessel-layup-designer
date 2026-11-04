// -*- mode: js -*-
/**
 * capture-all.mjs — 从新版软件重新拍摄说明书所需全部界面截图
 *
 * 设计说明书的图文顺序：
 *   全局图（浏览器内 / 桌面窗口）、主界面分区、五大参数分组、
 *   自动生成铺层弹窗、筒身铺层方案表、计算结果卡片、校核明细、
 *   封头双图与放大图、容积互算、线型切点设计。
 *
 * 输出（deviceScaleFactor=2，Word 里按 cm 缩放依旧清晰）：
 *   <out>/app-window.png      桌面窗口全貌（无浏览器外壳）
 *   <out>/left-panel.png      左栏参数面板整列（含 6 个分组卡片）
 *   <out>/card-<key>.png      单独分组卡片
 *   <out>/right-<key>.png     右栏各卡片
 *   <out>/modal-<key>.png     各弹窗
 * manifest.json 记录每张图的尺寸，以及容器内子元素的相对框（供 Word 画红框）。
 */
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const tag = process.argv[2] ?? 'final'
const out = path.join(root, 'output/softcopyright-shots', tag)
await mkdir(out, { recursive: true })

const url = 'file:///' + path.join(root, 'dist/index.html').replace(/\\/g, '/')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({
  viewport: { width: 1620, height: 1020 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(1500)

const manifest = { viewport: { w: 1620, h: 1020 }, scale: 2, shots: {}, errors }

/** 截图一个选择器（第 nth 个），并记录其内部子元素相对该图的像素框 */
const shotEl = async (name, sel, nth = 0, childBoxes = {}) => {
  const loc = page.locator(sel).nth(nth)
  if (!(await loc.count())) {
    console.warn('  MISS', name, sel, nth)
    return
  }
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(150)
  const file = path.join(out, name + '.png')
  await loc.screenshot({ path: file })
  const base = await loc.boundingBox()
  const boxes = {}
  for (const [k, csel] of Object.entries(childBoxes)) {
    const cl = loc.locator(csel).first()
    if (!(await cl.count())) continue
    const b = await cl.boundingBox()
    if (!b) continue
    boxes[k] = {
      x: Math.round(b.x - base.x),
      y: Math.round(b.y - base.y),
      w: Math.round(b.width),
      h: Math.round(b.height),
    }
  }
  manifest.shots[name] = { file, size: { w: Math.round(base.width), h: Math.round(base.height) }, boxes }
  console.log('  shot', name, `${Math.round(base.width)}x${Math.round(base.height)}`, Object.keys(boxes).join(','))
}

// ─────────── 1. 桌面窗口全貌 ───────────
const winFile = path.join(out, 'app-window.png')
await page.screenshot({ path: winFile })
manifest.shots['app-window'] = { file: winFile, size: { w: 1620, h: 1020 }, boxes: {} }
console.log('  shot app-window')

// ─────────── 2. 左栏参数面板（整列，含全部 6 个分组） ───────────
// 先把左栏所有卡片展开（分组折叠时点击标题展开）
await page.evaluate(() => {
  document.querySelectorAll('.inputs .card-header, .inputs .card-hd').forEach((el) => {
    if (el.getAttribute('aria-expanded') === 'false') el.click()
  })
})
await page.waitForTimeout(400)
await shotEl('left-panel', '.inputs', 0, {
  geometry: '.card:nth-child(1)',
  fiber: '.card:nth-child(2)',
  strength: '.card:nth-child(3)',
  design: '.card:nth-child(4)',
  cylinder: '.card:nth-child(5)',
  overview: '.card:nth-child(6)',
})

// 逐卡片单独截图（文档正文按板块讲解时用）
for (const [i, key] of ['geometry', 'fiber', 'strength', 'design', 'cylinder', 'overview'].entries()) {
  await shotEl('card-' + key, '.inputs .card', i)
}

// ─────────── 3. 右栏各功能卡片 ───────────
// 左栏也带 .panel 类，必须用 .layout 的第二个子列限定范围
const RIGHT = '.layout > *:nth-child(2) .card'
for (const [i, key] of ['result', 'layup', 'dome', 'vol', 'line'].entries()) {
  await shotEl('right-' + key, RIGHT, i)
}

await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
await browser.close()
console.log('\nerrors:', errors.length)
console.log('out:', out)
