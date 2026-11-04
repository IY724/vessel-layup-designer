// -*- mode: js -*-
/**
 * capture-exports2.mjs — 存下 PDF 计算书（供后续渲染首屏页），并确认 Excel 导出
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const out = path.join(root, 'output/softcopyright-shots/doc')
await mkdir(out, { recursive: true })
const url = 'file:///' + path.join(root, 'dist/index.html').replace(/\\/g, '/')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1620, height: 1020 }, deviceScaleFactor: 2, acceptDownloads: true })
const page = await ctx.newPage()
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(1500)

// Excel 计算书
const dl1 = page.waitForEvent('download', { timeout: 90000 }).catch(() => null)
await page.getByRole('button', { name: '导出 Excel 计算书', exact: true }).click()
const x = await dl1
if (x) {
  await x.saveAs(path.join(out, 'calc.xlsx'))
  console.log('xlsx ->', path.join(out, 'calc.xlsx'))
}
await page.waitForTimeout(3000)

// PDF 计算书：先开预览，再点"保存 PDF"
await page.getByRole('button', { name: '导出 PDF 计算书' }).click()
await page.waitForTimeout(6500)
const btn = page.locator('.modal button', { hasText: '保存' }).first()
console.log('save btn count:', await btn.count())
const dl2 = page.waitForEvent('download', { timeout: 90000 }).catch(() => null)
await btn.click()
const pdf = await dl2
if (pdf) {
  await pdf.saveAs(path.join(out, 'calc.pdf'))
  console.log('pdf  ->', path.join(out, 'calc.pdf'))
} else {
  console.warn('no pdf download')
}
await browser.close()
