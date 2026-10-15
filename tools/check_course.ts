import fs from 'node:fs'
import { defaultInput } from '../src/core/presets'
import { runCheck } from '../src/core/checker'
import { buildWorkbook, workbookBytes } from '../src/export/excel'
import { domeAt } from '../src/core/dome'
const refs = JSON.parse(fs.readFileSync('../_核对记录_20261015/原表单元格.json','utf8'))
const input = defaultInput(), result = runCheck(input), wb = buildWorkbook(input, result)
const rows: unknown[] = []
for(const source of refs) for(const sheet of source.sheets) {
  if(!sheet.cells['!ref']) continue
  const target = source.file.includes('强度设计') ? '筒身强度设计与计算' : sheet.name.startsWith('总') ? `封头${sheet.name}` : `封头-${sheet.name}°`
  let max = 0, count = 0, bad: unknown[] = []
  for(const [address, cell] of Object.entries(sheet.cells) as Array<[string, any]>) {
    if(cell.t !== 'n') continue
    const generated = wb.Sheets[target]?.[address]
    if(!generated || typeof generated.v !== 'number') continue
    const diff = Math.abs(generated.v - cell.v)
    max = Math.max(max, diff);count++
    if(diff > 1e-6 * Math.max(1,Math.abs(cell.v))) bad.push([address,cell.v,generated.v,diff])
  }
  rows.push({target,count,max,bad:bad.slice(0,8)})
}
console.log(JSON.stringify(rows,null,2))
console.log(result.cylinder.pa,result.cylinder.pth,result.dome.minP,result.dome.minPR, domeAt(result.dome.groups,173.5,173.5,2031,.75))
if(process.argv.includes('--export')) fs.writeFileSync('../交付/案例-0参考铺层.xlsx', await workbookBytes(input,result))
