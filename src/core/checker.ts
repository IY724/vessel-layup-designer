/** 筒身原表计算、课件封头经验初估与完整局部参考曲线。 */
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
import { activeGroups, hoopGroups, spiralGroups, transferHoop } from './layup'

/** 原表半径列起点；不采用自定的强度检查截断区。 */
export function effectiveRBoss(input: DesignInput): number {
  const r0s = spiralGroups(input.plan)
    .filter((g) => g.active !== false && g.layers > 0 && g.angle < 90)
    .map((g) => poleRadius(input.geometry.R, g.angle))
  // 原表完整半径列参与汇总，不另设软件自定的强度判定截断区。
  return r0s.length ? Math.min(...r0s) : 0
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
  head: CheckResult['head']
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

  const { groups, failed } = buildDomeGroups(spiralGroups(plan), R, derived.bandTotal, derived.tc)
  const rBoss = effectiveRBoss(input)
  const dome = domeCheck(
    groups,
    {
      R,
      bandTotal: derived.bandTotal,
      tc: derived.tc,
      sigmaComposite: derived.sigmaComposite,
      ks: requirement.ks,
      rBoss,
      pb: derived.pb,
    },
    failed,
  )
  // 课件第六课第 2 页：h_fα 为纯纤维厚度，α₀ 为筒身角。
  // 多组逐项求和与筒身纵向贡献相同，仅再乘 ks；不用局部 K 或独立 σc。
  const pressure = requirement.ks * cylinder.rows.filter(g => g.type === 'spiral').reduce((s, g) => s + g.paSum, 0)
  const head = { pressure, pass: pressure >= derived.pb }
  return { derived, cylinder, dome, head, rBoss }
}

export function runCheck(input: DesignInput): CheckResult {
  const { derived, cylinder, dome, head } = evaluatePlan(input)
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
  }

  const weight = weightEstimate(
    input,
    cylinder.totalThickness,
    dome.profile.map((p) => ({ r: p.r, t: p.tTotal })),
  )

  // ---- 诊断 ----
  const angles = spiralGroups(plan).filter((g) => g.active !== false && g.layers > 0 && g.angle > 0 && g.angle < 90).map((g) => g.angle)
  for (const g of activeGroups(plan)) {
    if (!Number.isFinite(g.angle) || g.angle < 0 || g.angle > 90 || (g.type === 'spiral' && (g.angle <= 0 || g.angle >= 90))) {
      diagnoses.push({ level: 'error', text: `${g.type === 'spiral' ? '螺旋' : '环向'}角度 ${g.angle}° 无效：螺旋应在0°与90°之间，环向可取0°至90°。` })
    }
  }
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
  if (!head.pass) {
    diagnoses.push({
      level: 'warn',
      text: `封头经验初估 ${head.pressure.toFixed(2)} MPa，低于设计值 ${derived.pb.toFixed(2)} MPa。`,
    })
  }
  for (const f of dome.failedGroups) {
    if (f.angle >= 90) continue
    diagnoses.push({ level: 'error', text: f.reason })
  }

  const verdict: CheckResult['verdict'] = diagnoses.some(d => d.level === 'error') || !cylinder.paPass || !cylinder.pthPass
    ? 'fail'
    : head.pass
      ? 'pass'
      : 'adjust'

  const advice = buildAdvice(input, head)

  return { derived, cylinder, dome, head, consistency, weight, verdict, diagnoses, advice }
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
      ...spiralGroups(input.plan).filter(g => g.active !== false).map((g) => g.angle),
    )
  for (let k = 2; k <= maxT; k += 2) {
    if (hoopGroups(input.plan).reduce((s, g) => s + g.layers, 0) < k || !(target > 0 && target < 90)) break
    const variant: DesignInput = { ...input, plan: transferHoop(input.plan, k, target) }
    const res = evaluatePlan(variant)
    const last = res.dome.profile[res.dome.profile.length - 1]
    out.push({
      transfer: k,
      minP: res.dome.minP,
      minPR: res.dome.minPR,
      pAtR: last ? last.pTotal : 0,
      headPressure: res.head.pressure,
      pa: res.cylinder.pa,
      pth: res.cylinder.pth,
      totalThickness: res.cylinder.totalThickness,
    })
  }
  return out
}

/** 按课件经验初估试算；建议必须保留筒身双向要求。 */
function buildAdvice(input: DesignInput, head: CheckResult['head']): Advice {
  if (head.pass) return { kind: 'none', text: '封头经验初估满足设计值。', variants: [] }
  const pb = deriveParams(input).pb
  const variants = suggestHoopSwap(input, { maxTransfer: 8 }).filter(v => v.pa >= pb && v.pth >= pb)
  const best = variants.reduce<SwapVariant | null>(
    (acc, v) => (!acc || v.headPressure > acc.headPressure ? v : acc),
    null,
  )
  return {
    kind: 'equator',
    text: best
      ? `等厚置换 ${best.transfer} 层：封头经验初估 ${head.pressure.toFixed(1)} → ${best.headPressure.toFixed(1)} MPa。`
      : '现有环向层无可行的等厚置换方案，需调整螺旋铺层。',
    variants,
  }
}

/** 供 UI 复用的空方案工具 */
export function planFromGroups(spiral: Array<{ angle: number; layers: number }>, hoop: number): LayupPlan {
  return { spiral: spiral.map((g) => ({ ...g })), hoop }
}

export type { DomeGroup }
