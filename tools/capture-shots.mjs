// -*- mode: js -*-
/**
 * capture-shots.mjs — 按设计说明书图文顺序重新拍摄全部界面截图（网页版，Chrome）
 *
 * 输出到 output/softcopyright-shots/<tag>/
 *   web-global.png        浏览器窗口内的全局图（带地址栏，看得出是在浏览器打开）
 *   dock-*.png            各功能板块
 * 每张图都记录 viewport / 元素框，供 Word 侧红框标注换算坐标。
 */
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const tag = process.argv[2] ?? 'run1'
const out = path.join(root, 'output/softcopyright-shots', tag)
await mkdir(out, { recursive: true })

const indexHtml = path.join(root, 'dist/index.html')
const url = 'file:///' + indexHtml.replace(/\\/g, '/')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
// 桌面常见宽高：让全局图接近真实浏览器窗口观感
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
})
const page = await ctx.newPage()
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(1500)

const log = []
const shot = async (name, opts = {}) => {
  const file = path.join(out, name + '.png')
  await page.screenshot({ path: file, ...opts })
  log.push({ name, file, opts })
  console.log('shot', name)
}

// 记录若干元素的屏幕框，供后续在 Word 里画红框
const boxes = async (selectors) => {
  const res = {}
  for (const [k, sel] of Object.entries(selectors)) {
    const loc = page.locator(sel).first()
    if (await loc.count()) {
      const b = await loc.boundingBox()
      if (b) res[k] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
    }
  }
  return res
}

const meta = { url, viewport: { width: 1600, height: 1000 }, shots: [], boxes: {} }

// 0) 给地址栏一个像样的本地路径显示：file:// 打开时 Chrome 会显示完整路径
//    先截「浏览器窗口」全局图——headless 下没有真实窗口边框，
//    因此改为在页面外层包一层浏览器外壳（地址栏+标签页），由本脚本注入后截图。
await page.waitForTimeout(500)

// —— 1. 全局图（注入浏览器外壳）——
await page.evaluate(() => {
  const b = document.body
  const app = b.innerHTML
  b.innerHTML = ''
  b.style.margin = '0'
  b.style.background = '#dee1e6'
  const shell = document.createElement('div')
  shell.id = '__shell'
  shell.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;font-family:"Segoe UI","Microsoft YaHei",sans-serif'
  shell.innerHTML = `
    <div style="height:40px;background:#dee1e6;display:flex;align-items:flex-end;padding:0 8px;gap:2px;flex:0 0 auto">
      <div style="display:flex;align-items:center;gap:6px;background:#ffffff;border-radius:8px 8px 0 0;padding:7px 14px 8px;font-size:12px;color:#3c4043;max-width:300px;box-shadow:0 -1px 2px rgba(0,0,0,.06)">
        <span style="width:13px;height:13px;background:#0b7d3e;border-radius:2px;display:inline-block"></span>
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">复合材料气瓶缠绕铺层设计软件</span>
      </div>
      <div style="padding:0 12px 9px;font-size:18px;color:#5f6368">+</div>
    </div>
    <div style="height:42px;background:#ffffff;display:flex;align-items:center;gap:8px;padding:0 12px;flex:0 0 auto;border-bottom:1px solid #dadce0">
      <span style="font-size:16px;color:#5f6368">&#8592;</span>
      <span style="font-size:16px;color:#5f6368">&#8594;</span>
      <span style="font-size:15px;color:#5f6368">&#8635;</span>
      <div id="__addr" style="flex:1;height:28px;background:#f1f3f4;border-radius:14px;display:flex;align-items:center;padding:0 14px;font-size:12.5px;color:#202124;gap:6px">
        <span style="color:#5f6368;font-size:12px">&#128274;</span>
        <span id="__url" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></span>
      </div>
      <span style="font-size:15px;color:#5f6368">&#9734;</span>
      <span style="font-size:15px;color:#5f6368">&#8942;</span>
    </div>
    <div id="__view" style="flex:1 1 auto;overflow:hidden;background:#fff;position:relative"></div>`
  b.appendChild(shell)
  const view = shell.querySelector('#__view')
  view.innerHTML = app
  window.__view = view
})
await page.evaluate(() => {
  document.getElementById('__url').textContent =
    'file:///D:/交付/复合材料气瓶缠绕铺层设计软件-网页版.html'
})
// 让注入后的 React 树重新贴合视口
await page.waitForTimeout(1200)
await shot('web-global', { fullPage: false })
meta.boxes['web-global'] = await boxes({
  topbar: '.topbar',
  brand: '.brand',
  tgroup: '.tgroup',
  leftPane: '.layout > *:first-child',
  resultPane: '.layout > *:last-child',
  statusbar: '.statusbar',
})

await writeFile(path.join(out, 'manifest.json'), JSON.stringify(meta, null, 2), 'utf8')
await browser.close()
console.log('done ->', out)
