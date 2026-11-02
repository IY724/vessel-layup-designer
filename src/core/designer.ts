/** 单角度筒身初估 → 扩孔选角 → 分配铺层组 → 三次样条厚度及爆压贡献校核。 */
import type { DesignInput, LayupPlan } from './types'
import { deriveParams } from './materials'
import { runCheck } from './checker'
import { defaultAngles } from './expansion'
import { interleavePlan } from './layup'
import { paUnit } from './netting'
import { expandedLayerCounts } from './initialDesign'

export type AutoResult =
  | { ok: true; plan: LayupPlan; trace: string[]; verdict: 'pass' | 'adjust' | 'fail' }
  | { ok: false; reason: string; trace: string[] }

export const pickAlternate = defaultAngles

export function autoDesign(input: DesignInput): AutoResult {
  const trace: string[] = []
  const d = deriveParams(input), c = input.constraint
  if (![input.geometry.R, d.pb, d.tf, d.tc, d.bandTotal, d.sigmaSpiral, d.sigmaHoop, d.sigmaComposite].every(v => Number.isFinite(v) && v > 0)
    || !(d.r0 > 0 && d.r0 < input.geometry.R)) {
    return { ok: false, reason: '请检查几何、材料、强度和设计爆压。', trace }
  }
  if (!(c.alphaRef > 0 && c.alphaRef < 54.7356)) {
    return { ok: false, reason: '初估计算角度应大于0°且小于54.7356°。', trace }
  }
  const selected = [...new Set(c.angleRule === 'alternate' ? pickAlternate(c.candidates) : c.candidates)].sort((a, b) => a - b)
  if (!selected.length) return { ok: false, reason: '候选螺旋角集为空，无法生成方案', trace }
  if (selected.some(a => !Number.isFinite(a) || a <= 0 || a >= 90)) {
    return { ok: false, reason: '螺旋候选角必须大于0°且小于90°；90°为环向边界', trace }
  }
  // 用户取整要求：写入实际角度并以该角度计算，不能只改显示。
  const angles = selected.map(Math.round)
  if (angles.some(a => a <= 0 || a >= 90)) {
    return { ok: false, reason: '所选角度四舍五入后为0°或90°，不能作为螺旋角，请重新选角。', trace }
  }
  const allocation = expandedLayerCounts(input, angles.length)
  const { initial } = allocation
  if (!initial.pass) return { ok: false, reason: '请先完成筒身层数计算并满足双向爆压要求。', trace }
  trace.push(`极孔反算${initial.startAngle.toFixed(3)}°；初估采用${c.alphaRef}°。`)
  trace.push(`公式初估：螺旋${initial.estimate.nSpiral.toFixed(4)}层、环向${initial.estimate.nHoop.toFixed(4)}层；取用${initial.spiral}/${initial.hoop}层。`)
  trace.push(`扩孔选取${angles.length}组；实际填入角度按整度四舍五入：${angles.join('/')}°。`)
  if (allocation.added) trace.push(`${angles.length}个螺旋组每组至少2层，分配为${allocation.spiral}层。`)
  // 均分是可手改的默认排法；课件没有给出自动权重或最优层数算法。
  // 初估按 αref（小角）定总层数，均分到更大的实际角度后 cos²α 变小，纵向可能欠强；
  // 此时向单层纵向贡献最大的角度组补±成对的层，不改变角度选择、环向层数与行序。
  const layers = [...allocation.layers]
  const perLayer = angles.map(a => paUnit(a, d.tf, d.sigmaSpiral, input.geometry.R))
  let topUp = 0
  while (perLayer.reduce((s, v, i) => s + v * layers[i], 0) < d.pb) {
    const best = perLayer.reduce((bi, v, i) => (v > perLayer[bi] ? i : bi), 0)
    if (!(perLayer[best] > 0)) return { ok: false, reason: '候选螺旋角无法提供纵向承载，无法自动补层', trace }
    layers[best] += 2
    topUp += 2
  }
  if (topUp) trace.push(`均分后筒身纵向不足，向单位纵向贡献最大的角度组补${topUp}层（±成对）。`)
  const plan = interleavePlan(angles.map((angle, i) => ({ angle, layers: layers[i] })), initial.hoop)
  const result = runCheck({ ...input, plan })
  if (result.dome.failedGroups.length) {
    return { ok: false, reason: `封头厚度计算失败：${result.dome.failedGroups.map(g => `${g.angle.toFixed(3)}° ${g.reason}`).join('；')}`, trace }
  }
  trace.push(`按铺层组交替：螺旋${allocation.spiral}层、环向${initial.hoop}层。`)
  trace.push(`三次样条与覆盖公式计算${result.dome.groups.length}组封头厚度及各组爆压贡献。`)
  trace.push(`筒身纵向${result.cylinder.pa.toFixed(2)} MPa、环向${result.cylinder.pth.toFixed(2)} MPa；封头经验初估${result.head.pressure.toFixed(2)} MPa。`)
  return { ok: true, plan, trace, verdict: result.verdict }
}

/** 供测试/界面复用：给定方案的双向爆压。 */
export function planPressures(input: DesignInput, plan: LayupPlan) {
  const result = runCheck({ ...input, plan })
  return { pa: result.cylinder.pa, pth: result.cylinder.pth, totalThickness: result.cylinder.totalThickness,
    domeMin: result.dome.minP, domeMinR: result.dome.minPR, requirement: result.derived.pb }
}
