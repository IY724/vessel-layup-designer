/**
 * baseline.test.ts — 对照两张 Excel 缓存值的基准测试（规划 §9）
 *
 * 断言值来源（全部为 Excel 缓存值，非人工推算）：
 *   强度设计与计算.xls  → CYL_* 常量
 *   封头厚度计算公式最终-演示版.xls → EXCEL_T / EXCEL_P_RAW 与 DOME_10_* 常量
 * 复现工具：仓库外 _work/compare_model.py（逐点 144 格点对账）
 */
import { describe, expect, it } from 'vitest'
import { defaultInput, blankInput } from '../src/core/presets'
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

function domeArgs(rBoss = 122.683) {
  return { R, bandTotal: BAND, tc: TC, sigmaComposite: SIGC, ks: KS, rBoss, pb: 90, samples: 288 }
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
    const d = deriveParams(defaultInput())
    expect(d.sigmaSpiral).toBe(3385)
    expect(d.sigmaHoop).toBe(3385)
    expect(d.sigmaComposite).toBe(2031)
    expect(d.pb).toBe(90)
  })
})

describe('筒身网格理论校核（复刻强度设计与计算.xls）', () => {
  const d = deriveParams(defaultInput())
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
    expect(e.nSpiral).toBeCloseTo(14.247551987639529,10)
    expect(e.nHoop).toBeCloseTo(23.49516319968423,10)
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
    expect(layerThickness(g10, 70.128)).toBeGreaterThan(1.8)
    expect(layerThickness(g10, 70.128)).toBeLessThan(1.85)
  })
  it('样条首条件 t(r0) = nR·tp', () => expect(splineAt(g10, g10.r0)).toBeCloseTo(TC, 8))
  it('局部角 K(30.2) = 86.0416813°', () => {
    const u = Math.asin(g10.r0 / 30.2)
    expect((u * 180) / Math.PI).toBeCloseTo(DOME_10.K30_2, 5)
  })
  it('组厚度 J(30.2) = 0.668243610407（含循环数 2）', () => {
    expect(groupThickness(g10, 30.2)).toBeCloseTo(DOME_10.J30_2, 8)
  })
  it('组爆压 p_g(30.2) 为正（单一 cos²α 口径）', () => {
    expect(groupPressure(g10, 30.2, R, SIGC)).toBeGreaterThan(0)
  })
})

describe('循环数 I23 = 层数/2（★每组各自取值）', () => {
  it('10/17/25°×4 层 → 2；37/40/45°×2 层 → 1', () => {
    expect(groups.map((g) => [g.angle, g.cycles])).toEqual([
      [10, 2], [17, 2], [25, 2], [37, 1], [40, 1], [45, 1],
    ])
  })
  it('r < r0 时保留原表正样条厚度，爆压仍为 0', () => {
    const g45 = groups.find((g) => g.angle === 45)!
    expect(g45.r0).toBeCloseTo(R0_TABLE[45], 6)
    expect(groupThickness(g45, 122.6)).toBeCloseTo(0.2938443258936161,9)
    expect(groupPressure(g45, 122.6, R, SIGC)).toBe(0)
    expect(groupThickness(g45, 122.7)).toBeGreaterThan(0)
  })
})

describe('封头逐点复现 Excel（总厚度表，抽样 9 个格点）', () => {
  const at = (r: number) => domeAt(groups, r, R, SIGC, KS)

  it('总厚度 t总(r) 在全铺层覆盖区与单组起点与 Excel 一致（≤1e-3 mm）', () => {
    // 统一 cos²α 口径后，r < max(r0g) 的极孔侧不再取样条外插的虚假厚度（原 excel 分支已删），
    // 故只对账“所有角度都铺到”的区段（≥122.683）与只含 10° 组的起点 30.2
    for (const k of ['30.2', '128', '150', '173.5']) {
      expect(at(Number(k)).tTotal).toBeCloseTo(EXCEL_T[k], 3)
    }
  })
  it('t总(R) = 5.737058（封头→筒身螺旋层 5.50 的衔接处）', () => {
    expect(at(R).tTotal).toBeCloseTo(EXCEL_T['173.5'], 4)
  })
  it('局部角平方项修正后 p总(R) = 79.389865726788 MPa', () => {
    expect(at(R).pTotal).toBeCloseTo(79.38986572678792,9)
  })
  it('domeCheck 曲线端点、判定窗口与 t总(R)', () => {
    const res = domeCheck(groups, domeArgs())
    expect(res.profile[0].r).toBe(30.2)
    expect(res.profile[1].r).toBe(32)
    expect(res.profile).toHaveLength(144)
    expect(res.profile[res.profile.length - 1].r).toBe(R)
    expect(res.minPR).toBeGreaterThanOrEqual(122.683)
    expect(res.tAtR).toBeCloseTo(EXCEL_T['173.5'], 4)
    expect(res.groups.length).toBe(6)
  })
})

describe('缠绕顺序由用户决定（数组顺序=缠绕先后，核心不重排）', () => {
  it('buildDomeGroups / cylinderCheck 保留给定顺序，小角度放最后即最外层包覆', () => {
    const last = [{ angle: 45, layers: 2 }, { angle: 37, layers: 2 }, { angle: 12, layers: 2 }]
    const built = buildDomeGroups(last, R, BAND, TC)
    expect(built.groups.map((g) => g.angle)).toEqual([45, 37, 12])
    const d = deriveParams(defaultInput())
    const cy = cylinderCheck({ spiral: last, hoop: 3 }, {
      R, tf: d.tf, tc: d.tc, sigmaSpiral: d.sigmaSpiral, sigmaHoop: d.sigmaHoop, pb: d.pb, alphaRef: 20,
    })
    expect(cy.rows.map((r) => r.angle)).toEqual([45, 37, 12, 90])
    // 求和量与顺序无关：换序后 pα/pθ 不变
    const asc = cylinderCheck({ spiral: [...last].sort((a, b) => a.angle - b.angle), hoop: 3 }, {
      R, tf: d.tf, tc: d.tc, sigmaSpiral: d.sigmaSpiral, sigmaHoop: d.sigmaHoop, pb: d.pb, alphaRef: 20,
    })
    expect(cy.pa).toBeCloseTo(asc.pa, 12)
    expect(cy.pth).toBeCloseTo(asc.pth, 12)
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
  it('初始极孔对应约10°时，扩孔后选择20°或45°不要求与起始角相等', () => {
    expect(checkPoleConsistency(R, 30.13, 20, BAND).level).toBe('ok')
    expect(checkPoleConsistency(R, 30.13, 45, BAND).level).toBe('ok')
  })
  it('小于起始极孔角时只给出简短调整结论', () => {
    expect(checkPoleConsistency(R, 30.13, .1, BAND)).toMatchObject({ level: 'warn', text: '最小螺旋角过小，请增大角度。' })
  })
})

describe('汇总判定、薄弱区定位与对策（runCheck）', () => {
  const res = runCheck(defaultInput())

  it('筒身满足 pb=90：判定不为 fail', () => {
    expect(res.cylinder.paPass).toBe(true)
    expect(res.cylinder.pthPass).toBe(true)
    expect(res.verdict).not.toBe('fail')
  })
  it('完整原表范围包含极孔侧低值，不截断数据', () => {
    expect(res.dome.pass).toBe(false)
    expect(res.verdict).toBe('adjust')
    expect(res.dome.weakZones.length).toBeGreaterThan(0)
    expect(res.dome.minPR).toBe(30.2)
    expect(res.dome.minP).toBeCloseTo(.055914150152195294,9)
  })
  it('最低值来自完整原表数据列', () => {
    expect(res.dome.minPAll).toBe(res.dome.minP)
  })
  it('不使用自定的全铺层覆盖范围排除原表数据', () => {
    expect(res.dome.rFirst).toBeCloseTo(30.128, 2)
    expect(res.dome.rFull).toBeCloseTo(122.683, 2)
    expect(res.dome.rBoss).toBeCloseTo(30.127958825212414,9)
    expect(res.dome.minPR).toBe(30.2)
    expect(res.dome.minP).toBeCloseTo(.055914150152195294,9)
    expect(res.dome.minPAll).toBe(res.dome.minP)
  })
  it('环向层不参与封头校核', () => {
    expect(res.dome.groups.every((g) => g.angle < 90)).toBe(true)
  })
  it('课件封头初估使用筒身角与纤维量，独立于局部 K 和独立 σc', () => {
    expect(res.head.pressure).toBeCloseTo(76.57491090962243,9)
    const input=defaultInput()
    input.requirement.ks=1
    input.strength.sigmaCompositeDirect=1500
    const changed=runCheck(input)
    expect(changed.head.pressure).toBeCloseTo(res.cylinder.pa,9)
    expect(changed.head.pass).toBe(true)
    expect(changed.dome.pass).toBe(false)
    expect(changed.verdict).toBe('pass')
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
    const input = defaultInput()
    const res = runCheck(input)
    const swaps = suggestHoopSwap(input, { maxTransfer: 4, targetAngle: 45 })
    expect(swaps.length).toBe(2)
    expect(swaps[0].pAtR).toBeGreaterThan(domeAt(res.dome.groups, R, R, 2031, 0.75).pTotal)
    expect(swaps[0].pa).toBeGreaterThan(res.cylinder.pa)
    expect(swaps[0].pth).toBeLessThan(res.cylinder.pth)
  })
})
