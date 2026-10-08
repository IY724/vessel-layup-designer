/**
 * netting.ts — 网格理论筒身铺层设计与校核（等厚假设）
 *
 * 复刻 强度设计与计算.xls 的公式（已逐格核对）：
 *   单层纵向贡献  pαi  = 2·tf·σ·cos²α / R
 *   单层环向贡献  pθi  = tf·σ·sin²α / R
 *   环向层(90°)   pθ90 = tf·σ / R          （纵向贡献 0）
 *   pα = Σ n_i·pαi ≥ pb                   pθ = Σ n_i·pθi + n90·pθ90 ≥ pb
 *   初估：h螺 = R·pb/(2σ·cos²αref)        h环 = (2−tan²αref)·R·pb/(2σ)
 *         n螺 = ⌈h螺/tf⌉                 n环 = ⌈h环/tf⌉
 *   厚度按复材单层厚 tc 计：t = Σn·tc
 *
 * 强度取值口径：螺旋层（含其环向贡献）用 σ_spiral，环向层用 σ_hoop。
 * 模式 A 下两者相等（Excel 即此情形）；模式 B 允许分别给定（如 70MPa 案例 3859/4342）。
 */
import type { CylinderResult, CylinderRow, LayupPlan } from './types'
import { RAD } from './geodesic'

export function paUnit(angleDeg: number, tf: number, sigma: number, R: number): number {
  const c = Math.cos(angleDeg * RAD)
  return (2 * tf * sigma * c * c) / R
}

export function pthUnit(angleDeg: number, tf: number, sigma: number, R: number): number {
  const s = Math.sin(angleDeg * RAD)
  return (tf * sigma * s * s) / R
}

export function hoopUnit(tf: number, sigma: number, R: number): number {
  return (tf * sigma) / R
}

/** 单层能承受的轴向/环向爆压比平衡所需的参考角初估（Excel 左列逻辑） */
export function initialEstimate(
  R: number,
  pb: number,
  sigma: number,
  tf: number,
  alphaRefDeg: number,
  tc?: number,
) {
  const a = alphaRefDeg * RAD
  const cos = Math.cos(a)
  const tan = Math.tan(a)
  const hSpiral = (R * pb) / (2 * sigma * cos * cos)
  const hHoop = ((2 - tan * tan) * R * pb) / (2 * sigma)
  const hTotal = hSpiral + hHoop
  return {
    alphaRef: alphaRefDeg,
    cosRef: cos,
    tanRef: tan,
    hSpiral,
    hHoop,
    nSpiral: Math.ceil(hSpiral / tf),
    nHoop: Math.ceil(hHoop / tf),
    hTotal,
    /** Excel B33：估算复材总厚度 = 估算纤维总厚度 / Vf */
    tComposite: tc !== undefined ? (hTotal * tc) / tf : hTotal,
  }
}

export interface CylinderArgs {
  R: number
  tf: number
  tc: number
  sigmaSpiral: number
  sigmaHoop: number
  pb: number
  alphaRef: number
}

export function cylinderCheck(plan: LayupPlan, a: CylinderArgs): CylinderResult {
  const rows: CylinderRow[] = []
  // 数组顺序 = 用户给定的缠绕先后顺序，不在此处重排（求和量与顺序无关，但图面与工艺真实性相关）
  const spiral = plan.spiral.filter((g) => g.layers > 0 && g.angle > 0 && g.angle < 90)

  let pa = 0
  let pth = 0
  let spiralLayers = 0

  for (const g of spiral) {
    const u = paUnit(g.angle, a.tf, a.sigmaSpiral, a.R)
    const v = pthUnit(g.angle, a.tf, a.sigmaSpiral, a.R)
    pa += u * g.layers
    pth += v * g.layers
    spiralLayers += g.layers
    rows.push({
      angle: g.angle,
      type: 'spiral',
      layers: g.layers,
      paUnit: u,
      pthUnit: v,
      paSum: u * g.layers,
      pthSum: v * g.layers,
      thickness: g.layers * a.tc,
    })
  }

  const hoopLayers = Math.max(0, plan.hoop)
  if (hoopLayers > 0) {
    const v = hoopUnit(a.tf, a.sigmaHoop, a.R)
    pth += v * hoopLayers
    rows.push({
      angle: 90,
      type: 'hoop',
      layers: hoopLayers,
      paUnit: 0,
      pthUnit: v,
      paSum: 0,
      pthSum: v * hoopLayers,
      thickness: hoopLayers * a.tc,
    })
  }

  const hoopThickness = hoopLayers * a.tc
  const spiralThickness = spiralLayers * a.tc

  return {
    rows,
    pa,
    pth,
    spiralLayers,
    hoopLayers,
    spiralThickness,
    hoopThickness,
    totalThickness: spiralThickness + hoopThickness,
    paPass: pa >= a.pb,
    pthPass: pth >= a.pb,
    paMargin: a.pb > 0 ? pa / a.pb - 1 : Infinity,
    pthMargin: a.pb > 0 ? pth / a.pb - 1 : Infinity,
    estimate: initialEstimate(a.R, a.pb, a.sigmaSpiral, a.tf, a.alphaRef, a.tc),
  }
}
