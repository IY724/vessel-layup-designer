// -*- mode: js -*-
/**
 * capture-modals.mjs — 拍弹窗与放大视图（自动生成铺层、校核明细、封头放大、公式说明）
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
const ctx = await browser.newContext({ viewport: { width: 1620, height: 1020 }, deviceScaleFactor: 2, locale: 'zh-CN' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(1500)

const manifest = { shots: {}, errors }
const shot = async (name, target) => {
  const loc = target ? page.locator(target).first() : page
  if (target && !(await loc.count())) {
    console.warn('  MISS', name, target)
    return null
  }
  const file = path.join(out, name + '.png')
  await loc.screenshot({ path: file })
  const b = await loc.boundingBox().catch(() => null)
  manifest.shots[name] = { file, size: b ? { w: Math.round(b.width), h: Math.round(b.height) } : null }
  console.log('  shot', name, b ? `${Math.round(b.width)}x${Math.round(b.height)}` : '')
  return loc
}
const closeModal = async () => {
  const btn = page.locator('.modal button', { hasText: '关闭' }).first()
  if (await btn.count()) await btn.click()
  else await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}

// ─── 1. 自动生成铺层弹窗 ───
await page.getByRole('button', { name: '自动生成铺层', exact: true }).click()
await page.waitForTimeout(900)
await shot('modal-auto', '.modal > .box')
await closeModal()

// ─── 2. 校核明细窗口 ───
await page.getByRole('button', { name: '校核明细', exact: true }).click()
await page.waitForTimeout(1200)
await shot('modal-detail', '.modal > .box')
// 明细里的分组，逐个截（正文讲"自上而下整合六大功能区"）
const grpCount = await page.locator('.modal .grp').count()
console.log('  detail groups:', grpCount)
for (let i = 0; i < Math.min(grpCount, 6); i++) {
  await shot('detail-grp' + (i + 1), '.modal .grp:nth-of-type(' + (i + 1) + ')')
}
await closeModal()

// ─── 3. 封头放大视图（轮廓 / 爆压） ───
const domeCard = page.locator('.layout > *:nth-child(2) .card').nth(2)
// 轮廓放大按钮
for (const [name, label] of [['modal-contour', '放大']]) {
  const btns = domeCard.locator('button', { hasText: label })
  const n = await btns.count()
  console.log('  dome 放大 buttons:', n)
  if (n > 0) {
    await btns.nth(0).click()
    await page.waitForTimeout(1000)
    await shot(name, '.modal > .box')
    await closeModal()
  }
}
// 切到厚度分布再放大
const thickBtn = domeCard.locator('button', { hasText: '厚度分布' })
if (await thickBtn.count()) {
  await thickBtn.first().click()
  await page.waitForTimeout(800)
  await shot('right-dome-thickness', '.layout > *:nth-child(2) .card:nth-child(3)')
  const zoomBtns = domeCard.locator('button', { hasText: '放大' })
  if ((await zoomBtns.count()) > 1) {
    await zoomBtns.nth(1).click()
    await page.waitForTimeout(1000)
    await shot('modal-thickness-zoom', '.modal > .box')
    await closeModal()
  }
  // 切回爆压
  const pbBtn = domeCard.locator('button', { hasText: '爆压分布' })
  if (await pbBtn.count()) await pbBtn.first().click()
  await page.waitForTimeout(500)
}

// ─── 4. 公式说明弹窗（分组标题右侧问号） ───
const dot = page.locator('.inputs .card .help-dot').nth(1)
if (await dot.count()) {
  await dot.click()
  await page.waitForTimeout(900)
  await shot('modal-formula', '.modal > .box')
  await closeModal()
}

await writeFile(path.join(out, 'manifest-modals.json'), JSON.stringify(manifest, null, 2), 'utf8')
await browser.close()
console.log('\nerrors:', errors.length, errors.slice(0, 3))

