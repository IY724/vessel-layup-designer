// capture-drive.mjs — 通过 CDP 驱动真实 Electron 窗口，逐步交接给 Python 抓整窗
//
// 分工：
//   Node  : 连 CDP、点击/滚动/开弹窗、取各标注元素相对视口的 CSS 矩形
//   Python: PrintWindow 抓整窗位图（标题栏 + 关闭按钮 + 四周边框）并按矩形画红框
//
// 交接协议：Node 写 step-NN.json → 等 ack-NN.flag → 再动下一步，
// 保证「截图时的画面」与「记录的矩形」严格对应同一状态。
import { chromium } from 'playwright-core'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import path from 'node:path'

const PORT = Number(process.env.CDP_PORT || 9333)
const OUT = process.env.STEP_DIR ||
  'F:\\work_storage\\ruanzhu\\_vessel_rebuild\\winshots'

await mkdir(OUT, { recursive: true })

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
const ctx = browser.contexts()[0]
const page = ctx.pages().find((p) => !p.url().startsWith('devtools://')) || ctx.pages()[0]
await page.waitForSelector('.app', { timeout: 60000 })
await page.waitForTimeout(1200)

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio }))
if (!vp || !vp.w) throw new Error('viewport unavailable: ' + JSON.stringify(vp))
await writeFile(path.join(OUT, 'viewport.json'), JSON.stringify(vp), 'utf8')
console.log('viewport', JSON.stringify(vp))

// 让 application 恰好占满视口：.app 只有 min-height:100%，内容一长整页就会滚动，
// 状态栏被推到可视区之外（截图里就丢了）。固定为视口高度后，左右面板各自内部滚动，
// 顶栏与状态栏始终在窗口内 —— 这才是「完整软件截图」该有的样子。
await page.addStyleTag({
  content: `html,body{height:100%!important;overflow:hidden!important}
            #root{height:100%!important}
            .app{height:100%!important;min-height:0!important}
            .layout{min-height:0!important;overflow:hidden!important}
            .layout>*{min-height:0!important;overflow:auto!important}`,
})
await page.waitForTimeout(700)

/** 取矩形（CSS px，相对视口）。expr 里用 a 代表传入的索引/参数 */
async function rectOf(expr, arg) {
  try {
    const r = await page.evaluate(([src, a]) => {
      const el = new Function('a', `return ${src}`)(a)
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { x: b.left, y: b.top, w: b.width, h: b.height }
    }, [expr, arg ?? null])
    return r
  } catch (e) {
    console.log('   ! rect', expr, String(e).slice(0, 90))
    return null
  }
}

const SEL_LEFT = "document.querySelectorAll('.layout > *:first-child .card')"
const SEL_RIGHT = "document.querySelectorAll('.layout > *:nth-child(2) .card')"

async function scrollCard(which, idx) {
  const sel = which === 'left' ? '.layout > *:first-child .card' : '.layout > *:nth-child(2) .card'
  await page.evaluate(([s, i]) => {
    const el = document.querySelectorAll(s)[i]
    if (el) el.scrollIntoView({ block: 'center' })
  }, [sel, idx])
  await page.waitForTimeout(550)
}

let seq = 0
async function handoff(name, annots) {
  const clean = {}
  for (const [k, v] of Object.entries(annots || {})) {
    if (v && v.w >= 20 && v.h >= 15) clean[k] = v
  }
  seq += 1
  const tag = String(seq).padStart(2, '0')
  await writeFile(path.join(OUT, `step-${tag}.json`),
    JSON.stringify({ seq, name, annots: clean }), 'utf8')
  const ack = path.join(OUT, `ack-${tag}.flag`)
  for (let i = 0; i < 300; i += 1) {
    try { await access(ack); return } catch { await sleep(120) }
  }
  throw new Error('ack timeout: ' + name)
}

// ── 1. 主界面 ──
await page.evaluate(() => {
  const l = document.querySelector('.layout > *:first-child'); if (l) l.scrollTop = 0
  const r = document.querySelector('.layout > *:nth-child(2)'); if (r) r.scrollTop = 0
})
await page.waitForTimeout(700)
await handoff('win-main', {
  topbar: await rectOf("document.querySelector('.topbar')"),
  left: await rectOf("document.querySelector('.layout > *:first-child')"),
  right: await rectOf("document.querySelector('.layout > *:nth-child(2)')"),
  status: await rectOf("document.querySelector('.statusbar')"),
})

// ── 2. 左栏五个分组（滚到视野中间，圈出该组） ──
const LEFT = ['geometry', 'fiber', 'strength', 'design', 'cylinder']
for (let i = 0; i < LEFT.length; i += 1) {
  await scrollCard('left', i)
  await handoff('win-card-' + LEFT[i], { card: await rectOf(`${SEL_LEFT}[a]`, i) })
}
await page.evaluate(() => {
  const l = document.querySelector('.layout > *:first-child'); if (l) l.scrollTop = 0
})
await page.waitForTimeout(400)

// ── 3. 右栏卡片 ──
const RIGHT = ['result', 'layup', 'dome', 'vol', 'line']
for (let i = 0; i < RIGHT.length; i += 1) {
  await scrollCard('right', i)
  await handoff('win-' + RIGHT[i], { card: await rectOf(`${SEL_RIGHT}[a]`, i) })
}

// ── 4. 自动生成铺层弹窗 ──
await page.evaluate(() => {
  const r = document.querySelector('.layout > *:nth-child(2)'); if (r) r.scrollTop = 0
})
await page.waitForTimeout(400)
await page.getByRole('button', { name: '自动生成铺层', exact: true }).click()
await page.waitForTimeout(1300)
await handoff('win-modal-auto', {
  box: await rectOf("document.querySelector('.modal > .box')"),
  picker: await rectOf("document.querySelector('.expansion-picker')"),
})
await page.locator('.modal button', { hasText: '关闭' }).first().click()
await page.waitForTimeout(800)

// ── 5. 校核明细弹窗 ──
await page.getByRole('button', { name: '校核明细', exact: true }).click()
await page.waitForTimeout(1800)
await handoff('win-modal-detail', {
  box: await rectOf("document.querySelector('.modal > .box')"),
})
await page.locator('.modal button', { hasText: '关闭' }).first().click()
await page.waitForTimeout(800)

// ── 6. 封头两图放大 ──
await scrollCard('right', 2)
for (const [nth, tag] of [[0, 'contour'], [1, 'pressure']]) {
  const btn = page.locator('.layout > *:nth-child(2) .card').nth(2)
    .locator('button', { hasText: '放大' }).nth(nth)
  if (!(await btn.count())) { console.log('   MISS 放大', nth); continue }
  await btn.click()
  await page.waitForTimeout(1300)
  await handoff('win-zoom-' + tag, { box: await rectOf("document.querySelector('.modal > .box')") })
  await page.locator('.modal button', { hasText: '关闭' }).first().click()
  await page.waitForTimeout(800)
}

// ── 7. 厚度分布视图 ──
{
  const tb = page.locator('.layout > *:nth-child(2) .card').nth(2)
    .locator('button', { hasText: '厚度分布' })
  if (await tb.count()) {
    await tb.first().click()
    await page.waitForTimeout(1200)
    await handoff('win-dome-thickness', { card: await rectOf(`${SEL_RIGHT}[a]`, 2) })
    const pb = page.locator('.layout > *:nth-child(2) .card').nth(2)
      .locator('button', { hasText: '爆压分布' })
    if (await pb.count()) await pb.first().click()
    await page.waitForTimeout(500)
  }
}

// ── 8. 公式说明弹窗 ──
{
  const dot = page.locator('.layout > *:first-child .card .help-dot').nth(1)
  if (await dot.count()) {
    await dot.click()
    await page.waitForTimeout(1200)
    await handoff('win-modal-formula', { box: await rectOf("document.querySelector('.modal > .box')") })
    await page.locator('.modal button', { hasText: '关闭' }).first().click()
    await page.waitForTimeout(700)
  }
}

await writeFile(path.join(OUT, 'steps.json'),
  JSON.stringify({ viewport: vp, count: seq, errors }, null, 2), 'utf8')
console.log('steps:', seq, 'errors:', errors.length)
await browser.close()
