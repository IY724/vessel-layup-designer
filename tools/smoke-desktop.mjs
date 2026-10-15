import { _electron } from 'playwright-core'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'

const root = fileURLToPath(new URL('../', import.meta.url))
const out = path.resolve(root, '../_work/desktop_qa')
await mkdir(out, { recursive: true })
const executablePath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'release/win-unpacked/VesselLayupDesigner.exe')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const launch = () => _electron.launch({ executablePath, args: [`--user-data-dir=${path.join(out, 'profile')}`], env, timeout: 60000 })
let desktop = await launch()
const failures = []
try {
  const page = await desktop.firstWindow()
  page.on('pageerror', (error) => failures.push(error.message))
  await page.getByRole('button', { name: '导出 Excel 计算书', exact: true }).waitFor()
  await page.getByRole('button', { name: '恢复默认', exact: true }).click()
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  const exported = path.join(out, '桌面软件导出示例.xlsx')
  await desktop.evaluate(({ session }, savePath) => {
    globalThis.smokeDownload = 'pending'
    session.defaultSession.once('will-download', (_event, item) => {
      item.setSavePath(savePath)
      item.once('done', (_done, state) => { globalThis.smokeDownload = state })
    })
  }, exported)
  await page.getByRole('button', { name: '导出 Excel 计算书', exact: true }).click()
  const deadline = Date.now() + 45000
  while (await desktop.evaluate(() => globalThis.smokeDownload) === 'pending' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  assert.equal(await desktop.evaluate(() => globalThis.smokeDownload), 'completed')
  assert.ok((await stat(exported)).size > 10000)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await readFile(exported))
  assert.equal(workbook.worksheets.length, 14)
  assert.ok(workbook.worksheets.every((sheet) => sheet.state === 'visible'))
  assert.equal(workbook.getWorksheet('公式说明').getImages().length, 17)
  assert.ok(Math.abs(workbook.getWorksheet('筒身强度设计与计算').getCell('G29').result - 102.09988121282991) < 1e-8)
  await page.screenshot({ path: path.join(out, 'desktop.png') })
  await page.getByRole('button', { name: '校核明细', exact: true }).click()
  await page.locator('.modal').waitFor()
  await page.screenshot({ path: path.join(out, 'desktop-detail.png') })
  await page.evaluate(() => {
    const key = 'vessel-layup-designer.input.v1'
    const input = JSON.parse(localStorage.getItem(key))
    input.geometry.R = 180
    localStorage.setItem(key, JSON.stringify(input))
  })
  await desktop.close()
  desktop = await launch()
  const reopened = await desktop.firstWindow()
  await reopened.getByRole('button', { name: '导出 Excel 计算书', exact: true }).waitFor()
  const radius = await reopened.evaluate(() => JSON.parse(localStorage.getItem('vessel-layup-designer.input.v1')).geometry.R)
  assert.equal(radius, 180)
  assert.ok((await reopened.locator('input[type="number"]').evaluateAll((items) => items.map((item) => Number(item.value)))).includes(180))
  assert.deepEqual(failures, [])
  const report = { executablePath, exportFile: exported, sheets: workbook.worksheets.length, formulas: 17, radiusAfterRestart: radius, rendererErrors: failures, checkedAt: new Date().toISOString() }
  await writeFile(path.join(out, 'verification.json'), JSON.stringify(report, null, 2))
  console.log('桌面软件验证通过：启动、沙箱、Excel 下载、公式图片、明细弹窗、重启后参数保留。')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await desktop.close()
}
