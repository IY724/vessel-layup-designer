// 本次发布增量检查：共用页面身份、修正后的计算结果和实际导出。
import { _electron } from 'playwright-core'
import { extractFile } from '@electron/asar'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'

const root=fileURLToPath(new URL('../',import.meta.url))
const {version:packageVersion}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'))
const version=packageVersion.split('.').slice(0,2).join('.')  // 对外标识：1.0.0 → 1.0
const out=path.resolve(root,'output/formula-sync')
await mkdir(out,{recursive:true})
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const asar=path.join(root,'release/win-unpacked/resources/app.asar')
const sharedHtml=hash(await readFile(path.join(root,'dist/index.html')))
assert.equal(hash(extractFile(asar,'dist/index.html')),sharedHtml)
assert.equal(hash(await readFile(path.join(root,'../交付/气瓶铺层设计软件-网页版.html'))),sharedHtml)
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const desktop=await _electron.launch({executablePath:path.join(root,'release/win-unpacked/VesselLayupDesigner.exe'),args:[`--user-data-dir=${path.join(out,'profile')}`],env,timeout:60000})
const errors=[]
try{
  const page=await desktop.firstWindow()
  page.on('pageerror',e=>errors.push(e.message))
  await page.getByRole('button',{name:'导出 Excel 计算书',exact:true}).waitFor()
  const body=await page.locator('body').innerText()
  assert.ok(body.includes(`V${version}`))
  // 默认算例（78 L）页面上应现算出容积 77.37 L 与封头经验初估 152.74 MPa
  assert.match(body,/77\.37/)
  assert.match(body,/152\.74/)
  assert.doesNotMatch(body,/原版对比|原表|平方项修正|一组一行/)
  const file=path.join(out,'桌面软件导出.xlsx')
  await desktop.evaluate(({session},savePath)=>{
    globalThis.formulaDownload='pending'
    session.defaultSession.once('will-download',(_event,item)=>{
      item.setSavePath(savePath)
      item.once('done',(_done,state)=>{globalThis.formulaDownload=state})
    })
  },file)
  await page.getByRole('button',{name:'导出 Excel 计算书',exact:true}).click()
  const deadline=Date.now()+45000
  while(await desktop.evaluate(()=>globalThis.formulaDownload)==='pending'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,250))
  assert.equal(await desktop.evaluate(()=>globalThis.formulaDownload),'completed')
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(await readFile(file))
  const caseSheet=wb.getWorksheet('工况与气瓶参数')
  assert.equal(wb.worksheets.length,15)
  assert.equal(wb.getWorksheet('说明'),undefined)
  assert.equal(wb.getWorksheet('原版对比'),undefined)
  assert.equal(wb.getWorksheet('公式说明').getImages().length,17)
  // 默认算例（78 L / 70 MPa）的四项快照，按行名定位以免表格行增减后错钉
  const pinned=[['封头经验初估',152.736422545247],['局部参考最低值',0.10203542677088978]]
  for(const [label,value] of pinned){
    const row=caseSheet.getRows(8,8)?.find(r=>String(r.getCell(1).value)===label)
    assert.ok(row,`工况表缺少「${label}」行`)
    assert.ok(Math.abs(row.getCell(2).result-value)<1e-8,`${label} 由 ${value} 变为 ${row.getCell(2).result}`)
  }
  const headPress=wb.getWorksheet('封头总爆破压强')
  assert.ok(Math.abs(headPress.getCell(`C${headPress.rowCount}`).result-159.534390400966)<1e-8)
  // 封头分片表名随角度变化，取第一张按 cos 平方写法抽检
  assert.match(wb.worksheets.find((ws)=>/^封头-[\d.]+°$/.test(ws.name)).getCell('H41').formula,/COS\(G41\/180\*PI\(\)\)\^2/)
  for(const s of wb.worksheets)s.eachRow(row=>row.eachCell(cell=>{
    if(typeof cell.value==='string')assert.doesNotMatch(cell.value,/原表|原版|修正|核对通过|一组一行/)
    if(cell.type===ExcelJS.ValueType.Error)assert.fail(`${s.name}!${cell.address}`)
  }))
  assert.deepEqual(errors,[])
  await page.screenshot({path:path.join(out,'软件计算结果.png')})
  const report={version,packageVersion,sharedHtmlSha256:sharedHtml,websiteAndDesktopIdentical:true,caseHeadInitialEstimate:152.736422545247,localCurveMin:.10203542677088978,equatorHeadPressure:159.534390400966,sheets:15,formulaImages:17,rendererErrors:errors,exportFile:file,checkedAt:new Date().toISOString()}
  await writeFile(path.join(out,'发布检查.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify(report,null,2))
}finally{await desktop.close()}
