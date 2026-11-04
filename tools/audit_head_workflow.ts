import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import * as XLSX from 'xlsx'
import { courseInput } from '../src/core/presets'
import { runCheck } from '../src/core/checker'
import { buildWorkbook } from '../src/export/excel'

const path = resolve('../00_原始参考资料/附件/封头厚度计算公式最终 - 演示版.xls')
const bytes = readFileSync(path), source = XLSX.read(bytes,{type:'buffer',cellFormula:true})
const input = courseInput(), result = runCheck(input), actual = buildWorkbook(input,result)
const report = result.dome.groups.map(g => {
  const ref = source.Sheets[String(g.angle)], sheet = actual.Sheets[`封头-${g.angle}°`]
  const rows = Array.from({length:144},(_,i) => {
    const row=i+23,r=Number(ref[`E${row}`].v)
    const sourcePressure=Number(ref[`L${row}`]?.v ?? 0)
    const corrected = r<g.r0 ? 0 : 2*Number(ref[`J${row}`].v)*Number(ref.C15.v)/Number(ref.C3.v)*Math.cos(Number(ref[`K${row}`].v)*Math.PI/180)**2
    return {r,branch:r<=g.splineEndRadius?'spline':'coverage',sourceThickness:Number(ref[`J${row}`].v),actualThickness:Number(sheet[`J${row}`].v),sourcePressure,correctedPressure:corrected,actualPressure:Number(sheet[`L${row}`].v)}
  })
  return {angle:g.angle,r0:g.r0,rb:g.rb,r2b:g.r2b,selectedBoundary:g.splineEndRadius,cycles:g.cycles,
    maxThicknessDifference:Math.max(...rows.map(p=>Math.abs(p.actualThickness-p.sourceThickness))),
    maxCorrectedPressureDifference:Math.max(...rows.map(p=>Math.abs(p.actualPressure-p.correctedPressure))),rows}
})
const totals = result.dome.profile.map((p,i) => ({r:p.r,sourceThickness:Number(source.Sheets['总厚度'][`B${i+2}`].v),actualThickness:p.tTotal,actualPressure:p.pTotal,
  correctedPressure:input.requirement.ks*report.reduce((s,g)=>s+g.rows[i].correctedPressure,0)}))
const output = {source:path,sha256:createHash('sha256').update(bytes).digest('hex'),formulaPolicy:'原表流程；保留已确认的cos²修正',originalPressureFormula:source.Sheets['10'].L23.f,
  exportedPressureFormula:actual.Sheets['封头-10°'].L23.f,radiusRange:[totals[0].r,totals.at(-1)!.r],groups:report,totals,
  maxTotalThicknessDifference:Math.max(...totals.map(p=>Math.abs(p.actualThickness-p.sourceThickness))),
  maxTotalPressureDifference:Math.max(...totals.map(p=>Math.abs(p.actualPressure-p.correctedPressure)))}
const outputPath=resolve('output/封头逐角流程核对.json')
writeFileSync(outputPath,JSON.stringify(output,null,2))
console.log(JSON.stringify({...output,groups:report.map(({rows,...g})=>g),totals:undefined,outputPath},null,2))
if(output.maxTotalThicknessDifference>1e-7 || output.maxTotalPressureDifference>1e-7)process.exitCode=1
