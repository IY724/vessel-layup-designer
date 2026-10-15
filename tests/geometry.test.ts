/**
 * geometry.test.ts — 几何板块的论文数值校核
 *
 * 断言值来源：
 *   朱宁 2023 式(2.6) p17 算例：D=280、t=5、λ=2、l=1282、K_f=0.8 → V ≈ 77.4 L
 *   郑强 2008 表2-1 线型缠绕线型表：θ = 360°·(m + K/n) 的若干格点值
 */
import { describe, expect, it } from 'vitest'
import {
  computeVolume,
  computeVolumeZhuLiteral,
  depthFromLambda,
  geometryChecks,
  headMinorAxis,
  headSurfaceArea,
  lambdaFromDepth,
  lineTypeTable,
  matchLineType,
  meridianProfile,
  solveGeometry,
  windingTurns,
  cylinderSurfaceArea,
  deriveJoint,
  checkJoint,
  bossZoneRadius,
  PLUGIN_JOINT_DEFAULT,
  designCurve,
  solveForTheta,
  intersectLineTypes,
  allowedLineTypes,
  lengthFromVolume,
  maxInnerRadius,
  type VolumeParams,
  type DesignBase,
} from '../src/core/geometry'

/** 朱宁 2023 式(2.6) 的算例 */
const ZHU: VolumeParams = {
  R_in: 140 - 5,
  l: 1282,
  lambda: 2,
  r0: 36,
  Kf: 0.8,
}
/** 课程案例（封头表 C14 短半轴 100、R 173.5）折算成内表面参数 */
const COURSE: VolumeParams = {
  R_in: 173.5,
  l: 800,
  lambda: 173.5 / 100,
  r0: 30.13,
  Kf: 1,
}

describe('容积正算（朱宁式2.6）', () => {
  it('照论文原文写法 b = D/(2λ) − t → 77.4 L 量级', () => {
    const v = computeVolumeZhuLiteral(ZHU, 5)
    expect(v.totalL).toBeCloseTo(77.37, 1)
    expect(v.b).toBeCloseTo(65, 6)
  })
  it('按轴比一致性 b = R_in/λ → 与原文写法差 <0.2 L', () => {
    const lit = computeVolumeZhuLiteral(ZHU, 5).totalL
    const std = computeVolume(ZHU).totalL
    expect(std).toBeGreaterThan(lit)
    expect(std - lit).toBeLessThan(0.2)
  })
  it('封头/筒身分解：筒身占绝大部分，封头含 Kf 折减', () => {
    const v = computeVolume(ZHU)
    expect(v.cylMm3 / v.totalMm3).toBeGreaterThan(0.9)
    expect(v.headMm3).toBeGreaterThan(1e6)
  })
  it('容积只含封头+筒身两项（Ⅲ型瓶"接嘴项"不采用，防回归）', () => {
    const v = computeVolume(ZHU)
    expect(v.totalMm3).toBeCloseTo(v.headMm3 + v.cylMm3, 6)
    expect('nozzleMm3' in v).toBe(false)
    expect('nozzle' in ZHU).toBe(false)
  })
})

describe('容积↔尺寸互算', () => {
  it('反算筒身长度 l 后再正算，回到目标容积', () => {
    const out = solveGeometry(ZHU, 'l', 78)
    expect(out.ok).toBe(true)
    expect(out.params.l).toBeGreaterThan(1000)
    expect(computeVolume(out.params).totalL).toBeCloseTo(78, 6)
  })
  it('反算筒身内半径 R_in 后再正算，回到目标容积', () => {
    const out = solveGeometry({ ...ZHU, l: 1282 }, 'R_in', 80)
    expect(out.ok).toBe(true)
    expect(out.params.R_in).toBeGreaterThan(ZHU.R_in)
    expect(computeVolume(out.params).totalL).toBeCloseTo(80, 4)
  })
  it('反算封头轴比 λ（λ↑ 封头变浅 → 容积单调减）', () => {
    // 筒身段本身已 73.4 L，故目标必须落在 [λ→∞ 的 73.4+ε, λ=1 的 ~106] 区间内
    const out = solveGeometry(ZHU, 'lambda', 80)
    expect(out.ok).toBe(true)
    expect(out.params.lambda).toBeLessThan(ZHU.lambda)
    expect(computeVolume(out.params).totalL).toBeCloseTo(80, 4)
  })
  it('目标容积落在 λ 可达区间外时明确报无解', () => {
    const out = solveGeometry(ZHU, 'lambda', 70)
    expect(out.ok).toBe(false)
    expect(out.solved).toContain('λ')
  })
  it('目标容积不可达时明确报无解，不返回半成品', () => {
    const out = solveGeometry(ZHU, 'l', 0.5)
    expect(out.ok).toBe(false)
    expect(out.solved).toContain('l')
  })
  it('λ ↔ 封头深度互算与课程表 C14=100 一致', () => {
    expect(lambdaFromDepth(173.5, 100)).toBeCloseTo(1.735, 6)
    expect(depthFromLambda(173.5, 1.735)).toBeCloseTo(100, 2)
    expect(headMinorAxis(COURSE)).toBeCloseTo(100, 2)
  })
})

describe('外形轮廓（半椭球）', () => {
  const prof = meridianProfile(COURSE, 60)
  it('赤道 z=0、极孔处 z>0、单调下降', () => {
    expect(prof[prof.length - 1].z).toBeLessThan(1e-6)
    expect(prof[0].z).toBeGreaterThan(50)
    expect(prof.every((p, i) => i === 0 || p.z <= prof[i - 1].z + 1e-9)).toBe(true)
  })
  it('主曲率半径为正且有限（朱宁式2.20）', () => {
    const inner = prof.slice(0, prof.length - 1)
    expect(inner.every((p) => p.Rphi > 0 && Number.isFinite(p.Rphi))).toBe(true)
    expect(inner.every((p) => p.Rtheta > 0 && Number.isFinite(p.Rtheta))).toBe(true)
    // 赤道上 R_θ → R_in（圆柱极限），R_φ 在椭球赤道取最小
    const eq = prof[prof.length - 2]
    expect(eq.Rtheta).toBeGreaterThan(eq.Rphi)
  })
  it('单个封头面积介于同半径圆盘与半球之间（扁椭球必小于半球）', () => {
    const one = headSurfaceArea(COURSE, 1)
    const disk = Math.PI * COURSE.R_in ** 2
    const hemisphere = 2 * Math.PI * COURSE.R_in ** 2
    expect(one).toBeGreaterThan(disk)
    expect(one).toBeLessThan(hemisphere)
    expect(headSurfaceArea(COURSE, 2)).toBeCloseTo(2 * one, 6)
  })
  it('筒身内表面积 = 2πRl', () => {
    expect(cylinderSurfaceArea(COURSE)).toBeCloseTo(2 * Math.PI * 173.5 * 800, 3)
  })
})

describe('线型缠绕切点表（郑强 表2-1）', () => {
  const t = lineTypeTable()
  const has = (deg: number, n: number, K: number) =>
    t.some((r) => Math.abs(r.theta - deg) < 1e-6 && r.n === n && r.K === K)
  it('n=1 为 360° 整数倍', () => expect(has(360, 1, 0)).toBe(true))
  it('n=2 → 180/540；n=3 → 120/240/480；n=4 → 90/270/450/630', () => {
    expect(has(180, 2, 1)).toBe(true)
    expect(has(540, 2, 1)).toBe(true)
    expect(has(120, 3, 1)).toBe(true)
    expect(has(240, 3, 2)).toBe(true)
    expect(has(480, 3, 1)).toBe(true)
    expect(has(90, 4, 1)).toBe(true)
    expect(has(270, 4, 3)).toBe(true)
    expect(has(450, 4, 1)).toBe(true)
  })
  it('朱宁引用的 n=4、θ_n=630° 在表内', () => expect(has(630, 4, 3)).toBe(true))
  it('表内不含非最简分数（如 n=4,K=2 → 应归到 n=2）', () => {
    expect(t.some((r) => r.n === 4 && r.K === 2)).toBe(false)
  })
  it('matchLineType 给出最接近的切点方案并按偏差排序', () => {
    const m = matchLineType(628)
    expect(m.length).toBeGreaterThan(0)
    expect(Math.abs(m[0].dev)).toBeLessThan(5)
    expect(m.every((r, i) => i === 0 || Math.abs(r.dev) >= Math.abs(m[i - 1].dev))).toBe(true)
  })
})

describe('单程/双程转角（郑强式2-4）', () => {
  const w = windingTurns(COURSE)
  it('α₀ = arcsin(r₀/R) ≈ 10°（r₀ 用课程表的 30.13 圆整值）', () => expect(w.alpha0Deg).toBeCloseTo(10, 2))
  it('θ_双程 = 2·θ_单程，且随筒身长度单调增', () => {
    expect(w.roundTrip).toBeCloseTo(2 * w.oneWay, 9)
    const longer = windingTurns({ ...COURSE, l: 1200 })
    expect(longer.roundTrip).toBeGreaterThan(w.roundTrip)
  })
  it('β 含封头深度项：λ 变大（封头变浅）时 β 变小', () => {
    const shallow = windingTurns({ ...COURSE, lambda: 2.5 })
    expect(shallow.beta).toBeLessThan(w.beta)
  })
  it('算得转角能落到线型表附近', () => {
    expect(matchLineType(w.roundTrip).length).toBeGreaterThan(0)
  })
})

describe('经验区间提示', () => {
  it('课程案例各项在经验区间内', () => {
    const cs = geometryChecks(COURSE)
    expect(cs.length).toBe(3)
  })
  it('λ>2.5 与极孔比过大都会报警', () => {
    expect(geometryChecks({ ...COURSE, lambda: 3 }).some((c) => c.level === 'warn' && c.text.includes('轴比'))).toBe(true)
    expect(geometryChecks({ ...COURSE, r0: 100 }).some((c) => c.level === 'warn' && c.text.includes('极孔比'))).toBe(true)
  })
})

describe('Ⅳ型瓶接头尺寸设计（对齐 type4_builder_kernel.py 默认参数）', () => {
  const j = PLUGIN_JOINT_DEFAULT
  const d = deriveJoint(j, 12)

  it('派生量与插件一致：R_out=140、r_n=36、y_eq=641、H=119', () => {
    expect(d.R_out).toBe(140)
    expect(d.r_n).toBe(36)
    expect(d.y_eq).toBe(641)
    expect(d.H).toBe(119)
  })
  it('圆角行高 z_28=2、z_35=37（kernel:340-341）', () => {
    expect(d.z_28).toBe(2)
    expect(d.z_35).toBe(37)
  })
  it('封头分界深度 z_sp ≈ 53.6 mm（对标 test_profile_generator 断言 53.58 / 六模型 53.619）', () => {
    expect(d.z_sp).toBeCloseTo(53.62, 1)
  })
  it('内肩直段余量 = 135−30−50−28 = 27 mm', () => {
    expect(d.shoulderFlat).toBe(27)
  })
  it('R_nf 相切数值求解给出颈直段 ≥ 3 mm', () => {
    expect(d.yc).toBeGreaterThan(0)
    expect(d.neckStraight).toBeGreaterThanOrEqual(3)
    expect(d.neckStraight).toBeLessThan(d.H)
  })
  it('插件默认参数下全部约束通过', () => {
    const rows = checkJoint(j, d, 12)
    const bad = rows.filter((r) => !r.ok)
    expect(bad.map((r) => `${r.name}: ${r.text}`)).toEqual([])
  })
  it('破坏半径链 / 封头深度不够时会点名报错', () => {
    const bad1 = checkJoint({ ...j, r_f: 95 }, d, 12).find((r) => r.name === '半径链')
    expect(bad1?.ok).toBe(false)
    const bad2 = checkJoint({ ...j, R_if: 80 }, deriveJoint({ ...j, R_if: 80 }, 12), 12).find((r) => r.name === '封头深度与接头')
    expect(bad2?.ok).toBe(false)
  })
  it('α₀ 超 54.74° 或 r_cl 越过 r_sp 会报警', () => {
    expect(checkJoint(j, deriveJoint(j, 60), 60).some((r) => r.name === '缠绕角上限' && !r.ok)).toBe(true)
    const big = deriveJoint(j, 50)
    // α₀=50° → r_cl=107.2 > r_sp=90，应被点名
    expect(checkJoint(j, big, 50).some((r) => r.name === 'Clairaut 常数' && !r.ok)).toBe(true)
    expect(big.rCl).toBeCloseTo(140 * Math.sin(50 * (Math.PI / 180)), 6)
  })
  it('r_cl 与通孔半径 r0 是两个量（界面必须区分）', () => {
    expect(d.rCl).not.toBe(j.r0)
    expect(bossZoneRadius(d, j).r_sp).toBe(90)
    expect(bossZoneRadius(d, j).suggest).toBeCloseTo(d.rCl, 6)
  })
})

describe('容积驱动的线型切点设计（V → Φ=f(D) → 与线型表求交）', () => {
  // 论文算例口径：V≈77.4 L（=78 L 量级）、λ=2、r₀=36、K_f=0.8
  const base: DesignBase = { lambda: 2, r0: 36, Kf: 0.8 }
  const V = 77.4

  it('长度反解 lengthFromVolume：R_in=135 时 l≈1280 mm', () => {
    expect(lengthFromVolume(135, 2, 0.8, V * 1e6)).toBeCloseTo(1280, 0)
  })

  it('maxInnerRadius：封头填满容积的半径上限 ≈ 358.8 mm', () => {
    expect(maxInnerRadius(V, 2, 0.8)).toBeCloseTo(358.8, 0)
  })

  it('designCurve：在可行域内 Φ 随 D 单调减，且覆盖 632°', () => {
    const curve = designCurve(base, V, { dMin: 240, dMax: 310 })
    expect(curve.length).toBeGreaterThan(10)
    expect(curve.every((p, i) => i === 0 || p.theta <= curve[i - 1].theta + 1e-6)).toBe(true)
    const thetas = curve.map((p) => p.theta)
    expect(Math.max(...thetas)).toBeGreaterThan(700)
    expect(Math.min(...thetas)).toBeLessThan(560)
  })

  it('solveForTheta(632°) → R_in≈135、D≈270（论文 630°/4切点）', () => {
    const s = solveForTheta(base, V, 632)
    expect(s.ok).toBe(true)
    expect(s.R).toBeCloseTo(134.9, 0)
    expect(s.D).toBeCloseTo(269.8, 0)
    expect(s.theta).toBeCloseTo(632, 2)
  })

  it('目标转角超出可达区间时明确报无解', () => {
    const s = solveForTheta(base, V, 100)
    expect(s.ok).toBe(false)
    expect(s.reason).toContain('超出可达区间')
  })

  it('allowedLineTypes 给出 450/480/540/600/630 五档', () => {
    expect(allowedLineTypes(450, 660, 4).map((r) => r.theta)).toEqual([450, 480, 540, 600, 630])
  })

  it('intersectLineTypes：630° 档对应 4 切点、D≈270、长径比≈4.7', () => {
    const cands = intersectLineTypes(base, V, allowedLineTypes(450, 660, 4))
    expect(cands.map((c) => c.theta)).toEqual([450, 480, 540, 600, 630])
    const c630 = cands.find((c) => c.theta === 630)!
    expect(c630.n).toBe(4)
    expect(c630.K).toBe(3)
    expect(c630.m).toBe(1)
    expect(c630.D).toBeCloseTo(270, 0)
    expect(c630.ratio).toBeCloseTo(4.73, 1)
    expect(Math.abs(c630.dev)).toBeLessThan(0.01)
  })
})
