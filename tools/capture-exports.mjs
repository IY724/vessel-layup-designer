// -*- mode: js -*-
/**
 * capture-exports.mjs — 拍导出计算书相关界面（PDF 预览窗口、导出结果）
 * Excel 下载件用 offscreen 的方式存到磁盘，便于后续核对。
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
const ctx = await browser.newContext({ viewport: { width: 1620, height: 1020 }, deviceScaleFactor: 2, locale: 'zh-CN', acceptDownloads: true })
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
    return
  }
  const file = path.join(out, name + '.png')
  await loc.screenshot({ path: file })
  const b = await loc.boundingBox().catch(() => null)
  manifest.shots[name] = { file, size: b ? { w: Math.round(b.width), h: Math.round(b.height) } : null }
  console.log('  shot', name, b ? `${Math.round(b.width)}x${Math.round(b.height)}` : '')
}

// ── Excel 导出：拦下载 ──
const dlPromise = page.waitForEvent('download', { timeout: 60000 }).catch(() => null)
await page.getByRole('button', { name: '导出 Excel 计算书', exact: true }).click()
const dl = await dlPromise
if (dl) {
  const save = path.join(out, 'export.xlsx')
  await dl.saveAs(save)
  console.log('  excel saved', save)
  manifest.excel = save
} else {
  console.warn('  excel download not captured')
}
await page.waitForTimeout(2500)

// ── PDF 导出：会打开预览窗 ──
await page.getByRole('button', { name: '导出 PDF 计算书' }).click()
await page.waitForTimeout(6000)
await shot('modal-pdf', '.modal > .box')
manifest.pdfModal = await page.locator('.modal > .box').count()

// 预览里的画布页面，截一张正文页
const pdfPage = page.locator('.modal canvas').first()
if (await pdfPage.count()) {
  await page.waitForTimeout(2500)
  await shot('modal-pdf-page', '.modal > .box')
}

await writeFile(path.join(out, 'manifest-exports.json'), JSON.stringify(manifest, null, 2), 'utf8')
await browser.close()
console.log('\nerrors:', errors.length, errors.slice(0, 3))
