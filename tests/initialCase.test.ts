/**
 * initialCase.test.ts — 默认模板案例（78 L / 70 MPa 初版设计）数值核对。
 *
 * 对照值为外部设计资料的公开数值（筒身表、封头曲线、线型反解），软件按本项目
 * 缠绕与强度半径R=140由内衬外径280换算，容积扣壁厚5，单层复材厚0.3。材料工艺链与环向发挥强度
 * 按用户授权补齐。按Excel计算形式代入设计，不叠加论文初算利用系数，也不拟合环向强度。
 * 未消除的差异单独断言并记录，不视为严格复现通过。
 */
import { describe, expect, it } from 'vitest'
import { defaultInput, excelBaselineInput } from '../src/core/presets'
import { computeVolume, solveForTheta, windingTurns } from '../src/core/geometry'
import { runCheck } from '../src/core/checker'
import { initialDesign } from '../src/core/initialDesign'
import { domeAt } from '../src/core/dome'
import { deriveParams } from '../src/core/materials'
import { layupGroups } from '../src/core/layup'
import { migrateDefaultLayup } from '../src/state/migrations'

const base = defaultInput()

describe('默认模板：几何与工况字段', () => {
  it('无效强度、爆压和壁厚必须判为不通过，不能只按筒身数值显示通过', () => {
    const changes=[
      (d:typeof base)=>{d.strength.sigmaCompositeDirect=0},
      (d:typeof base)=>{d.requirement.pbMode='direct';d.requirement.pb=0},
      (d:typeof base)=>{d.geometry.linerThickness=70},
    ]
    for(const change of changes){
      const input=structuredClone(base);change(input)
      const result=runCheck(input)
      expect(result.verdict).toBe('fail')
      expect(result.diagnoses.some(d=>d.level==='error')).toBe(true)
    }
  })
  it('几何字段与设计指标', () => {
    const g = base.geometry
    expect(g.R).toBe(140)
    expect(g.cylLength).toBe(1282)
    expect(g.volumeL).toBe(78)
    expect(g.r0Winding).toBe(36)
    expect(g.headShortAxis).toBe(70) // 外表面λ = 2；容积轴向半轴65
    expect(g.linerThickness).toBe(5)
    expect(base.requirement.pb).toBe(157.5)
    expect(base.requirement.workingPressure).toBe(70)
    expect(base.requirement.safetyFactor).toBe(2.25)
    expect(base.material.tex).toBe(1.62)
    expect(deriveParams(base).tc).toBeCloseTo(0.3, 12)
    expect(base.strength.sigmaHoopDirect).toBe(base.strength.sigmaSpiralDirect)
    expect(base.requirement.ks).toBe(0.75)
  })
  it('初始铺层与扩孔候选', () => {
    expect(layupGroups(base.plan).map(g => [g.type, g.angle, g.layers])).toEqual([
      ['spiral',15,8], ['hoop',90,8], ['spiral',20,8], ['hoop',90,8],
      ['spiral',25,4], ['hoop',90,4], ['spiral',35,4], ['hoop',90,4],
      ['spiral',40,4], ['hoop',90,12],
    ])
    expect(base.plan.spiral.map((s) => [s.angle, s.layers])).toEqual([
      [15, 8], [20, 8], [25, 4], [35, 4], [40, 4],
    ])
    expect(base.plan.hoop).toBe(36)
    expect(base.constraint.candidates).toEqual([15, 20, 25, 35, 40])
    expect(base.constraint.alphaRef).toBe(15)
  })
  it('修复未修改的旧默认存档，保留自定义输入与顺序', () => {
    const old = defaultInput()
    old.geometry.R=135;old.geometry.headShortAxis=67.5
    old.constraint.expansionGeometry=JSON.stringify([135,36,20])
    expect(migrateDefaultLayup(old)).toEqual(base)
    old.plan = { spiral: old.plan.spiral, hoop: 36 }
    expect(migrateDefaultLayup(old).plan).toEqual(base.plan)
    expect(migrateDefaultLayup(excelBaselineInput())).toEqual(base)
    const previous = structuredClone(old)
    previous.geometry.portInnerRadius=16;previous.geometry.linerAtPole=20
    previous.material.tex=1.65
    previous.strength.sigmaNOL=2390;previous.strength.kLoss=0.85;previous.strength.sigmaHoopDirect=2080/0.6
    previous.requirement.pbMode='direct';previous.requirement.ks=0.75
    expect(migrateDefaultLayup(previous)).toEqual(base)
    const customInput = { ...old, geometry: { ...old.geometry, R: 141 } }
    expect(migrateDefaultLayup(customInput)).toBe(customInput)
    const customOrder = defaultInput()
    customOrder.plan.groups!.reverse()
    expect(migrateDefaultLayup(customOrder)).toBe(customOrder)
    const customSelection = excelBaselineInput()
    customSelection.constraint.manualSpiralEstimate = 30
    expect(migrateDefaultLayup(customSelection)).toBe(customSelection)
  })
})

describe('设计曲线（容积 78 L 反解）', () => {
  it('630°·4切点的实际反解尺寸满足78 L和630°，不把内径加壁厚伪作论文一致', () => {
    const s = solveForTheta({ lambda: 2, r0: 36, Kf: 0.8, linerThickness: 5 }, 78, 630)
    expect(s.ok).toBe(true)
    expect(s.l).toBeCloseTo(1333.5905689484,6)
    expect(s.D).toBeCloseTo(276.1606396057,6)
    expect(computeVolume({R:s.R,l:s.l,lambda:2,r0:36,Kf:0.8,linerThickness:5}).totalL).toBeCloseTo(78,8)
    expect(s.theta).toBeCloseTo(630,8)
  })
  it('当前外表面几何的真实芯模转角610.703°，记录其与论文630°的差异', () => {
    const t = windingTurns({ R: 140, l: 1282, lambda: 2, r0: 36, Kf: 0.8,linerThickness:5 })
    expect(t.roundTrip).toBeCloseTo(610.7025881217,8)
    expect(t.alpha0Deg).toBeCloseTo(14.9005966878,8)
  })
})

describe('筒身网格校核（给定初始铺层）', () => {
  const res = runCheck(base)
  it('所有组按同一外半径140计算；逐组对应独立网格公式，不拟合论文', () => {
    const spiral=res.cylinder.rows.filter(r=>r.type==='spiral')
    expect(spiral.map(r=>Number(r.paSum.toFixed(2)))).toEqual([66.54,62.97,29.29,23.93,20.92])
    expect(spiral.map(r=>Number(r.pthSum.toFixed(2)))).toEqual([2.39,4.17,3.18,5.87,7.37])
    expect(res.cylinder.rows.filter(r=>r.type==='hoop').reduce((s,r)=>s+r.pthSum,0)).toBeCloseTo(36*.3*2080/140,10)
    expect(res.cylinder.pth).toBeCloseTo(183.4328611603,8)
    expect(res.cylinder.pth-183.43).toBeCloseTo(0.0028611603,8)
  })
  it('纵向合计203.65，与论文211.19的偏差约3.57%，不混用135半径追数值', () => {
    expect(res.cylinder.pa).toBeCloseTo(203.6485633937,8)
    expect(Math.abs(res.cylinder.pa-211.19)/211.19).toBeLessThan(.036)
  })
  it('且双向均大于设计爆破压力 157.5', () => {
    expect(res.cylinder.pa).toBeGreaterThan(157.5)
    expect(res.cylinder.pth).toBeGreaterThan(157.5)
    expect(res.verdict).not.toBe('fail')
  })
})

describe('封头段强度与厚度（扩孔后）', () => {
  const res = runCheck(base)
  const d = deriveParams(base)
  const R = base.geometry.R
  it('原Excel ks=0.75的赤道局部爆压保留实际值及与论文的差异', () => {
    const eq = domeAt(res.dome.groups, R, R, d.sigmaComposite, base.requirement.ks)
    expect(eq.pTotal).toBeCloseTo(159.5343904010,6)
    expect(eq.pTotal).toBeLessThan(168.47)
  })
  it('记录封头最大厚度18.840与论文19.10的剩余差异，未宣称严格复现', () => {
    let maxT = { r: 0, t: 0 }
    for (const p of res.dome.profile) if (p.tTotal > maxT.t) maxT = { r: p.r, t: p.tTotal }
    expect(maxT.t).toBeCloseTo(18.8395151286, 8)
    expect(Math.abs(maxT.t - 19.1) / 19.1).toBeLessThan(.014)
    expect(maxT.r).toBeGreaterThan(48)
    expect(maxT.r).toBeLessThan(76)
  })
})

describe('单角度初估（Excel形式代入朱宁设计）', () => {
  it('公式初算20/35与论文给定方案28/36分别保留', () => {
    const est = initialDesign(base)
    expect(est.spiral).toBe(20)
    expect(est.hoop).toBe(35)
    expect(base.plan.spiral.reduce((s,g)=>s+g.layers,0)).toBe(28)
    expect(base.plan.hoop).toBe(36)
    expect(est.startAngle).toBeCloseTo(14.9005966878,8)
  })
})
