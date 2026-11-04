/** 实际点击导出/保存，检查预览画布、离线请求及长铺层分页。 */
import { chromium, _electron } from 'playwright-core'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../', import.meta.url))
const out = path.resolve(root, process.env.PDF_QA_OUT || 'output/qa/pdf')
await mkdir(out, { recursive: true })
const desktopPath = process.argv[2] === '--web' ? null : process.argv[2]
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const webUrl = process.argv[3] || pathToFileURL(path.join(root, 'dist/index.html')).href
const app = desktopPath ? await _electron.launch({ executablePath: path.resolve(desktopPath), args: [`--user-data-dir=${path.join(out, 'desktop-profile')}`], env, timeout: 60000 }) : null
const browser = app ? null : await chromium.launch({ ...(process.env.PDF_QA_BROWSER ? { executablePath: process.env.PDF_QA_BROWSER } : { channel: 'chrome' }), headless: true })
const page = app ? await app.firstWindow() : await browser.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true })
const errors = [], requests = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', req => { if (/^https?:/.test(req.url()) && req.url() !== webUrl) requests.push(req.url()) })
const mode = app ? 'desktop' : webUrl.startsWith('file:') ? 'web' : 'web-http'
try {
  if (!app) await page.goto(webUrl)
  const expectedDefault = [[15,8],[90,8],[20,8],[90,8],[25,4],[90,4],[35,4],[90,4],[40,4],[90,12]]
  const readPlan = () => page.evaluate(() => JSON.parse(localStorage.getItem('vessel-layup-designer.input.v1')).plan.groups.map(g => [g.angle,g.layers]))
  await page.getByRole('button', { name: '恢复默认', exact: true }).click()
  assert.deepEqual(await readPlan(), expectedDefault)
  // 旧默认存档：总量相同但曾按五螺旋+一环向保存，刷新应按表3.1修复。
  await page.evaluate(() => {
    const key='vessel-layup-designer.input.v1', input=JSON.parse(localStorage.getItem(key))
    input.geometry.R=135;input.geometry.headShortAxis=67.5;input.constraint.expansionGeometry=JSON.stringify([135,36,20]);input.plan={spiral:input.plan.spiral,hoop:36}
    localStorage.setItem(key,JSON.stringify(input))
  })
  await page.reload()
  await page.getByRole('button', { name: '恢复默认', exact: true }).waitFor()
  assert.deepEqual(await readPlan(), expectedDefault)
  assert.deepEqual(await page.evaluate(()=>{const g=JSON.parse(localStorage.getItem('vessel-layup-designer.input.v1')).geometry;return[g.R,g.headShortAxis,g.linerThickness]}),[140,70,5])
  for (let i=0;i<expectedDefault.length;i++) {
    assert.equal(Number(await page.getByRole('spinbutton',{name:`第${i+1}组缠绕角`,exact:true}).inputValue()),expectedDefault[i][0])
    assert.equal(Number(await page.getByRole('spinbutton',{name:`第${i+1}组层数`,exact:true}).inputValue()),expectedDefault[i][1])
  }
  assert.equal(await page.locator('output[aria-label="螺旋初估层数"]').innerText(),'20')
  assert.equal(await page.locator('output[aria-label="环向初估层数"]').innerText(),'35')
  await page.getByRole('button',{name:'自动生成铺层',exact:true}).click()
  await page.getByRole('button',{name:'生成并填入',exact:true}).click()
  const generated=await readPlan()
  assert.equal(generated.length,10)
  generated.forEach((g,i)=>assert.equal(g[0],i%2?90:expectedDefault[i][0]))
  assert.equal(generated.filter((_,i)=>i%2===0).reduce((s,g)=>s+g[1],0),20)
  assert.equal(generated.filter((_,i)=>i%2===1).reduce((s,g)=>s+g[1],0),35)
  await page.getByRole('button',{name:'恢复默认',exact:true}).click()
  assert.deepEqual(await readPlan(),expectedDefault)
  if (app) {
    assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu()), null)
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMenuBarVisible()), false)
  }
  const save = async (name) => {
    const file = path.join(out, `${mode}-${name}.pdf`)
    if (app) {
      await app.evaluate(({ session }, target) => {
        globalThis.pdfSaveState = 'pending'
        session.defaultSession.once('will-download', (_event, item) => {
          globalThis.pdfDialogOptions = item.getSaveDialogOptions()
          item.setSavePath(target)
          item.once('done', (_done, state) => { globalThis.pdfSaveState = state })
        })
      }, file)
      await page.getByRole('button', { name: '保存 PDF', exact: true }).click()
      for (let i = 0; i < 200 && await app.evaluate(() => globalThis.pdfSaveState) === 'pending'; i++) await new Promise(r => setTimeout(r, 100))
      assert.equal(await app.evaluate(() => globalThis.pdfSaveState), 'completed')
      const options = await app.evaluate(() => globalThis.pdfDialogOptions)
      assert.equal(options.filters[0].extensions[0], 'pdf')
    } else {
      const download = page.waitForEvent('download')
      await page.getByRole('button', { name: '保存 PDF', exact: true }).click()
      const item = await download
      assert.match(item.suggestedFilename(), /\.pdf$/)
      await item.saveAs(file)
    }
    const bytes = await readFile(file)
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-')
    assert.ok(bytes.length > 50000)
    return { file, size: bytes.length }
  }
  const open = async () => {
    await page.getByRole('button', { name: '导出 PDF 计算书', exact: true }).click()
    await page.getByRole('button', { name: '保存 PDF', exact: true }).waitFor({ timeout: 60000 })
    await page.waitForFunction(() => document.querySelector('.pdf-preview .pdf-view')?.getAttribute('aria-busy') === 'false', undefined, { timeout: 60000 })
    assert.equal(await page.getByRole('alert').count(), 0)
    assert.ok(await page.locator('.pdf-view canvas').evaluate(el => {
      const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data
      let dark = 0
      for (let i = 0; i < data.length; i += 16) if (data[i] < 150 && data[i + 1] < 150 && data[i + 3] > 0) dark++
      return dark > 1000
    }), 'PDF 预览应为实际有内容的页面')
  }
  await open()
  await page.screenshot({ path: path.join(out, `${mode}-preview.png`) })
  const base = await save('default')
  const pageCount = Number(await page.getByLabel('PDF 页码').getAttribute('max'))
  assert.ok(pageCount >= 5)
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.pdf-view')?.getAttribute('aria-busy') === 'false')
  assert.equal(await page.getByLabel('PDF 页码').inputValue(), '2')
  await page.getByLabel('PDF 缩放').selectOption('125')
  await page.waitForFunction(() => document.querySelector('.pdf-view')?.getAttribute('aria-busy') === 'false')
  await page.getByLabel('PDF 页码').fill(String(pageCount))
  await page.waitForFunction(() => document.querySelector('.pdf-view')?.getAttribute('aria-busy') === 'false')
  await page.screenshot({ path: path.join(out, `${mode}-last-page.png`) })
  await page.getByRole('button', { name: '关闭', exact: true }).click()

  // 修改几何系数后保存工程、刷新，再输出；检查导出没有退回硬编码默认值。
  const kfInput = page.locator('.field').filter({ hasText: '阀座容积折减' }).locator('input')
  await kfInput.fill('0.65')
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('vessel-layup-designer.input.v1')).geometry.headVolumeFactor === 0.65)
  await page.reload()
  assert.equal(await kfInput.inputValue(), '0.65')
  await open()
  const customKf = await save('custom-kf')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '恢复默认', exact: true }).click()

  // 完整长表：88行、停用行、重复角度；不得只输出可见滚动区域。
  await page.evaluate(() => {
    const key = 'vessel-layup-designer.input.v1'
    const input = JSON.parse(localStorage.getItem(key))
    input.plan = { groups: Array.from({ length: 88 }, (_, i) => ({ type: i % 2 ? 'hoop' : 'spiral', angle: i % 2 ? 90 : 15 + i % 26, layers: 2, active: i !== 4 })), spiral: [], hoop: 0 }
    localStorage.setItem(key, JSON.stringify(input))
  })
  await page.reload()
  await open()
  const long = await save('long-table')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  // 键盘打印入口也进入同一计算书预览；反复开关检查 worker / canvas 生命周期。
  await page.keyboard.press('Control+p')
  await page.waitForFunction(() => document.querySelector('.pdf-view')?.getAttribute('aria-busy') === 'false', { timeout: 60000 })
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '恢复默认', exact: true }).click()
  assert.deepEqual(errors, [])
  assert.deepEqual(requests, [], '离线计算书不得请求远程依赖')
  const result = { mode, executablePath: desktopPath || null, defaultLayupOrder: expectedDefault, legacyDefaultMigrated: true, pageCount, default: base, customKf, longTable: long, rendererErrors: errors, externalRequests: requests, verifiedAt: new Date().toISOString() }
  await writeFile(path.join(out, `${mode}-verification.json`), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} catch (e) {
  await page.screenshot({ path: path.join(out, `${mode}-failed.png`) }).catch(() => {})
  console.error('Renderer errors:', errors)
  console.error(await page.locator('body').innerText().then(text => text.slice(-2500)))
  throw e
} finally { if (app) await app.close(); else await browser.close() }
