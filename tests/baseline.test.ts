/**
 * baseline.test.ts — 对照两张 Excel 缓存值的基准测试（规划 §9）
 *
 * 断言值来源（全部为 Excel 缓存值，非人工推算）：
 *   强度设计与计算.xls  → CYL_* 常量
 *   封头厚度计算公式最终-演示版.xls → EXCEL_T / EXCEL_P_RAW 与 DOME_10_* 常量
 * 复现工具：仓库外 _work/compare_model.py（逐点 144 格点对账）
 */
import { describe, expect, it } from 'vitest'
import { courseCase, blankInput } from '../src/core/presets'
import { deriveParams, fiberLayerThickness, compositeLayerThickness, totalBandWidth } from '../src/core/materials'
import { cylinderCheck, initialEstimate, paUnit, pthUnit, hoopUnit } from '../src/core/netting'
import { buildDomeGroup, buildDomeGroups, domeAt, domeCheck, groupPressure, groupThickness, isDomeGroup, layerThickness, splineAt, coverageAt } from '../src/core/dome'
import { angleFromPoleRadius, checkPoleConsistency, poleRadius, poleTable } from '../src/core/geodesic'
import { runCheck, suggestHoopSwap } from '../src/core/checker'

const R = 173.5
const BAND = 20
const TC = 0.305555555555556
const SIGC = 2031
const KS = 0.75
const PLAN = {
  spiral: [
    { angle: 10, layers: 4 },
    { angle: 17, layers: 4 },
    { angle: 25, layers: 4 },
    { angle: 37, layers: 2 },
    { angle: 40, layers: 2 },
    { angle: 45, layers: 2 },
  ],
  hoop: 23,
}

// ── Excel 缓存值 ──────────────────────────────────────────────────────────────
const CYL = {
  tf: 0.183333333333333,
  tc: 0.305555555555556,
  sigma: 3385,
  pa: 102.09988121283,
  pth: 95.6008759161595,
  spiralThk: 5.5,
  hoopThk: 7.02777777777778,
  totalThk: 12.5277777777778,
  // 单层/多层逐格（I12..I17 / K12..K17 / L12..L17 / L22）
  paUnit: [6.93798797413963, 6.54219156818957, 5.8760035611223, 4.5627625103175, 4.19796260987574, 3.57684927931873],
  paSum: [27.7519518965585, 26.1687662727583, 23.5040142444892, 9.12552502063499, 8.39592521975147, 7.15369855863746],
  pthSum: [0.431420785630438, 1.22301359753056, 2.55538961166511, 2.59093585663735, 2.95573575707911, 3.57684908763612],
  hoopSum: 82.2675312199808,
  // 初估（B20/B24/B27/B29/B31/B33）
  hSpiral: 2.61205119773391,
  hHoop: 4.30744658660878,
  hTotal: 6.91949778434269,
  tCompositeEst: 11.5324963072378,
}

const EXCEL_T: Record<string, number> = {
  '30.2': 0.668244, '50': 6.67681, '62': 9.70305, '70': 9.015007, '83': 10.552094,
  '104': 8.21527, '128': 9.504209, '150': 7.460723, '173.5': 5.737058,
}
/** Excel 总爆破压强!B 列（未乘 ks，笔误口径 cos(u·cos u)） */
const EXCEL_P_RAW: Record<string, number> = {
  '30.2': 15.561001, '50': 133.094523, '62': 199.330739, '70': 185.237836, '83': 219.847716,
  '104': 167.548682, '128': 201.29412, '150': 158.178561, '173.5': 123.92184,
}
const DOME_10 = {
  r0: 30.127959, rb: 50.127959, r2b: 70.127959, mR: 53.678553, tR: 0.611111,
  Vconst: 32264.7207, m1: -30.982068, m2: 1.83833147687698, m3: -0.0318264791471904,
  m4: 0.000175198584552128, t30_2: 0.3341218, t70: 1.8445022, t173_5: 0.6190238,
  J30_2: 0.668243610407, L30_2: 15.5610013563449, K30_2: 86.0416812669207,
}
const R0_TABLE: Record<number, number> = {
  10: 30.127959, 17: 50.726491, 25: 73.324268, 37: 104.414907, 40: 111.52365, 45: 122.683027,
}

const built = buildDomeGroups(PLAN.spiral, R, BAND, TC)
const groups = built.groups

function domeArgs(refMode: 'corrected' | 'excel', rBoss = 50.13) {
  return { R, bandTotal: BAND, tc: TC, sigmaComposite: SIGC, ks: KS, refMode, rBoss, pb: 90, samples: 288 }
}

describe('工艺参数链（§9）', () => {
  it('tf / tc / 总带宽 与 Excel 一致', () => {
    const m = blankInput().material
    expect(fiberLayerThickness(m)).toBeCloseTo(CYL.tf, 10)
    expect(compositeLayerThickness(m)).toBeCloseTo(CYL.tc, 10)
    expect(totalBandWidth(m)).toBe(20)
  })
  it('模式 A：σ发挥 = σNOL/Vf·k，σc = σ发挥·Vf', () => {
    const d = deriveParams(blankInput())
    expect(d.sigmaSpiral).toBeCloseTo((2390 / 0.6) * 0.85, 8)
    expect(d.sigmaSpiral).toBeCloseTo(3385.833333, 4)
    expect(d.sigmaComposite).toBeCloseTo(2031.5, 3)
  })
  it('模式 B（课程案例）：直接用 Excel 的 3385 / 2031', () => {
    const d = deriveParams(courseCase())
    expect(d.sigmaSpiral).toBe(3385)
    expect(d.sigmaHoop).toBe(3385)
    expect(d.sigmaComposite).toBe(2031)
    expect(d.pb).toBe(90)
  })
})

describe('筒身网格理论校核（复刻强度设计与计算.xls）', () => {
  const d = deriveParams(courseCase())
  const res = cylinderCheck(PLAN, {
    R, tf: d.tf, tc: d.tc, sigmaSpiral: d.sigmaSpiral, sigmaHoop: d.sigmaHoop, pb: d.pb, alphaRef: 20,
  })
  // Excel 用 π≈3.1415926（相对误差 8.4e-8），故对账按相对偏差判定，不用机器精度
  it('pα = 102.09988121283（相对偏差 <2e-8）', () => {
    expect(Math.abs(res.pa - CYL.pa) / CYL.pa).toBeLessThan(2e-8)
  })
  it('pθ = 95.6008759161595（相对偏差 <2e-8）', () => {
    expect(Math.abs(res.pth - CYL.pth) / CYL.pth).toBeLessThan(2e-8)
  })
  it('螺旋/环向/总厚度 = 5.5 / 7.0277778 / 12.5277778', () => {
    expect(res.spiralThickness).toBeCloseTo(CYL.spiralThk, 8)
    expect(res.hoopThickness).toBeCloseTo(CYL.hoopThk, 8)
    expect(res.totalThickness).toBeCloseTo(CYL.totalThk, 8)
  })
  it('逐格：单层贡献与组贡献', () => {
    const spiral = res.rows.filter((r) => r.type === 'spiral')
    spiral.forEach((r, i) => {
      expect(r.paUnit).toBeCloseTo(CYL.paUnit[i], 6)
      expect(r.paSum).toBeCloseTo(CYL.paSum[i], 6)
      expect(r.pthSum).toBeCloseTo(CYL.pthSum[i], 6)
    })
    expect(res.rows[res.rows.length - 1].pthSum).toBeCloseTo(CYL.hoopSum, 6)
  })
  it('初估公式（B20/B24/B31/B33）', () => {
    const e = initialEstimate(R, 90, 3385, CYL.tf, 20, CYL.tc)
    expect(e.hSpiral).toBeCloseTo(CYL.hSpiral, 6)
    expect(e.hHoop).toBeCloseTo(CYL.hHoop, 6)
    expect(e.hTotal).toBeCloseTo(CYL.hTotal, 6)
    expect(e.tComposite).toBeCloseTo(CYL.tCompositeEst, 6)
    // 软件规则：层数向上取整（Excel 手工写了 14 层/24 层，此处保守取 15/24）
    expect(e.nSpiral).toBe(15)
    expect(e.nHoop).toBe(24)
  })
  it('单层贡献函数与表格口径一致', () => {
    expect(paUnit(10, CYL.tf, 3385, R)).toBeCloseTo(CYL.paUnit[0], 6)
    expect(pthUnit(90, CYL.tf, 3385, R)).toBeCloseTo(hoopUnit(CYL.tf, 3385, R), 10)
  })
})

describe('封头单组模型（复刻封头表 10° sheet）', () => {
  const g10 = groups.find((g) => g.angle === 10)!
  it('r0 / rb / r2b / mR / tR', () => {
    expect(g10.r0).toBeCloseTo(DOME_10.r0, 6)
    expect(g10.rb).toBeCloseTo(DOME_10.rb, 6)
    expect(g10.r2b).toBeCloseTo(DOME_10.r2b, 6)
    expect(g10.mR).toBeCloseTo(DOME_10.mR, 5)
    expect(g10.tR).toBeCloseTo(DOME_10.tR, 6)
  })
  it('体积守恒常数 Vconst（相对偏差 <1e-7；Excel 的 mR 用 π≈3.1415926）', () => {
    expect(Math.abs(g10.Vconst - DOME_10.Vconst) / DOME_10.Vconst).toBeLessThan(1e-7)
  })
  it('样条系数 m1..m4', () => {
    expect(g10.m[0]).toBeCloseTo(DOME_10.m1, 6)
    expect(g10.m[1]).toBeCloseTo(DOME_10.m2, 6)
    expect(g10.m[2]).toBeCloseTo(DOME_10.m3, 8)
    expect(g10.m[3]).toBeCloseTo(DOME_10.m4, 11)
  })
  it('厚度：样条段 30.2/70 与覆盖段 173.5', () => {
    expect(splineAt(g10, 30.2)).toBeCloseTo(DOME_10.t30_2, 7)
    expect(splineAt(g10, 70)).toBeCloseTo(DOME_10.t70, 6)
    expect(coverageAt(g10, R)).toBeCloseTo(DOME_10.t173_5, 6)
    // 样条/覆盖在 r2b 处衔接（Excel 验证 t样条(70.128)=1.84450 vs t覆盖(70.128)=1.84444）
    expect(layerThickness(g10, 70.128, 'corrected')).toBeGreaterThan(1.8)
    expect(layerThickness(g10, 70.128, 'corrected')).toBeLessThan(1.85)
  })
  it('样条首条件 t(r0) = nR·tp', () => expect(splineAt(g10, g10.r0)).toBeCloseTo(TC, 8))
  it('局部角 K(30.2) = 86.0416813°', () => {
    const u = Math.asin(g10.r0 / 30.2)
    expect((u * 180) / Math.PI).toBeCloseTo(DOME_10.K30_2, 5)
  })
  it('组厚度 J(30.2) = 0.668243610407（含循环数 2）', () => {
    expect(groupThickness(g10, 30.2, 'corrected')).toBeCloseTo(DOME_10.J30_2, 8)
  })
  it('Excel 原样口径的 L(30.2) = 15.5610013563449', () => {
    expect(groupPressure(g10, 30.2, R, SIGC, 'excel')).toBeCloseTo(DOME_10.L30_2, 6)
  })
  it('修正 cos² 口径在极孔边缘显著低于笔误式（规划 §2 的核心发现）', () => {
    const fixed = groupPressure(g10, 30.2, R, SIGC, 'corrected')
    expect(fixed).toBeLessThan(DOME_10.L30_2)
    expect(fixed).toBeGreaterThan(0)
  })
})

describe('循环数 I23 = 层数/2（★每组各自取值）', () => {
  it('10/17/25°×4 层 → 2；37/40/45°×2 层 → 1', () => {
    expect(groups.map((g) => [g.angle, g.cycles])).toEqual([
      [10, 2], [17, 2], [25, 2], [37, 1], [40, 1], [45, 1],
    ])
  })
  it('r < r0 时组厚度/组爆压为 0（修正口径）', () => {
    const g45 = groups.find((g) => g.angle === 45)!
    expect(g45.r0).toBeCloseTo(R0_TABLE[45], 6)
    expect(groupThickness(g45, 122.6, 'corrected')).toBe(0)
    expect(groupPressure(g45, 122.6, R, SIGC, 'corrected')).toBe(0)
    expect(groupThickness(g45, 122.7, 'corrected')).toBeGreaterThan(0)
  })
})

describe('封头逐点复现 Excel（总厚度 / 总爆破压强表，抽样 9 个格点）', () => {
  const at = (r: number, refMode: 'corrected' | 'excel' = 'excel') =>
    domeAt(groups, r, R, SIGC, KS, refMode)

  it('总厚度 t总(r) 与 Excel「总厚度」表一致（excel 口径 ≤1e-3 mm）', () => {
    for (const [k, v] of Object.entries(EXCEL_T)) {
      expect(at(Number(k)).tTotal).toBeCloseTo(v, 3)
    }
  })
  it('总爆破压强（笔误口径，未乘 ks）与 Excel B 列一致（≤1e-2 MPa）', () => {
    for (const [k, v] of Object.entries(EXCEL_P_RAW)) {
      expect(at(Number(k)).pSum).toBeCloseTo(v, 2)
    }
  })
  it('修正口径在常规点与 Excel 同值，在 r=50/73 处剔除极孔下方样条外插的虚假厚度', () => {
    for (const k of ['62', '83', '128', '150', '173.5']) {
      expect(at(Number(k), 'corrected').tTotal).toBeCloseTo(at(Number(k), 'excel').tTotal, 4)
    }
    for (const k of ['50', '73', '104']) {
      const leak = at(Number(k), 'excel').tTotal - at(Number(k), 'corrected').tTotal
      expect(leak).toBeGreaterThan(0.03)
      expect(leak).toBeLessThan(0.5)
    }
  })
  it('t总(R) = 5.737058（封头→筒身螺旋层 5.50 的衔接处）', () => {
    expect(at(R, 'corrected').tTotal).toBeCloseTo(EXCEL_T['173.5'], 4)
  })
  it('p总(R)：修正 79.39 MPa vs 原样 92.94 MPa（×ks=0.75）', () => {
    expect(at(R, 'corrected').pTotal).toBeCloseTo(79.39, 1)
    expect(at(R, 'excel').pTotal).toBeCloseTo(92.94, 1)
  })
  it('笔误口径使中段爆压系统性虚高（规划 §2 的量化）', () => {
    let worst = 0
    for (let r = 55; r <= 170; r += 1) {
      const d = at(r, 'excel').pTotal - at(r, 'corrected').pTotal
      worst = Math.max(worst, d)
    }
    expect(worst).toBeGreaterThan(60)
  })
  it('domeCheck 曲线端点、判定窗口与 t总(R)', () => {
    const res = domeCheck(groups, domeArgs('corrected'))
    expect(res.profile[0].r).toBeCloseTo(30.128, 3)
    expect(res.profile[res.profile.length - 1].r).toBe(R)
    expect(res.minPR).toBeGreaterThanOrEqual(50.13)
    expect(res.tAtR).toBeCloseTo(EXCEL_T['173.5'], 4)
    expect(res.groups.length).toBe(6)
  })
})

describe('测地线角度 ↔ 极孔（§8.3 对照表）', () => {
  it('r0 = R·sinα 六组全部对齐', () => {
    for (const [a, v] of Object.entries(R0_TABLE)) {
      expect(poleRadius(R, Number(a))).toBeCloseTo(v, 6)
      expect(angleFromPoleRadius(R, v)).toBeCloseTo(Number(a), 6)
    }
  })
  it('对照表含扩孔量（逐组增大）', () => {
    const t = poleTable(R, [10, 17, 25, 37, 40, 45])
    expect(t[0].delta).toBe(0)
    expect(t.every((r, i) => i === 0 || r.r0 > t[i - 1].r0)).toBe(true)
  })
  it('极孔一致性校验：30.13 对 10° 通过，45 对 10° 报警', () => {
    expect(checkPoleConsistency(R, 30.13, 10, BAND).level).toBe('ok')
    expect(checkPoleConsistency(R, 45, 10, BAND).level).toBe('warn')
  })
})

describe('汇总判定、薄弱区定位与对策（runCheck）', () => {
  const base = courseCase()
  const input = { ...base, constraint: { ...base.constraint, rBossAuto: false, rBoss: 50.13 } }
  const res = runCheck(input)

  it('筒身满足 pb=90：判定不为 fail', () => {
    expect(res.cylinder.paPass).toBe(true)
    expect(res.cylinder.pthPass).toBe(true)
    expect(res.verdict).not.toBe('fail')
  })
  it('封头薄弱区被识别，且对策区分"极孔侧承载空档"与"近赤道"', () => {
    expect(res.dome.pass).toBe(false)
    expect(res.verdict).toBe('adjust')
    expect(res.dome.weakZones.length).toBeGreaterThan(0)
    expect(res.advice.kind).toBe('pole-gap')
    expect(res.advice.text).toContain('局部缠绕角')
  })
  it('把判定窗口下界推到各组极孔边缘之上 → 薄弱点转为近赤道，置换建议生效', () => {
    const wide = runCheck({ ...input, constraint: { ...input.constraint, rBoss: 125 } })
    expect(wide.dome.minPR).toBeGreaterThan(140)
    expect(wide.advice.kind).toBe('equator')
    expect(wide.advice.variants.length).toBeGreaterThan(0)
    expect(wide.advice.variants[0].pAtR).toBeGreaterThan(wide.dome.minP - 5)
  })
  it('接嘴区低值不计入判定：minPAll < minP', () => {
    expect(res.dome.minPAll).toBeLessThan(res.dome.minP)
  })
  it('Excel 口径下爆压系统性虚高', () => {
    const raw = runCheck({ ...input, refMode: 'excel' })
    expect(raw.dome.minP).toBeGreaterThan(res.dome.minP)
  })
  it('rBossAuto：默认取最低角度组 r0 + 1 倍总带宽', () => {
    const auto = runCheck({ ...input, constraint: { ...input.constraint, rBossAuto: true } })
    expect(auto.dome.profile[0].r).toBeCloseTo(30.128, 2)
    expect(auto.dome.minPR).toBeGreaterThanOrEqual(50)
  })
  it('环向层不参与封头校核', () => {
    expect(res.dome.groups.every((g) => g.angle < 90)).toBe(true)
  })
  it('非法/极端角度组被隔离而不是让整体崩溃', () => {
    const bad = buildDomeGroups([{ angle: 89.9, layers: 4 }, { angle: 10, layers: 4 }], R, BAND, TC)
    expect(bad.groups.every(isDomeGroup)).toBe(true)
    const huge = buildDomeGroup(95, 4, R, BAND, TC)
    expect(isDomeGroup(huge)).toBe(false)
  })
})

describe('调整建议（环向层 ⇄ 高角螺旋层等厚置换）', () => {
  it('近赤道薄弱时，置换 2 层可提高 r=R 处与有效区最小爆压', () => {
    const base = courseCase()
    const input = { ...base, constraint: { ...base.constraint, rBossAuto: false, rBoss: 125 } }
    const res = runCheck(input)
    const swaps = suggestHoopSwap(input, { maxTransfer: 4, targetAngle: 45 })
    expect(swaps.length).toBe(2)
    expect(swaps[0].pAtR).toBeGreaterThan(domeAt(res.dome.groups, R, R, 2031, 0.75, 'corrected').pTotal)
    expect(swaps[0].pa).toBeGreaterThan(res.cylinder.pa)
    expect(swaps[0].pth).toBeLessThan(res.cylinder.pth)
  })
})
