/**
 * designer.ts — 自动铺层方案生成（规划 §7）
 *
 * 流程：初估 → 候选角"隔一取一"抽组 → 按轴向承载效率分配层数 → 可行性修复（补层）
 *       → 贪心删层（保留裕度目标）→ 封头反馈（环向 ⇄ 高角螺旋等厚置换）
 * 说明：严格 LP 的顶点解会退化成"最低角 + 90°"两角方案（因为 90° 单层环向效率最高），
 *       但封头需要多角度铺开（每组自己的极孔边缘是低载区，课件经验也是如此），
 *       故这里用"两约束顶点 + 经验角集铺开 + 贪心修正"的启发式，每步数值可追溯。
 * 约束：螺旋层 ±成对（forceEvenSpiral 时取偶数）；层数与组数均不设上限；不可行时明确报缺口。
 */
import type { DesignInput, LayupPlan } from './types'
import { deriveParams } from './materials'
import { cylinderCheck, hoopUnit, paUnit, pthUnit } from './netting'
import { buildDomeGroups, domeCheck } from './dome'
import { effectiveRBoss, runCheck } from './checker'
import { RAD } from './geodesic'

export type AutoResult =
  | { ok: true; plan: LayupPlan; trace: string[]; verdict: 'pass' | 'adjust' | 'fail' }
  | { ok: false; reason: string; trace: string[] }

/** 课件经验"隔一取一"：等差/给定序列上隔一个抽取（保证首尾都在） */
export function pickAlternate(angles: number[]): number[] {
  const a = [...angles].sort((x, y) => x - y)
  if (a.length <= 3) return a
  const out = a.filter((_v, i) => i % 2 === 0)
  if (out[out.length - 1] !== a[a.length - 1]) out.push(a[a.length - 1])
  return out
}

function cylArgsOf(input: DesignInput) {
  const d = deriveParams(input)
  return {
    d,
    a: {
      R: input.geometry.R,
      tf: d.tf,
      tc: d.tc,
      sigmaSpiral: d.sigmaSpiral,
      sigmaHoop: d.sigmaHoop,
      pb: d.pb,
      alphaRef: input.constraint.alphaRef,
    },
  }
}

function check(input: DesignInput, plan: LayupPlan) {
  const { d, a } = cylArgsOf(input)
  return cylinderCheck(plan, a).pa >= d.pb - 1e-9 && cylinderCheck(plan, a).pth >= d.pb - 1e-9
}

function bumpEven(n: number, force: boolean): number {
  if (n <= 0) return 0
  if (!force) return Math.round(n)
  return n % 2 === 0 ? Math.round(n) : Math.round(n) + 1
}

export function autoDesign(input: DesignInput): AutoResult {
  const trace: string[] = []
  const { d, a } = cylArgsOf(input)
  const { geometry, constraint } = input
  const R = geometry.R
  const pb = d.pb
  const force = constraint.forceEvenSpiral

  // ① 初估（复刻 Excel 左列）
  const est = cylinderCheck({ spiral: [], hoop: 0 }, a).estimate
  trace.push(
    `初估(αref=${est.alphaRef}°)：h螺=${est.hSpiral.toFixed(3)}→${est.nSpiral}层、h环=${est.hHoop.toFixed(3)}→${est.nHoop}层`,
  )

  // ② 角度组
  const angles =
    constraint.angleRule === 'alternate' ? pickAlternate(constraint.candidates) : [...constraint.candidates].sort((x, y) => x - y)
  if (!angles.length) return { ok: false, reason: '候选螺旋角集为空，无法生成方案', trace }
  trace.push(`角集(${constraint.angleRule === 'alternate' ? '隔一取一' : '全候选'})：${angles.join('/')}°`)

  // ③ 按轴向承载效率 cos²α 分配螺旋层（保证每组至少 2 层以铺开封头覆盖）
  const weights = angles.map((x) => Math.cos(x * RAD) ** 2 + 0.02)
  const wSum = weights.reduce((s, v) => s + v, 0)
  let spiral: LayupPlan['spiral'] = angles.map((angle, i) => ({
    angle,
    layers: Math.max(2, bumpEven((est.nSpiral * weights[i]) / wSum, force)),
  }))
  let hoop = Math.max(0, bumpEven(est.nHoop, false))
  let cur = { spiral, hoop }
  trace.push(`分配：${spiral.map((g) => `${g.angle}°×${g.layers}`).join(' ')} + 环向×${hoop}`)

  // ④ 可行性修复：哪个方向不足就补哪个方向最高效的组
  for (let iter = 0; iter < 4000; iter++) {
    const c = cylinderCheck(cur, a)
    const lackPa = c.pa < pb
    const lackPth = c.pth < pb
    if (!lackPa && !lackPth) break
    if (lackPa) {
      // 补轴向：选单位层轴向贡献最大且层数最少的组（兼顾铺开）
      const best = [...cur.spiral]
        .map((g) => ({ g, eff: paUnit(g.angle, d.tf, d.sigmaSpiral, R) }))
        .sort((x, y) => y.eff - x.eff || x.g.layers - y.g.layers)[0]
      const step = force ? 2 : 1
      if (cur.spiral.some((g) => g.angle === best.g.angle)) {
        cur = { ...cur, spiral: cur.spiral.map((g) => (g.angle === best.g.angle ? { ...g, layers: g.layers + step } : g)) }
      } else {
        cur = { ...cur, spiral: [...cur.spiral, { angle: best.g.angle, layers: step }] }
      }
      continue
    }
    // 补环向：环向层单位效率最高（kh ≥ ks·sin²α），但封头需要螺旋层，故先看是否还有高角螺旋可加
    const kh = hoopUnit(d.tf, d.sigmaHoop, R)
    const topAngle = Math.max(...cur.spiral.map((g) => g.angle))
    const kTop = pthUnit(topAngle, d.tf, d.sigmaSpiral, R)
    if (kTop > kh * 0.62 && cur.spiral.length < angles.length) {
      const missing = angles.filter((x) => !cur.spiral.some((g) => g.angle === x))
      const add = missing.sort((x, y) => y - x)[0]
      cur = { ...cur, spiral: [...cur.spiral, { angle: add, layers: force ? 2 : 1 }] }
    } else {
      cur = { ...cur, hoop: cur.hoop + 1 }
    }
  }
  if (!check(input, cur)) {
    const c = cylinderCheck(cur, a)
    return {
      ok: false,
      reason: `候选角集无法同时满足双向要求：pα=${c.pa.toFixed(2)}（差 ${(pb - c.pa).toFixed(2)}）、pθ=${c.pth.toFixed(2)}（差 ${(pb - c.pth).toFixed(2)}）`,
      trace,
    }
  }
  spiral = cur.spiral
  hoop = cur.hoop
  trace.push(`修复后：${spiral.map((g) => `${g.angle}°×${g.layers}`).join(' ')} + 环向×${hoop}`)

  // ⑤ 贪心删层：按"单位厚度贡献性价比"从最浪费的组逐层删，直到刚好达标
  let improved = true
  while (improved) {
    improved = false
    const cands: Array<{ plan: LayupPlan; score: number }> = []
    for (const g of spiral) {
      const step = force ? 2 : 1
      if (g.layers < (force ? 2 : 1)) continue
      const next: LayupPlan = {
        hoop,
        spiral: spiral.map((x) => (x.angle === g.angle ? { ...x, layers: x.layers - step } : x)).filter((x) => x.layers > 0),
      }
      if (check(input, next)) cands.push({ plan: next, score: paUnit(g.angle, d.tf, d.sigmaSpiral, R) + pthUnit(g.angle, d.tf, d.sigmaSpiral, R) })
    }
    if (hoop >= 1) {
      const next: LayupPlan = { hoop: hoop - 1, spiral }
      if (check(input, next)) cands.push({ plan: next, score: hoopUnit(d.tf, d.sigmaHoop, R) })
    }
    if (cands.length) {
      cands.sort((x, y) => x.score - y.score) // 先删性价比最差的（贡献最小者）
      const pick = cands[0].plan
      spiral = pick.spiral
      hoop = pick.hoop
      improved = true
    }
  }
  cur = { spiral, hoop }
  const c5 = cylinderCheck(cur, a)
  trace.push(
    `贪心删层：${spiral.map((g) => `${g.angle}°×${g.layers}`).join(' ')} + 环向×${hoop} → pα=${c5.pa.toFixed(2)} pθ=${c5.pth.toFixed(2)} 总厚=${c5.totalThickness.toFixed(3)}mm`,
  )

  // ⑥ 封头反馈：薄弱则把环向层等厚置换为高角螺旋层
  let final = cur
  const target = Math.max(...constraint.candidates)
  for (let round = 0; round < 8; round++) {
    const trial: DesignInput = { ...input, plan: final }
    const res = runCheck(trial)
    if (res.dome.pass) {
      trace.push(`封头校核通过：min=${res.dome.minP.toFixed(1)} MPa @ r≈${res.dome.minPR.toFixed(1)}（窗口 r≥${effectiveRBoss(trial).toFixed(1)}）`)
      break
    }
    if (res.advice.kind !== 'equator' || !res.advice.variants.length) {
      trace.push(`封头薄弱点为${res.advice.kind === 'pole-gap' ? '各组极孔边缘的固有低载区（置换无效，已如实报告）' : '不可通过置换解决'}：min=${res.dome.minP.toFixed(1)} MPa`)
      break
    }
    const best = res.advice.variants.reduce((x, y) => (y.minP > x.minP ? y : x))
    if (best.minP <= res.dome.minP + 1e-6) {
      trace.push(`封头反馈停止：置换已到极限，min=${res.dome.minP.toFixed(1)} MPa < pb=${pb.toFixed(1)}`)
      break
    }
    const hit = final.spiral.find((g) => Math.abs(g.angle - target) < 1e-9)
    final = {
      hoop: final.hoop - best.transfer,
      spiral: hit
        ? final.spiral.map((g) => (g.angle === target ? { ...g, layers: g.layers + best.transfer } : g))
        : [...final.spiral, { angle: target, layers: best.transfer }],
    }
    trace.push(`封头反馈第${round + 1}轮：环向 −${best.transfer} ⇄ ${target}° +${best.transfer} → 预计 min ${best.minP.toFixed(1)}`)
  }

  const verdict = runCheck({ ...input, plan: final }).verdict
  return { ok: true, plan: final, trace, verdict }
}

/** 供测试/界面复用：给定方案的双向爆压 */
export function planPressures(input: DesignInput, plan: LayupPlan) {
  const { d, a } = cylArgsOf(input)
  const c = cylinderCheck(plan, a)
  const { groups } = buildDomeGroups(plan.spiral, input.geometry.R, d.bandTotal, d.tc)
  const dome = domeCheck(groups, {
    R: input.geometry.R,
    bandTotal: d.bandTotal,
    tc: d.tc,
    sigmaComposite: d.sigmaComposite,
    ks: input.requirement.ks,
    refMode: input.refMode,
    rBoss: effectiveRBoss(input),
    pb: d.pb,
  })
  return { pa: c.pa, pth: c.pth, totalThickness: c.totalThickness, domeMin: dome.minP, domeMinR: dome.minPR, requirement: requirementOf(input) }
}

function requirementOf(input: DesignInput) {
  return deriveParams(input).pb
}
