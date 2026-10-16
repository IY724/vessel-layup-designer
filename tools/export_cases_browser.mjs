// export_cases_browser.mjs — 在浏览器（真实 DOM）里生成三个案例计算书，
// 让交付的案例文件带上切线图与封头厚度轮廓图（Node 环境没有 DOM，跳过插图）。
// 前置：本地预览 5186 已在服务最新 dist/index.html；先跑过 npx vite-node tools/design_case.ts 生成 inputs.json。
import { chromium } from 'playwright-core'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const out = path.resolve(root, '../_work/design_case')
const inputs = JSON.parse(await readFile(path.join(out, 'inputs.json'), 'utf8'))
const mapping = { reference: '案例-0参考铺层.xlsx', auto: '案例-A自动生成.xlsx', final: '案例-B定稿.xlsx' }

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true })
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5186')
  for (const [key, name] of Object.entries(mapping)) {
    await page.evaluate((input) => localStorage.setItem('vessel-layup-designer.input.v1', JSON.stringify(input)), inputs[key])
    await page.reload()
    const button = page.getByRole('button', { name: '导出 Excel 计算书', exact: true })
    await button.waitFor()
    const download = page.waitForEvent('download')
    await button.click()
    await (await download).saveAs(path.join(out, name))
    console.log('已生成（含插图）:', name)
  }
} finally {
  await browser.close()
}
