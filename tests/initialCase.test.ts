/**
 * initialCase.test.ts — 默认模板案例（78 L / 70 MPa 初版设计）数值核对。
 *
 * 对照值为外部设计资料的公开数值（筒身表、封头曲线、线型反解），软件按本项目
 * 基准案例口径（内半径 R=135、复材单层厚 ≈0.306、发挥强度 = σc/Vf）计算，
 * 存在两点系统性口径差：① 筒身直径按 2R_in 计（资料外径另含 2t=10）；② 单层厚
 * 0.3056 与 0.3 的 +1.9%。允许差按 2%~3% 量级，个别按行注明。
 */
import { describe, expect, it } from 'vitest'
import { defaultInput } from '../src/core/presets'
import { solveForTheta, windingTurns } from '../src/core/geometry'
import { runCheck } from '../src/core/checker'
import { initialDesign } from '../src/core/initialDesign'
import { domeAt } from '../src/core/dome'
import { deriveParams } from '../src/core/materials'

const base = defaultInput()

describe('默认模板：几何与工况字段', () => {
  it('几何字段与设计指标', () => {
    const g = base.geometry
    expect(g.R).toBe(135)
    expect(g.cylLength).toBe(1282)
    expect(g.volumeL).toBe(78)
    expect(g.r0Winding).toBe(36)
    expect(g.headShortAxis).toBe(67.5) // λ = 2
    expect(g.linerThickness).toBe(5)
    expect(base.requirement.pb).toBe(157.5)
    expect(base.requirement.workingPressure).toBe(70)
    expect(base.requirement.safetyFactor).toBe(2.25)
  })
  it('初始铺层与扩孔候选', () => {
    expect(base.plan.spiral.map((s) => [s.angle, s.layers])).toEqual([
      [15, 8], [20, 8], [25, 4], [35, 4], [40, 4],
    ])
    expect(base.plan.hoop).toBe(36)
    expect(base.constraint.candidates).toEqual([15, 20, 25, 35, 40])
    expect(base.constraint.alphaRef).toBe(15)
  })
})

describe('设计曲线（容积 78 L 反解）', () => {
  it('630°·4切点 → l ≈ 1282（资料 1282 mm，差 <0.1%）；D=2R_in ≈ 270.8（资料外径 280 含 2t）', () => {
    const s = solveForTheta({ lambda: 2, r0: 36, Kf: 0.8 }, 78, 630)
    expect(s.ok).toBe(true)
    expect(s.l).toBeGreaterThan(1279)
    expect(s.l).toBeLessThan(1286)
    expect(s.D).toBeGreaterThan(269)
    expect(s.D).toBeLessThan(272)
    expect(s.D + 2 * 5).toBeGreaterThan(279) // 外径口径与资料 280 对齐
  })
  it('当前几何（l=1282）芯模转角 ≈ 630°（差 <2°）', () => {
    const t = windingTurns({ R_in: 135, l: 1282, lambda: 2, r0: 36, Kf: 0.8 })
    expect(Math.abs(t.roundTrip - 630)).toBeLessThan(2)
    expect(Math.abs(t.alpha0Deg - 15)).toBeLessThan(0.6)
  })
})

describe('筒身网格校核（给定初始铺层）', () => {
  const res = runCheck(base)
  it('逐角纵向爆破与资料各行一致（+1.9% 单层厚口径差内）', () => {
    const rows = res.cylinder.rows.filter((r) => r.type === 'spiral')
    const src = [69.0, 65.3, 30.37, 24.81, 21.7]
    rows.forEach((r, i) => {
      expect(Math.abs(r.paSum - src[i]) / src[i]).toBeLessThan(0.03)
    })
    expect(Math.abs(res.cylinder.pa - 211.19) / 211.19).toBeLessThan(0.03)
  })
  it('环向总爆破与资料总计一致（含 2R_in 与资料外径的直径口径差，<8%）', () => {
    expect(Math.abs(res.cylinder.pth - 183.43) / 183.43).toBeLessThan(0.08)
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
  it('覆盖区最小爆破 ≈ 资料 168.47 MPa（交界处，差 <2%）', () => {
    const eq = domeAt(res.dome.groups, R, R, d.sigmaComposite, base.requirement.ks)
    expect(Math.abs(eq.pTotal - 168.47) / 168.47).toBeLessThan(0.02)
  })
  it('扩孔后最厚 ≈ 资料 19.10 mm（差 <2%），位于两个带宽附近', () => {
    let maxT = { r: 0, t: 0 }
    for (const p of res.dome.profile) if (p.tTotal > maxT.t) maxT = { r: p.r, t: p.tTotal }
    expect(Math.abs(maxT.t - 19.1) / 19.1).toBeLessThan(0.02)
    expect(maxT.r).toBeGreaterThan(48)
    expect(maxT.r).toBeLessThan(76)
  })
})

describe('单角度初估（软件参考表口径）', () => {
  it('螺旋 18 / 环向 33（资料口径因含 0.7 强度系数与外径 R 为 28 / 36，属口径差）', () => {
    const est = initialDesign(base)
    expect(est.spiral).toBe(18)
    expect(est.hoop).toBe(33)
    expect(est.startAngle).toBeGreaterThan(15)
    expect(est.startAngle).toBeLessThan(16)
  })
})
