/**
 * checker.ts — 汇总校核：筒身 + 封头 + 一致性检查 + 薄弱区诊断 + 调整建议
 *
 * 判定口径（重要，界面必须如实标注）：
 *   筒身：pα ≥ pb 且 pθ ≥ pb（网格理论等厚，与长度无关）
 *   封头：min{ ks·Σp_g(r) | r ∈ [r_boss, R] } ≥ pb
 *     r_boss 以下视为金属接嘴/瓶口补强区，复材不承担全部压强（默认自动取最低角度组 r0 + 1 倍总带宽，可改）
 *     r → R 处封头公式与筒身公式重合，筒身判定不乘 ks（口径更合理），故封头曲线末端的低值以"×ks 偏保守"标注
 */
import type {
  Advice,
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

export function effectiveRBoss(input: DesignInput): number {
  const { geometry, constraint, plan } = input
  if (!constraint.rBossAuto) return constraint.rBoss
  const angles = plan.spiral.filter((g) => g.layers > 0).map((g) => g.angle)
  const aMin = angles.length ? Math.min(...angles) : 10
  return poleRadius(geometry.R, aMin) + totalBand(input)
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

export function runCheck(input: DesignInput): CheckResult {
  const derived = deriveParams(input)
  const { geometry, requirement, constraint, plan } = input
  const R = geometry.R
  const diagnoses: Diagnosis[] = []

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
      text: `筒身纵向爆压不足：pα=${cylinder.pa.toFixed(2)} < pb=${derived.pb.toFixed(2)}，缺口 ${(derived.pb - cylinder.pa).toFixed(2)} MPa`,
    })
  }
  if (!cylinder.pthPass) {
    diagnoses.push({
      level: 'error',
      text: `筒身环向爆压不足：pθ=${cylinder.pth.toFixed(2)} < pb=${derived.pb.toFixed(2)}，缺口 ${(derived.pb - cylinder.pth).toFixed(2)} MPa`,
    })
  }
  if (!dome.pass) {
    const wz = dome.weakZones[0]
    diagnoses.push({
      level: 'warn',
      text:
        `封头存在薄弱区：判定窗口 [${rBoss.toFixed(1)}, R] 内 min ks·Σp=${dome.minP.toFixed(1)} MPa` +
        ` @ r=${dome.minPR.toFixed(1)} < pb=${derived.pb.toFixed(1)}` +
        (wz ? `（低载区 r≈${wz.from.toFixed(1)}~${wz.to.toFixed(1)}）` : ''),
    })
  }
  if (!consistency.ok) {
    diagnoses.push({
      level: 'warn',
      text: `一致性检查：封头赤道处 t总(R)=${domeSpiralAtR.toFixed(3)} mm 与筒身螺旋层厚 ${cylinderSpiral.toFixed(3)} mm 偏差 ${diff >= 0 ? '+' : ''}${diff.toFixed(3)} mm（>8%），铺层在封头/筒身衔接处可能不连续`,
    })
  }
  for (const f of failed) {
    if (f.angle >= 90) continue
    diagnoses.push({ level: 'error', text: f.reason })
  }
  if (input.refMode === 'excel') {
    diagnoses.push({
      level: 'warn',
      text: '当前为「Excel 原样复算」口径：封头爆压使用原表 L 列笔误式 cos(u·cos u)，中段虚高（最大 +86 MPa），仅用于对账，不可作为设计依据',
    })
  }
  if (dome.minPAll < dome.minP && dome.minPAll < derived.pb) {
    diagnoses.push({
      level: 'ok',
      text: `r<r_boss(${rBoss.toFixed(1)} mm) 区间最小值 ${dome.minPAll.toFixed(1)} MPa 不计入判定：该处为金属接嘴/瓶口补强区`,
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
    const res = runCheck(variant)
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
  const r0s = dome.groups.map((g) => g.r0).sort((a, b) => a - b)
  const nearPole = r0s.length > 0 && dome.minPR < r0s[0] + 1.5 * band
  const nearEquator = dome.minPR > input.geometry.R - 1.5 * band
  const last = dome.profile[dome.profile.length - 1]
  if (nearPole && !nearEquator) {
    return {
      kind: 'pole-gap',
      text:
        `薄弱点在 r≈${dome.minPR.toFixed(1)}（最低角度组极孔 r0=${r0s[0].toFixed(1)} 正上方）：` +
        '该处各组局部缠绕角趋于 90°，螺旋层的纵向承载按 cos²α 归零，属结构固有低载区，' +
        '由金属接嘴/瓶口补强承担。置换环向层对此无效；' +
        `如需抬高此点只能提高判定窗口下界 r_boss（当前 ${rBoss.toFixed(1)}）或降低 ks 保守度。` +
        `（近赤道 r=R 处 ${(last?.pTotal ?? 0).toFixed(1)} MPa）`,
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
      `薄弱点在 r≈${dome.minPR.toFixed(1)}（近赤道侧）：环向层上不了封头，` +
      (best
        ? `建议 环向 −${best.transfer} 层 ⇄ ${Math.max(...input.constraint.candidates)}° 螺旋 +${best.transfer} 层（等厚度），` +
          `预计 min ${dome.minP.toFixed(1)} → ${best.minP.toFixed(1)} MPa，r=R 处 ${(last?.pTotal ?? 0).toFixed(1)} → ${best.pAtR.toFixed(1)} MPa`
        : '无可置换的环向层，需增加高角螺旋层'),
    variants,
  }
}

/** 供 UI 复用的空方案工具 */
export function planFromGroups(spiral: Array<{ angle: number; layers: number }>, hoop: number): LayupPlan {
  return { spiral: spiral.map((g) => ({ ...g })), hoop }
}

export type { DomeGroup }
