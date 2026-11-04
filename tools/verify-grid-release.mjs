// 仅检查此次显示样式和页面同步，不重跑计算。
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { extractFile } from '@electron/asar'
import ExcelJS from 'exceljs'

const root=fileURLToPath(new URL('../',import.meta.url))
const out=path.resolve(root,'output/grid-sync')
const {version:packageVersion}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'))
const version=packageVersion.split('.').slice(0,2).join('.')  // 对外标识：1.0.0 → 1.0
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const hash=sha(await fs.readFile(path.join(root,'dist/index.html')))
assert.equal(sha(extractFile(path.join(root,'release/win-unpacked/resources/app.asar'),'dist/index.html')),hash)
assert.equal(sha(await fs.readFile(path.join(root,'../交付/气瓶铺层设计软件-网页版.html'))),hash)
const siteName=(await fs.readdir(root)).find(name=>name.endsWith('.qoder.site'))
assert.equal(JSON.parse(await fs.readFile(path.join(root,siteName),'utf8')).indexSha256,hash)
const files=[]
for(const name of ['案例-0参考铺层.xlsx','案例-A自动生成.xlsx','案例-B定稿.xlsx']){
  const wb=new ExcelJS.Workbook()
  await wb.xlsx.load(await fs.readFile(path.join(root,'../交付',name)))
  for(const ws of wb.worksheets){
    assert.ok(ws.views.length>0&&ws.views.every(v=>v.showGridLines===true),`${name} / ${ws.name} 网格线`)
    ws.eachRow(row=>row.eachCell({includeEmpty:true},cell=>{
      if(cell.fill?.type==='pattern'&&cell.fill.pattern==='solid')assert.notEqual(cell.fill.fgColor?.argb?.slice(-6),'FFFFFF',`${ws.name}!${cell.address} 白色填充`)
    }))
    const blank=ws.getCell('Z2000')
    assert.ok(!blank.fill||blank.fill.pattern==='none',`${ws.name} 空白区域填充`)
  }
  const sample=wb.getWorksheet('封头-10°').getCell('A41')
  assert.equal(sample.fill.pattern,'none')
  for(const edge of ['top','bottom','left','right'])assert.equal(sample.border[edge].style,'thin')
  files.push({name,sheetsWithGridLines:wb.worksheets.length,whiteCellFills:0})
}
const report={version,sharedHtmlSha256:hash,websiteAndDesktopIdentical:true,files,checkedAt:new Date().toISOString()}
await fs.writeFile(path.join(out,'网格线同步检查.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
