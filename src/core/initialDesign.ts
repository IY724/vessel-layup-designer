/** 筒身单角度初估 → 取整选层 → 扩孔分配的共同输入。 */
import type { DesignInput } from './types'
import { deriveParams } from './materials'
import { cylinderCheck, initialEstimate } from './netting'

/** 初算层数须达到计算厚度；螺旋按±成对向上取偶数。 */
export function selectedLayerCount(raw: number, even: boolean): number {
  const step = even ? 2 : 1
  return Math.max(0, Math.ceil(raw / step) * step)
}

export function initialDesign(input: DesignInput) {
  const d = deriveParams(input)
  const c = input.constraint
  const estimate = initialEstimate(input.geometry.R, d.pb, d.sigmaSpiral, d.tf, c.alphaRef, d.tc, d.sigmaHoop)
  const spiral = selectedLayerCount(estimate.nSpiral, true)
  const hoop = selectedLayerCount(estimate.nHoop, false)
  const startAngle = d.r0 > 0 && d.r0 < input.geometry.R
    ? Math.asin(d.r0 / input.geometry.R) * 180 / Math.PI : NaN
  const check = cylinderCheck({ spiral: [{ angle: c.alphaRef, layers: spiral }], hoop }, {
    R: input.geometry.R, tf: d.tf, tc: d.tc, sigmaSpiral: d.sigmaSpiral, sigmaHoop: d.sigmaHoop, pb: d.pb, alphaRef: c.alphaRef,
  })
  const valid = [input.geometry.R, d.pb, d.tf, d.tc, d.sigmaSpiral, d.sigmaHoop].every(v => Number.isFinite(v) && v > 0)
    && c.alphaRef > 0 && c.alphaRef < 54.7356 && d.r0 > 0 && d.r0 < input.geometry.R
    && input.material.vf > 0 && input.material.vf < 1
  return { estimate, startAngle, spiral, hoop, pa: check.pa, pth: check.pth,
    pass: valid && Number.isFinite(check.pa) && Number.isFinite(check.pth) && check.paPass && check.pthPass }
}

/** 默认均分整层/整对；余量依角度从小到大放入，选中的角度均保留。 */
export function expandedLayerCounts(input: DesignInput, count: number) {
  const initial = initialDesign(input)
  const step = 2
  if (!count) return { initial, layers: [], spiral: 0, added: 0 }
  const units = Math.max(count, initial.spiral / step)
  const base = Math.floor(units / count), remainder = units % count
  const layers = Array.from({ length: count }, (_, i) => (base + (i < remainder ? 1 : 0)) * step)
  const spiral = units * step
  return { initial, layers, spiral, added: spiral - initial.spiral }
}
