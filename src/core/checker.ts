/**
 * checker.ts — 汇总校核：筒身 + 封头 + 一致性检查 + 薄弱区诊断 + 调整建议
 *
 * 判定口径（重要，界面必须如实标注）：
 *   筒身：pα ≥ pb 且 pθ ≥ pb（网格理论等厚，与长度无关）
 *   封头：min{ ks·Σp_g(r) | r ∈ [r_boss, R] } ≥ pb
 *     判定窗口 [r_boss, R]，r_boss 默认 = 全铺层覆盖起点 max(r0g)（只用铺层自身的量）；
 *     窗口之外的极孔侧区段 [min(r0g), r_boss) 仅部分角度组覆盖、局部角趋于 90°，
 *     按 cos²α 判据必然趋于 0，故只画出来、报出数值，不作为通过/不通过的判据。
 *     r → R 处封头公式与筒身公式重合，筒身判定不乘 ks（口径更合理），故封头曲线末端的低值以"×ks 偏保守"标注
 */
import type {
  Advice,
  CylinderResult,
  DerivedParams,
  CheckResult,
  DesignInput,
  Diagnosis,
  DomeGroup,
  DomeResult,
  LayupPlan,
  SwapVariant,
} from './types'
import { deriveParams } from './materials'
import { cylinderCheck } from './netting'
import { buildDomeGroups, domeCheck } from './dome'
import { checkPoleConsistency, poleRadius } from './geodesic'

/**
 * 判定窗口下界 r_boss。
 * auto = 全铺层覆盖起点 max(r0g)：所有螺旋角组都已铺到的最小平行圆，
 * 只用铺层自身的量，不引入接头/阀座半径。
 * 不用 min(r0g)（复合层最小平行圆）是因为那里 cos²α→0，判据必然退化为 0。
 */
export function effectiveRBoss(input: DesignInput): number {
  const { constraint, plan } = input
  if (!constraint.rBossAuto) return constraint.rBoss
  const r0s = plan.spiral.filter((g) => g.layers > 0).map((g) => poleRadius(input.geometry.R, g.angle))
  return r0s.length ? Math.max(...r0s) : 0
}

function totalBand(input: DesignInput): number {
  return input.material.strandCount * input.material.bandWidth
}

/** 封头→筒身 椭圆子午线（仅用于重量参考值与轮廓绘制；短半轴取记录值） */
export function meridianZ(r: number, R: number, h: number): number {
  const x = Math.max(0, Math.min(1, 1 - (r / R) ** 2))
  return h * Math.sqrt(x)
}

function weightEstimate(input: DesignInput, totalThk: number, domeT: Array<{ r: number; t: number }>) {
  const { geometry, material } = input
  const rhoComposite = material.fiberDensity * material.vf + material.resinDensity * (1 - material.vf)
  const cylVolMm3 = 2 * Math.PI * geometry.R * geometry.cylLength * totalThk
  const cylKg = (cylVolMm3 * rhoComposite) / 1e6
  // 单个封头：∫ 2πr·t(r) ds，ds = √(1+(dz/dr)²)dr，椭圆子午线
  const h = geometry.headShortAxis || geometry.R
  let domeVol = 0
  for (let i = 1; i < domeT.length; i++) {
    const r0p = domeT[i - 1].r
    const r1p = domeT[i].r
    const dr = r1p - r0p
    if (dr <= 0) continue
    const rm = (r0p + r1p) / 2
    const tm = (domeT[i - 1].t + domeT[i].t) / 2
    const s = Math.max(1e-6, 1 - (rm / geometry.R) ** 2)
    const dzdr = (h * rm) / (geometry.R ** 2 * Math.sqrt(s))
    const ds = Math.sqrt(1 + dzdr * dzdr) * dr
    domeVol += 2 * Math.PI * rm * tm * ds
  }
  const headKg = (domeVol * rhoComposite) / 1e6
  return { cylinderKg: cylKg, domeKg: headKg, totalKg: cylKg + 2 * headKg, rhoComposite }
}

/**
 * 单个方案的纯计算（派生参数 + 筒身 + 封头），不含诊断与建议。
 * 试算变体（suggestHoopSwap / designer 反馈）只用它 —— 否则会与建议生成互相递归。
 */
export interface PlanEvaluation {
  derived: DerivedParams
  cylinder: CylinderResult
  dome: DomeResult
  rBoss: number
}

export function evaluatePlan(input: DesignInput): PlanEvaluation {
  const derived = deriveParams(input)
  const { geometry, requirement, constraint, plan } = input
  const R = geometry.R

  const cylinder = cylinderCheck(plan, {
    R,
    tf: derived.tf,
    tc: derived.tc,
    sigmaSpiral: derived.sigmaSpiral,
    sigmaHoop: derived.sigmaHoop,
    pb: derived.pb,
    alphaRef: constraint.alphaRef,
  })

  const { groups, failed } = buildDomeGroups(plan.spiral, R, derived.bandTotal, derived.tc)
  const rBoss = effectiveRBoss(input)
  const dome = domeCheck(
    groups,
    {
      R,
      bandTotal: derived.bandTotal,
      tc: derived.tc,
      sigmaComposite: derived.sigmaComposite,
      ks: requirement.ks,
      refMode: input.refMode,
      rBoss,
      pb: derived.pb,
    },
    failed,
  )
  return { derived, cylinder, dome, rBoss }
}

export function runCheck(input: DesignInput): CheckResult {
  const { derived, cylinder, dome, rBoss } = evaluatePlan(input)
  const { geometry, plan } = input
  const R = geometry.R
  const diagnoses: Diagnosis[] = []

  const cylinderSpiral = cylinder.spiralThickness
  const domeSpiralAtR = dome.tAtR
  const diff = domeSpiralAtR - cylinderSpiral
  const consistency = {
    domeSpiralAtR,
    cylinderSpiral,
    diff,
    ok: cylinderSpiral > 0 ? Math.abs(diff) / cylinderSpiral < 0.08 : true,
  }

  const weight = weightEstimate(
    input,
    cylinder.totalThickness,
    dome.profile.map((p) => ({ r: p.r, t: p.tTotal })),
  )

  // ---- 诊断 ----
  const angles = plan.spiral.filter((g) => g.layers > 0).map((g) => g.angle)
  if (angles.length) {
    const chk = checkPoleConsistency(R, derived.r0, Math.min(...angles), derived.bandTotal)
    diagnoses.push({ level: chk.level, text: chk.text })
  } else {
    diagnoses.push({ level: 'error', text: '未设置任何螺旋角度组，封头无法校核' })
  }
  if (!cylinder.paPass) {
    diagnoses.push({
      level: 'error',
      text: `筒身纵向爆压不足：算得 ${cylinder.pa.toFixed(2)} MPa < 目标 ${derived.pb.toFixed(2)} MPa，缺口 ${(derived.pb - cylinder.pa).toFixed(2)} MPa`,
    })
  }
  if (!cylinder.pthPass) {
    diagnoses.push({
      level: 'error',
      text: `筒身环向爆压不足：算得 ${cylinder.pth.toFixed(2)} MPa < 目标 ${derived.pb.toFixed(2)} MPa，缺口 ${(derived.pb - cylinder.pth).toFixed(2)} MPa`,
    })
  }
  if (!dome.pass) {
    const wz = dome.weakZones[0]
    diagnoses.push({
      level: 'warn',
      text:
        `封头存在薄弱处：判定范围 r ∈ [${rBoss.toFixed(1)}, ${R.toFixed(1)}] mm 内最低爆压 ${dome.minP.toFixed(1)} MPa` +
        ` @ r=${dome.minPR.toFixed(1)}，低于目标 ${derived.pb.toFixed(1)} MPa` +
        (wz ? `（低载区 r≈${wz.from.toFixed(1)}~${wz.to.toFixed(1)} mm）` : ''),
    })
  }
  if (!consistency.ok) {
    diagnoses.push({
      level: 'warn',
      text: `封头与筒身衔接检查：封头赤道处总厚 ${domeSpiralAtR.toFixed(3)} mm 与筒身螺旋层厚 ${cylinderSpiral.toFixed(3)} mm 偏差 ${diff >= 0 ? '+' : ''}${diff.toFixed(3)} mm（>8%），铺层在封头/筒身衔接处可能不连续`,
    })
  }
  for (const f of dome.failedGroups) {
    if (f.angle >= 90) continue
    diagnoses.push({ level: 'error', text: f.reason })
  }
  if (input.refMode === 'excel') {
    diagnoses.push({
      level: 'warn',
      text: '当前用的是参考表原算法：封头公式少一个右括号（cos(u·cos u)），中段爆压会系统性虚高（最大 +86 MPa），只能用于逐格对账，不能作为设计依据',
    })
  }
  if (dome.minPAll < dome.minP && dome.minPAll < derived.pb) {
    diagnoses.push({
      level: 'ok',
      text: `极孔侧参考值：r ∈ [${dome.rFirst.toFixed(1)}, ${rBoss.toFixed(1)}) 只有一部分角度组铺得到，` +
        `局部缠绕角趋于 90°，按 cos²α 计算必然趋于 0，属算法在此处失效而非真实薄弱截面，故不计入判定`,
    })
  }

  const verdict: CheckResult['verdict'] = !cylinder.paPass || !cylinder.pthPass
    ? 'fail'
    : dome.pass
      ? 'pass'
      : 'adjust'

  const advice = buildAdvice(input, dome, rBoss)

  return { derived, cylinder, dome, consistency, weight, verdict, diagnoses, advice }
}

/**
 * 调整建议：把 k 层环向层等厚度置换为最高角螺旋层（环向层上不了封头）。
 * 只做"试算"，不改用户方案；界面按结果给出"环向 −k 层 ⇄ 高角螺旋 +k 层，预计 min→x"。
 */
export function suggestHoopSwap(
  input: DesignInput,
  opts: { maxTransfer?: number; targetAngle?: number } = {},
): SwapVariant[] {
  const maxT = opts.maxTransfer ?? 8
  const out: SwapVariant[] = []
  const target =
    opts.targetAngle ??
    Math.max(
      ...input.constraint.candidates,
      ...(input.plan.spiral.length ? input.plan.spiral.map((g) => g.angle) : [0]),
    )
  for (let k = 2; k <= maxT; k += 2) {
    if (input.plan.hoop < k) break
    const spiral = input.plan.spiral.map((g) => ({ ...g }))
    const hit = spiral.find((g) => Math.abs(g.angle - target) < 1e-9)
    if (hit) hit.layers += k
    else spiral.push({ angle: target, layers: k })
    const variant: DesignInput = { ...input, plan: { spiral, hoop: input.plan.hoop - k } }
    const res = evaluatePlan(variant)
    const last = res.dome.profile[res.dome.profile.length - 1]
    out.push({
      transfer: k,
      minP: res.dome.minP,
      minPR: res.dome.minPR,
      pAtR: last ? last.pTotal : 0,
      pa: res.cylinder.pa,
      pth: res.cylinder.pth,
      totalThickness: res.cylinder.totalThickness,
    })
  }
  return out
}

/**
 * 薄弱区定位与对策建议。
 * 修正口径（cos²α）下，每组在自己极孔边缘 α_local→90°，纵向承载趋零，
 * 曲线会在每个 r0g 正上方出现一个"承载空档谷"——这与 Excel 笔误口径的形态完全不同，
 * 因此必须区分两类薄弱点，给出不同对策。
 */
function buildAdvice(input: DesignInput, dome: DomeResult, rBoss: number): Advice {
  if (dome.pass) return { kind: 'none', text: '封头有效区最小爆压满足设计要求', variants: [] }
  const band = totalBand(input)
  const nearPole = dome.minPR < dome.rFull - 1e-9
  const nearEquator = dome.minPR > input.geometry.R - 1.5 * band
  const last = dome.profile[dome.profile.length - 1]
  if (nearPole && !nearEquator) {
    return {
      kind: 'pole-gap',
      text:
        `薄弱点在 r≈${dome.minPR.toFixed(1)}，比"所有角度都铺到"的最小平行圆 r≈${dome.rFull.toFixed(1)} 更靠近极孔：` +
        '该区段只有一部分角度组铺得到，且各组局部缠绕角趋于 90°，纵向承载按 cos²α 趋于零，属算法在此处的失效。' +
        `把判定范围下界改为自动取值（当前 ${rBoss.toFixed(1)} mm）后，薄弱点会落到可设计的截面区间。`,
      variants: [],
    }
  }
  const variants = suggestHoopSwap(input, { maxTransfer: 8 })
  const best = variants.reduce<SwapVariant | null>(
    (acc, v) => (!acc || v.minP > acc.minP ? v : acc),
    null,
  )
  return {
    kind: 'equator',
    text:
      `薄弱点在 r≈${dome.minPR.toFixed(1)}（靠赤道一侧）：环向层铺不进封头，` +
      (best
        ? `建议把 ${best.transfer} 层环向换成 ${Math.max(...input.constraint.candidates)}° 螺旋层（厚度不变），` +
          `预计封头最低值 ${dome.minP.toFixed(1)} → ${best.minP.toFixed(1)} MPa，赤道处 ${(last?.pTotal ?? 0).toFixed(1)} → ${best.pAtR.toFixed(1)} MPa`
        : '没有可置换的环向层，需直接增加高角度螺旋层'),
    variants,
  }
}

/** 供 UI 复用的空方案工具 */
export function planFromGroups(spiral: Array<{ angle: number; layers: number }>, hoop: number): LayupPlan {
  return { spiral: spiral.map((g) => ({ ...g })), hoop }
}

export type { DomeGroup }
