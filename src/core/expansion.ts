import { angleFromPoleRadius } from './geodesic'
import type { DesignInput } from './types'
import { deriveParams } from './materials'

export interface ExpansionAngle { diameter: number; angle: number; boundary: boolean }

/** 课件扩孔表：D_i = D_0 + i b，α_i = asin(D_i / D筒身)。90°只作为筒身边界。 */
export function expansionAngles(R: number, r0: number, band: number): ExpansionAngle[] {
  if (![R, r0, band].every(Number.isFinite) || !(R > r0 && r0 > 0 && band > 0)) return []
  const count = Math.ceil((2 * R - 2 * r0) / band)
  // 不能以循环截断静默丢掉扩孔范围；过小带宽应由界面明确提示。
  if (count > 10000) return []
  const rows = Array.from({ length: count }, (_, i) => {
    const diameter = 2 * r0 + i * band
    return { diameter, angle: angleFromPoleRadius(R, diameter / 2), boundary: false }
  })
  rows.push({ diameter: 2 * R, angle: 90, boundary: true })
  return rows
}

/** 优先隔一取一，默认8个；候选不足时补入未选项，最多选可用数量。 */
export function defaultAngles(angles: number[], count = 8): number[] {
  const sorted = [...new Set(angles)].filter(a => Number.isFinite(a) && a > 0 && a < 90).sort((a, b) => a - b)
  return [...sorted.filter((_, i) => i % 2 === 0), ...sorted.filter((_, i) => i % 2 === 1)]
    .slice(0, count).sort((a, b) => a - b)
}

export function prepareExpansion(input: DesignInput, reset = false): DesignInput {
  const d = deriveParams(input)
  const signature = JSON.stringify([input.geometry.R, d.r0, d.bandTotal])
  if (!reset && input.constraint.candidateSource === 'expansion' && input.constraint.expansionGeometry === signature) return input
  return { ...input, constraint: { ...input.constraint, candidateSource: 'expansion', expansionGeometry: signature,
    angleRule: 'manual', candidates: defaultAngles(expansionAngles(input.geometry.R, d.r0, d.bandTotal).map(g => g.angle)) } }
}
