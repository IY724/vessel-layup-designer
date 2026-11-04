// -*- mode: js -*-
/**
 * capture-annotated.mjs — 最终截图：每张图同时记录「红框标注区」的相对位置
 *
 * 设计说明书要在正文里用红框圈出各板块，因此每张截图都要带回
 * 相对该图左上角的像素框，供 Word 侧按比例换算成浮动矩形。
 *
 * 输出到 output/softcopyright-shots/doc/，manifest.json 含：
 *   { name: { file, size:{w,h}, boxes:[{key,cx,cy,cw,ch}] } }  // px，相对图左上角
 */
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const out = path.join(root, 'output/softcopyright-shots/doc')
await mkdir(out, { recursive: true })
const url = 'file:///' + path.join(root, 'dist/index.html').replace(/\\/g, '/')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1620, height: 1020 }, deviceScaleFactor: 2, locale: 'zh-CN', acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(1500)

const manifest = { scale: 2, shots: {}, errors }

/**
 * 截取 target 选择器（第 nth 个），并记录 annots 里各子选择器相对该图的框。
 * annots: { key: cssSel } —— 只取第一个匹配
 */
async function grab(name, target, nth = 0, annots = {}) {
  const loc = page.locator(target).nth(nth)
  if (!(await loc.count())) {
    console.warn('  MISS', name, target, nth)
    return
  }
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(200)
  const file = path.join(out, name + '.png')
  await loc.screenshot({ path: file })
  const info = await loc.evaluate(
    (el, sel) => {
      const base = el.getBoundingClientRect()
      const res = []
      for (const [key, css] of Object.entries(sel)) {
        const nodes = [...el.querySelectorAll(css)]
        nodes.forEach((n, i) => {
          const r = n.getBoundingClientRect()
          if (r.width < 40 || r.height < 25) return
          res.push({
            key: nodes.length > 1 ? key + '#' + (i + 1) : key,
            cx: Math.round(r.left - base.left),
            cy: Math.round(r.top - base.top),
            cw: Math.round(r.width),
            ch: Math.round(r.height),
          })
        })
      }
      return { w: Math.round(base.width), h: Math.round(base.height), boxes: res }
    },
    annots
  )
  manifest.shots[name] = { file, size: { w: info.w, h: info.h }, boxes: info.boxes }
  console.log('  grab', name, `${info.w}x${info.h}`, 'boxes:', info.boxes.map((b) => b.key).join(',') || '-')
}

// ───────────── 1. 全局图（浏览器内） ─────────────
{
  const html = await page.evaluate(() => document.getElementById('root').innerHTML)
  await page.evaluate((inner) => {
    const b = document.body
    b.innerHTML = ''
    b.style.cssText = 'margin:0;background:#dee1e6'
    const shell = document.createElement('div')
    shell.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;font-family:"Segoe UI","Microsoft YaHei",sans-serif'
    shell.innerHTML =
      '<div style="height:38px;background:#dee1e6;display:flex;align-items:flex-end;padding:0 8px;flex:0 0 auto">' +
      '<div style="display:flex;align-items:center;gap:7px;background:#fff;border-radius:8px 8px 0 0;padding:7px 16px 8px;font-size:12.5px;color:#3c4043;max-width:360px">' +
      '<span style="width:14px;height:14px;background:#0b7d3e;border-radius:2px"></span>' +
      '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">复合材料气瓶缠绕铺层设计软件-网页版</span></div>' +
      '<div style="padding:0 14px 9px;font-size:19px;color:#5f6368">+</div></div>' +
      '<div id="__bar" style="height:44px;background:#fff;display:flex;align-items:center;gap:10px;padding:0 14px;flex:0 0 auto;border-bottom:1px solid #dadce0">' +
      '<span style="font-size:17px;color:#5f6368">&#8592;</span><span style="font-size:17px;color:#5f6368">&#8594;</span>' +
      '<span style="font-size:16px;color:#5f6368">&#8635;</span>' +
      '<div id="__url" style="flex:1;height:30px;background:#f1f3f4;border-radius:15px;display:flex;align-items:center;padding:0 15px;font-size:13px;color:#202124;gap:7px">' +
      '<span style="color:#5f6368;font-size:12px">&#128274;</span>' +
      '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">file:///D:/交付/复合材料气瓶缠绕铺层设计软件-网页版.html</span></div>' +
      '<span style="font-size:16px;color:#5f6368">&#9734;</span><span style="font-size:16px;color:#5f6368">&#8942;</span></div>' +
      '<div id="__view" style="flex:1 1 auto;overflow:hidden;background:#fff"></div>'
    b.appendChild(shell)
    const v = document.getElementById('__view')
    v.innerHTML = inner
    document.querySelectorAll('#__view .app').forEach((el) => (el.style.height = '100%'))
  }, html)
  await page.waitForTimeout(1200)
  const file = path.join(out, 'fig-web-global.png')
  await page.screenshot({ path: file })
  // 记录地址栏（红框圈出"这是在浏览器里打开"）
  const bar = await page.locator('#__url').boundingBox()
  manifest.shots['fig-web-global'] = {
    file,
    size: { w: 1600, h: 1000 },
    boxes: bar
      ? [{ key: 'addressbar', cx: Math.round(bar.x), cy: Math.round(bar.y), cw: Math.round(bar.width), ch: Math.round(bar.height) }]
      : [],
  }
  console.log('  grab fig-web-global 1600x1000 boxes: addressbar')
  // 恢复
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
}

// ───────────── 2. 桌面窗口全貌 ─────────────
await grab('fig-app-window', 'body', 0, {})

// ───────────── 3. 左栏参数面板各分组（红框逐组圈出） ─────────────
await grab('fig-panel-groups', '.layout > *:first-child', 0, {
  g_geometry: '.card:nth-child(1)',
  g_fiber: '.card:nth-child(2)',
  g_strength: '.card:nth-child(3)',
  g_design: '.card:nth-child(4)',
  g_cylinder: '.card:nth-child(5)',
  g_overview: '.card:nth-child(6)',
})

// 单卡片（正文逐板块讲解）
await grab('fig-card-geometry', '.layout > *:first-child .card', 0, {
  polarmode: '.radio, .field:nth-child(2)',
})
await grab('fig-card-fiber', '.layout > *:first-child .card', 1, {
  derived: '.hint',
})
await grab('fig-card-strength', '.layout > *:first-child .card', 2, {
  mode: '.radio',
})
await grab('fig-card-design', '.layout > *:first-child .card', 3, {})
await grab('fig-card-cylinder', '.layout > *:first-child .card', 4, {})

// ───────────── 4. 右栏功能卡片 ─────────────
await grab('fig-result', '.layout > *:nth-child(2) .card', 0, { table: 'table' })
await grab('fig-layup', '.layout > *:nth-child(2) .card', 1, { table: 'table' })
await grab('fig-dome', '.layout > *:nth-child(2) .card', 2, {
  left: '.pane:nth-child(1)',
  right: '.pane:nth-child(2)',
})
await grab('fig-vol', '.layout > *:nth-child(2) .card', 3, { pane: '.pane' })
await grab('fig-line', '.layout > *:nth-child(2) .card', 4, {
  left: '.pane:nth-child(1)',
  right: '.pane:nth-child(2)',
})

// ───────────── 5. 弹窗 ─────────────
await page.getByRole('button', { name: '自动生成铺层', exact: true }).click()
await page.waitForTimeout(900)
await grab('fig-auto', '.modal > .box', 0, {
  summary: '.initial-summary',
  picker: '.expansion-picker',
  foot: '.dlg-foot',
})
await page.locator('.modal button', { hasText: '关闭' }).first().click()
await page.waitForTimeout(600)

await page.getByRole('button', { name: '校核明细', exact: true }).click()
await page.waitForTimeout(1200)
await grab('fig-detail', '.modal > .box', 0, { groups: '.grp' })
await page.locator('.modal button', { hasText: '关闭' }).first().click()
await page.waitForTimeout(600)

// 封头放大两图
const domeCard = page.locator('.layout > *:nth-child(2) .card').nth(2)
const zoomBtns = domeCard.locator('button', { hasText: '放大' })
await zoomBtns.nth(0).click()
await page.waitForTimeout(1000)
await grab('fig-zoom-contour', '.modal > .box', 0, {})
await page.locator('.modal button', { hasText: '关闭' }).first().click()
await page.waitForTimeout(600)
await zoomBtns.nth(1).click()
await page.waitForTimeout(1000)
await grab('fig-zoom-pressure', '.modal > .box', 0, {})
await page.locator('.modal button', { hasText: '关闭' }).first().click()
await page.waitForTimeout(600)

// 厚度分布视图
const thickBtn = domeCard.locator('button', { hasText: '厚度分布' })
if (await thickBtn.count()) {
  await thickBtn.first().click()
  await page.waitForTimeout(900)
  await grab('fig-dome-thickness', '.layout > *:nth-child(2) .card', 2, {
    left: '.pane:nth-child(1)',
    right: '.pane:nth-child(2)',
  })
  const pb = domeCard.locator('button', { hasText: '爆压分布' })
  if (await pb.count()) await pb.first().click()
  await page.waitForTimeout(400)
}

// 公式说明
const dot = page.locator('.layout > *:first-child .card .help-dot').nth(1)
if (await dot.count()) {
  await dot.click()
  await page.waitForTimeout(900)
  await grab('fig-formula', '.modal > .box', 0, {})
  await page.locator('.modal button', { hasText: '关闭' }).first().click()
  await page.waitForTimeout(500)
}

// PDF 预览
await page.getByRole('button', { name: '导出 PDF 计算书' }).click()
await page.waitForTimeout(6500)
await grab('fig-pdf-preview', '.modal > .box', 0, {})
await page.locator('.modal button', { hasText: '关闭' }).first().click().catch(() => {})
await page.waitForTimeout(500)

await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
await browser.close()
console.log('\nerrors:', errors.length, errors.slice(0, 3))
console.log('out:', out)
