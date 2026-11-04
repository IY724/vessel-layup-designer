// -*- mode: js -*-
/**
 * capture-extra.mjs — 补拍：浏览器全局图（最终构建）+ 爆压放大视图 + 导出件
 */
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const out = path.join(root, 'output/softcopyright-shots/final')
await mkdir(out, { recursive: true })
const url = 'file:///' + path.join(root, 'dist/index.html').replace(/\\/g, '/')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, locale: 'zh-CN' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(1500)

const manifest = { shots: {}, errors }
const rec = async (name, file) => {
  manifest.shots[name] = { file }
  console.log('  shot', name)
}

// ── 1. 爆压分布放大视图（第二个「放大」按钮） ──
const domeCard = page.locator('.layout > *:nth-child(2) .card').nth(2)
const zoom = domeCard.locator('button', { hasText: '放大' })
console.log('  zoom buttons:', await zoom.count())
await zoom.nth(1).click()
await page.waitForTimeout(1200)
let f = path.join(out, 'modal-pressure-zoom.png')
await page.locator('.modal > .box').screenshot({ path: f })
await rec('modal-pressure-zoom', f)
// 关闭
const cl = page.locator('.modal button', { hasText: '关闭' }).first()
if (await cl.count()) await cl.click()
await page.waitForTimeout(600)

// ── 2. 浏览器全局图：注入 Chrome 外壳，让读者看出是在浏览器里打开 ──
const rootHtml = await page.evaluate(() => document.getElementById('root').innerHTML)
await page.evaluate((inner) => {
  const b = document.body
  b.innerHTML = ''
  b.style.cssText = 'margin:0;background:#dee1e6'
  const shell = document.createElement('div')
  shell.style.cssText =
    'position:fixed;inset:0;display:flex;flex-direction:column;font-family:"Segoe UI","Microsoft YaHei",sans-serif'
  shell.innerHTML =
    '<div style="height:38px;background:#dee1e6;display:flex;align-items:flex-end;padding:0 8px;flex:0 0 auto">' +
    '<div style="display:flex;align-items:center;gap:7px;background:#fff;border-radius:8px 8px 0 0;padding:7px 16px 8px;font-size:12.5px;color:#3c4043;max-width:340px">' +
    '<span style="width:14px;height:14px;background:#0b7d3e;border-radius:2px"></span>' +
    '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">复合材料气瓶缠绕铺层设计软件-网页版</span></div>' +
    '<div style="padding:0 14px 9px;font-size:19px;color:#5f6368">+</div></div>' +
    '<div style="height:44px;background:#fff;display:flex;align-items:center;gap:10px;padding:0 14px;flex:0 0 auto;border-bottom:1px solid #dadce0">' +
    '<span style="font-size:17px;color:#5f6368">&#8592;</span><span style="font-size:17px;color:#5f6368">&#8594;</span>' +
    '<span style="font-size:16px;color:#5f6368">&#8635;</span>' +
    '<div style="flex:1;height:30px;background:#f1f3f4;border-radius:15px;display:flex;align-items:center;padding:0 15px;font-size:13px;color:#202124;gap:7px">' +
    '<span style="color:#5f6368;font-size:12px">&#128274;</span>' +
    '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">file:///D:/交付/复合材料气瓶缠绕铺层设计软件-网页版.html</span></div>' +
    '<span style="font-size:16px;color:#5f6368">&#9734;</span><span style="font-size:16px;color:#5f6368">&#8942;</span></div>' +
    '<div id="__view" style="flex:1 1 auto;overflow:hidden;background:#fff"></div>'
  b.appendChild(shell)
  const v = document.getElementById('__view')
  v.innerHTML = inner
  document.querySelectorAll('#__view .app').forEach((el) => {
    el.style.height = '100%'
  })
}, rootHtml)
await page.waitForTimeout(1200)
f = path.join(out, 'web-global.png')
await page.screenshot({ path: f })
await rec('web-global', f)

await writeFile(path.join(out, 'manifest-extra.json'), JSON.stringify(manifest, null, 2), 'utf8')
await browser.close()
console.log('errors:', errors.length)
