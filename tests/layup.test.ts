import { describe, expect, it } from 'vitest'
import { expansionAngles, defaultAngles, prepareExpansion } from '../src/core/expansion'
import { activeGroups, interleavePlan, layupGroups, planFromRows, transferHoop } from '../src/core/layup'
import { excelBaselineInput } from '../src/core/presets'
import { runCheck } from '../src/core/checker'
import { autoDesign } from '../src/core/designer'
import { workbookBytes } from '../src/export/excel'
import * as XLSX from 'xlsx'

describe('按课件直径步进扩孔', () => {
  it('复现筒身直径336、初孔直径56、带宽17.2的表格并跳选8个', () => {
    const rows = expansionAngles(168, 28, 17.2)
    expect(rows).toHaveLength(18)
    expect(rows[1].diameter).toBeCloseTo(73.2, 10)
    expect(rows[1].angle).toBeCloseTo(12.583, 2)
    expect(rows[rows.length-1]).toEqual({ diameter: 336, angle: 90, boundary: true })
    const selected = defaultAngles(rows.map(r => r.angle))
    expect(selected).toHaveLength(8)
    expect(selected.map(a => 336 * Math.sin(a * Math.PI / 180))).toEqual(expect.arrayContaining([expect.closeTo(56, 8), expect.closeTo(296.8, 8)]))
    expect(Math.max(...selected)).toBeGreaterThan(45)
    expect(selected).not.toContain(90)
  })
  it('极孔和带宽变更后重算，强度变更保留用户勾选', () => {
    const initial = prepareExpansion(excelBaselineInput())
    const picked = { ...initial, constraint: { ...initial.constraint, candidates: [12, 55, 70] } }
    expect(prepareExpansion({ ...picked, strength: { ...picked.strength, kLoss: .8 } }).constraint.candidates).toEqual([12, 55, 70])
    const changed = prepareExpansion({ ...picked, geometry: { ...picked.geometry, R: 180 } })
    expect(changed.constraint.candidates).toHaveLength(8)
    expect(changed.constraint.candidates).not.toEqual([12, 55, 70])
    for (const values of [[0, 1, 2], [10, 10, 1], [10, 2, 0], [NaN, 2, 1]]) expect(expansionAngles(...values as [number,number,number])).toEqual([])
  })
})

describe('统一螺旋/环向铺层顺序及类型计算', () => {
  const input = excelBaselineInput()
  const rows = [
    { type: 'spiral' as const, angle: 10, layers: 4 },
    { type: 'hoop' as const, angle: 85, layers: 3 },
    { type: 'spiral' as const, angle: 40, layers: 2 },
    { type: 'hoop' as const, angle: 90, layers: 7 },
    { type: 'hoop' as const, angle: 82, layers: 11, active: false },
  ]
  it('保留两种类型交替的实际行序，85°环向按环向强度计算但不进入封头', () => {
    const data = { ...input, strength: { ...input.strength, sigmaHoopDirect: 4000 }, plan: planFromRows(rows) }
    const result = runCheck(data)
    expect(result.cylinder.rows.map(g => [g.type, g.angle])).toEqual([['spiral',10],['hoop',85],['spiral',40],['hoop',90]])
    expect(result.cylinder.hoopLayers).toBe(10)
    expect(result.dome.groups.map(g => g.angle)).toEqual([10,40])
    const h = result.cylinder.rows[1],d = result.derived
    expect(h.paSum).toBeCloseTo(2 * d.tf * 4000 / input.geometry.R * Math.cos(85 * 3.1415926 / 180) ** 2 * 3, 12)
    expect(h.pthSum).toBeCloseTo(d.tf * 4000 / input.geometry.R * Math.sin(85 * 3.1415926 / 180) ** 2 * 3, 12)
    expect(result.head.pressure).toBeCloseTo(input.requirement.ks * result.cylinder.rows.filter(g => g.type === 'spiral').reduce((s,g) => s + g.paSum, 0), 12)
    const reordered = runCheck({ ...data, plan: planFromRows([...rows].reverse()) })
    expect(reordered.cylinder.rows[0].type).toBe('hoop')
    expect(reordered.cylinder.pa).toBeCloseTo(result.cylinder.pa, 12)
    expect(reordered.cylinder.pth).toBeCloseTo(result.cylinder.pth, 12)
  })
  it('旧方案读入保持次序；停用环向与置换后仍保留完整行序', () => {
    expect(layupGroups(input.plan).map(g=>g.type)).toEqual(['spiral','spiral','spiral','spiral','spiral','spiral','hoop'])
    const result = transferHoop(planFromRows(rows), 4, 40)
    expect(layupGroups(result).map(g => [g.type, g.angle])).toEqual(rows.map(g => [g.type, g.angle]))
    expect(layupGroups(result)[3].layers).toBe(3)
    expect(layupGroups(result)[4]).toMatchObject({ layers: 11, active: false })
    expect(activeGroups(result).reduce((s,g)=>s+g.layers,0)).toBe(16)
  })
  it('默认扩孔8个角度全部进入自动方案；环向总量拆为交替组，样条自动分段', () => {
    const data = prepareExpansion(input)
    const out = autoDesign(data)
    if (!out.ok) throw new Error(out.reason)
    const ordered = layupGroups(out.plan)
    expect(ordered.filter(g=>g.type==='spiral').map(g=>g.angle)).toEqual(data.constraint.candidates.map(Math.round))
    expect(ordered.filter(g=>g.type==='spiral')).toHaveLength(8)
    ordered.forEach((g,i) => expect(g.type).toBe(i % 2 ? 'hoop' : 'spiral'))
    expect(ordered.filter(g=>g.type==='hoop').every(g=>g.angle===90)).toBe(true)
    const check = runCheck({ ...data, plan: out.plan })
    expect(out.verdict).toBe(check.verdict)
    expect(check.dome.groups.every(g=>g.splineEndRadius===g.r2b && g.manualSplineEndRadius==null)).toBe(true)
    expect(check.cylinder.hoopLayers).toBe(out.plan.hoop)
    expect(interleavePlan([{angle:20,layers:4},{angle:40,layers:2}],7).groups?.map(g=>g.layers)).toEqual([4,4,2,3])
  })
  it('手选小集合原样保留，不偷偷换成其他候选角', () => {
    const data = { ...prepareExpansion(input), constraint: { ...input.constraint, angleRule:'manual' as const,candidates:[12,30,60] } }
    const out = autoDesign(data)
    if(!out.ok) throw new Error(out.reason)
    expect(layupGroups(out.plan).filter(g=>g.type==='spiral').map(g=>g.angle)).toEqual([12,30,60])
  })
  it('混合环向角、重复螺旋、停用组导出保持顺序和汇总，公式不固定90°', async () => {
    const data = { ...input, plan: planFromRows(rows) },res = runCheck(data)
    const bytes = await workbookBytes(data,res),book=XLSX.read(bytes,{type:'array'})
    const layup=book.Sheets['铺层方案'],summary=book.Sheets['工况与气瓶参数']
    expect([5,6,7,8].map(r=>[layup[`B${r}`].v,layup[`C${r}`].v])).toEqual([['螺旋',10],['环向',85],['螺旋',40],['环向',90]])
    expect(layup.H6.v).toBeGreaterThan(0)
    expect(layup.C6.f).toContain('筒身强度设计与计算')
    expect(summary.B8.v).toBeCloseTo(res.cylinder.pa,10)
    expect(summary.B9.v).toBeCloseTo(res.cylinder.pth,10)
    expect(summary.B10.v).toBeCloseTo(res.head.pressure,10)
    expect(summary.B16.v).toBeCloseTo(res.cylinder.totalThickness,10)
    for(const sheet of Object.values(book.Sheets)) for(const cell of Object.values(sheet)) if(cell?.f) expect(cell.f).not.toContain('#REF!')
  })
})
