import { describe, expect, it } from 'vitest'
import { autoDesign, pickAlternate, planPressures } from '../src/core/designer'
import { runCheck } from '../src/core/checker'
import { excelBaselineInput, courseInput, defaultInput } from '../src/core/presets'
import { initialDesign, expandedLayerCounts, selectedLayerCount } from '../src/core/initialDesign'
import { buildDomeGroup, domeAt, isDomeGroup } from '../src/core/dome'
import { prepareExpansion } from '../src/core/expansion'
import { buildWorkbook, workbookBytes } from '../src/export/excel'
import * as XLSX from 'xlsx'
import { layupGroups, planFromRows } from '../src/core/layup'

const base = excelBaselineInput()
const generate = (input = base) => {
  const out = autoDesign(input)
  if (!out.ok) throw new Error(out.reason)
  return { out, result: runCheck({ ...input, plan: out.plan }) }
}

describe('课件单角度初估接入扩孔设计', () => {
  it('极孔反算约10度，厚度初估仍使用20度，保留原表精确小数', () => {
    const i = initialDesign(base)
    expect(i.startAngle).toBeCloseTo(10, 2)
    expect(i.estimate.alphaRef).toBe(20)
    expect(i.estimate.nSpiral).toBeCloseTo(14.247551987639529, 10)
    expect(i.estimate.nHoop).toBeCloseTo(23.49516319968423, 10)
    expect([i.spiral, i.hoop]).toEqual([16,24])
    expect(i.pass).toBe(true)
    expect(i.pa).toBeGreaterThanOrEqual(90)
    expect(i.pth).toBeGreaterThanOrEqual(90)
    expect(initialDesign(courseInput()).spiral).toBe(16) // 历史原表手选14不驱动初算
  })
  it('角度、爆压、材料和环向强度改变会重算自动初估；扩孔角度不反写初估角', () => {
    const stronger = { ...base, strength: { ...base.strength, sigmaHoopDirect: 6770 } }
    expect(initialDesign(stronger).estimate.nHoop).toBeCloseTo(initialDesign(base).estimate.nHoop / 2, 10)
    expect(initialDesign(stronger).estimate.nSpiral).toBe(initialDesign(base).estimate.nSpiral)
    const changed = { ...base, constraint: { ...base.constraint, alphaRef: 30 } }
    expect(initialDesign(changed).spiral).toBeGreaterThan(initialDesign(base).spiral)
    expect(initialDesign({ ...base, requirement: { ...base.requirement, pb: 180 } }).spiral).toBeGreaterThan(initialDesign(base).spiral)
    expect(initialDesign({ ...base, material: { ...base.material, tex: .825 } }).estimate.nSpiral).toBeCloseTo(initialDesign(base).estimate.nSpiral * 2, 10)
    expect(initialDesign({ ...base, constraint: { ...base.constraint, candidates: [15,45,70] } }).estimate).toEqual(initialDesign(base).estimate)
  })
  it('旧手填初估记录不再影响计算或扩孔；层数只在最终铺层表修改', () => {
    const input = { ...base, constraint: { ...base.constraint, manualSpiralEstimate: 40, manualHoopEstimate: 32 } }
    const { out, result } = generate(input)
    // 均分16层纵向欠强，自动向10°组补±成对4层（6,2,…,2）后双向满足。
    expect(result.cylinder.spiralLayers).toBe(20)
    expect(result.cylinder.hoopLayers).toBe(24)
    expect(out.plan.spiral.map(g => g.layers)).toEqual([6,2,2,2,2,2,2,2])
    expect(out.plan.groups?.map(g => g.type)).toEqual(Array.from({ length:16 }, (_,i) => i%2 ? 'hoop' : 'spiral'))
    const edited = { ...input, plan: planFromRows(layupGroups(out.plan).map((g,i) => i===0 ? {...g,layers:g.layers+2} : i===1 ? {...g,layers:g.layers+3} : g)) }
    const changed = runCheck(edited)
    expect(changed.cylinder.spiralLayers).toBe(22)
    expect(changed.cylinder.hoopLayers).toBe(27)
    expect(changed.cylinder.pa).toBeGreaterThan(result.cylinder.pa)
    expect(changed.cylinder.pth).toBeGreaterThan(result.cylinder.pth)
    expect(initialDesign(edited)).toEqual(initialDesign(input))
  })
  it('8个所选角度需要至少8对；初估不足时明确记录实际16层', () => {
    const allocation = expandedLayerCounts(base, 8), { out, result } = generate()
    expect(allocation).toMatchObject({ spiral:16, added:0, layers:Array(8).fill(2) })
    expect(out.plan.spiral.map(g => g.angle)).toEqual(base.constraint.candidates.map(Math.round))
    expect(result.cylinder.spiralLayers).toBe(20) // 均分16层后纵向补4层
    const lower = { ...base, requirement: { ...base.requirement, pb:20 } }
    expect(generate(lower).out.trace.join(' ')).toContain('分配为16层')
    expect(result.cylinder.hoopLayers).toBe(initialDesign(base).hoop)
  })
  it('初算向上取整保证厚度足够；自动螺旋始终按±成对分配', () => {
    expect([selectedLayerCount(14.24755,true), selectedLayerCount(15,true), selectedLayerCount(23.49516,false)]).toEqual([16,16,24])
    const data = { ...base, constraint: { ...base.constraint, forceEvenSpiral:false, manualSpiralEstimate:17, manualHoopEstimate:23 } }
    const { result } = generate(data)
    expect(result.cylinder.spiralLayers).toBe(20)
    expect(result.cylinder.hoopLayers).toBe(24)
  })
  it('扩孔后均分的螺旋层须双向满足设计爆压：不足时自动补层并保持候选角不变', () => {
    // 缺陷回归：初估按 alphaRef（小角）定总层数，均分到更大的实际角度后
    // cos²α 变小，筒身纵向欠强（default 案例 pa 138.89 < 157.5）。
    for (const [name, input] of [['默认78L', defaultInput()], ['课件基准', excelBaselineInput()]] as const) {
      const { out, result } = generate(input)
      const d = result.derived
      expect(result.cylinder.paPass, `${name} 纵向 ${result.cylinder.pa.toFixed(2)} < ${d.pb}`).toBe(true)
      expect(result.cylinder.pthPass, `${name} 环向 ${result.cylinder.pth.toFixed(2)} < ${d.pb}`).toBe(true)
      // 补层只加层数、不改角度选择，且保持±成对
      const spiralByAngle = new Map(input.constraint.candidates.map(a => [Math.round(a), 0]))
      for (const g of out.plan.spiral) spiralByAngle.set(g.angle, (spiralByAngle.get(g.angle) ?? 0) + g.layers)
      for (const a of input.constraint.candidates.map(Math.round)) {
        expect(spiralByAngle.get(a) ?? 0, `${name} 角度${a}°应保留`).toBeGreaterThan(0)
      }
      expect(result.cylinder.spiralLayers % 2, `${name} 螺旋应为±成对`).toBe(0)
      expect(result.cylinder.spiralLayers).toBeGreaterThanOrEqual(initialDesign(input).spiral)
    }
  })
  it('扩孔后逐组求解三次样条、逐点厚度和爆压贡献相加；欠强如实返回校核结果', () => {
    const { out, result } = generate()
    expect(result.dome.groups).toHaveLength(8)
    for (const [i,g] of result.dome.groups.entries()) {
      const direct = buildDomeGroup(out.plan.spiral[i].angle, out.plan.spiral[i].layers, base.geometry.R, result.derived.bandTotal, result.derived.tc)
      expect(isDomeGroup(direct)).toBe(true)
      if (!isDomeGroup(direct)) throw new Error('样条求解失败')
      expect(g).toEqual(direct)
      expect(g.splineEndRadius).toBe(g.r2b)
    }
    const p = domeAt(result.dome.groups, 150, base.geometry.R, result.derived.sigmaComposite, base.requirement.ks)
    expect(p.tTotal).toBeCloseTo(p.tGroups.reduce((s,n)=>s+n,0), 12)
    expect(p.pTotal).toBeCloseTo(p.pGroups.reduce((s,n)=>s+n,0)*base.requirement.ks, 12)
    expect(out.verdict).toBe(result.verdict)
    // 自动方案补层后双向满足；手工欠强方案（去掉补层）仍由校核如实返回失败。
    const under = { ...base, plan: planFromRows(layupGroups(out.plan).map(g => g.type==='spiral' ? {...g, layers: Math.max(2, g.layers-4)} : g)) }
    const worse = runCheck(under)
    expect(worse.cylinder.spiralLayers).toBe(result.cylinder.spiralLayers - 4)
    expect(worse.cylinder.paPass).toBe(false)
    expect(worse.verdict).toBe('fail')
    expect(planPressures(base,out.plan).domeMin).toBe(result.dome.minP)
  })
  it('未选角或无效上游计算角度阻止生成', () => {
    for (const constraint of [{...base.constraint,candidates:[]}, {...base.constraint,alphaRef:90}]) {
      expect(autoDesign({ ...base, constraint }).ok).toBe(false)
    }
  })
  it('课件跳选8角，手选4角按上游计算结论分配', () => {
    expect(pickAlternate(Array.from({length:18},(_,i)=>10+i*3))).toEqual([10,16,22,28,34,40,46,52])
    const data = prepareExpansion(base)
    const input = { ...data, constraint: { ...data.constraint, candidates:data.constraint.candidates.slice(0,4), manualSpiralEstimate:14, manualHoopEstimate:24 } }
    const { out, result } = generate(input)
    expect(out.plan.spiral.map(g=>g.layers)).toEqual([4,4,4,4])
    expect(result.cylinder.spiralLayers).toBe(16)
    expect(result.cylinder.hoopLayers).toBe(24)
  })
  it('Excel 初算区向上取整，不受旧手填值影响；逐角度贡献与软件一致', async () => {
    for (const data of [base, { ...base, constraint: { ...base.constraint, manualSpiralEstimate:40, manualHoopEstimate:32 } }]) {
      const { out, result } = generate(data), input = { ...data, plan:out.plan }
      const raw = buildWorkbook(input,result).Sheets['筒身强度设计与计算']
      expect(raw.C27.v).toBe(initialDesign(data).spiral)
      expect(raw.C29.v).toBe(initialDesign(data).hoop)
      expect(raw.C27.f).toContain('ROUNDUP(B27/2,0)')
      const book = XLSX.read(await workbookBytes(input,result),{type:'array'})
      expect(book.Sheets['工况与气瓶参数'].B8.v).toBeCloseTo(result.cylinder.pa,10)
      expect(book.Sheets['工况与气瓶参数'].B9.v).toBeCloseTo(result.cylinder.pth,10)
      expect(book.SheetNames.filter(n=>n.startsWith('封头-'))).toHaveLength(8)
    }
  },15000)
  it('多组材料、压力和计算角度下，上游单角度结论均满足双向设计爆压', () => {
    for (const pb of [20,90,196]) for (const alphaRef of [10,20,30,45]) {
      const data = { ...base, requirement: { ...base.requirement, pb }, constraint: { ...base.constraint, alphaRef },
        strength: { ...base.strength, sigmaHoopDirect: 4000 } }
      const initial = initialDesign(data)
      expect(initial.pass,`${pb}MPa / ${alphaRef}°`).toBe(true)
      expect(initial.spiral%2).toBe(0)
      expect(initial.pa).toBeGreaterThanOrEqual(pb)
      expect(initial.pth).toBeGreaterThanOrEqual(pb)
    }
  })
  it('无效上游压力、角度或几何不会显示初算满足', () => {
    for(const data of [
      {...base, requirement:{...base.requirement,pb:0}},
      {...base, material:{...base.material,vf:0}},
      {...base, geometry:{...base.geometry,r0Winding:200}},
      {...base, constraint:{...base.constraint,alphaRef:90}},
    ]) expect(initialDesign(data).pass).toBe(false)
  })
  it('实际填入角度四舍五入为整度，封头模型和导出使用取整后的真实角度', () => {
    const data = {...base,constraint:{...base.constraint,candidates:[10.001,16.794,23.841,48.593]}}
    const {out,result} = generate(data)
    expect(out.plan.spiral.map(g=>g.angle)).toEqual([10,17,24,49])
    expect(result.dome.groups.map(g=>g.angle)).toEqual([10,17,24,49])
    expect(result.dome.groups[0].r0).toBeCloseTo(30.127958825212414,10)
    expect(buildWorkbook({...data,plan:out.plan},result).SheetNames).toContain('封头-10°')
    expect(autoDesign({...data,constraint:{...data.constraint,candidates:[.4,89.6]}}).ok).toBe(false)
  })
})
