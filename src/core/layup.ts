import type { GroupSpec, LayupGroup, LayupPlan } from './types'

/** 读取旧方案时，保持原有的“螺旋在前、环向在后”顺序，不替用户改排。 */
export function layupGroups(plan: LayupPlan): LayupGroup[] {
  return plan.groups ?? [
    ...plan.spiral.map(g => ({ ...g, type: 'spiral' as const })),
    ...(plan.hoop > 0 ? [{ type: 'hoop' as const, angle: 90, layers: plan.hoop }] : []),
  ]
}

export const activeGroups = (plan: LayupPlan) => layupGroups(plan).filter(g => g.active !== false && g.layers > 0)
export const spiralGroups = (plan: LayupPlan): GroupSpec[] => layupGroups(plan).filter(g => g.type === 'spiral')
export const hoopGroups = (plan: LayupPlan) => activeGroups(plan).filter(g => g.type === 'hoop')

export function planFromRows(rows: LayupGroup[]): LayupPlan {
  const groups = rows.map(g => ({ ...g }))
  return {
    groups,
    spiral: groups.filter(g => g.type === 'spiral').map(({ type: _type, ...g }) => g),
    hoop: groups.filter(g => g.type === 'hoop' && g.active !== false).reduce((s, g) => s + g.layers, 0),
  }
}

/** 自动方案按铺层组交替；拆分环向总层数时保持总数，最多相差一层。 */
export function interleavePlan(spiral: GroupSpec[], hoop: number): LayupPlan {
  const rows: LayupGroup[] = []
  const count = Math.min(spiral.length, Math.max(0, Math.round(hoop)))
  const base = count ? Math.floor(hoop / count) : 0
  const extra = count ? hoop % count : 0
  spiral.forEach((g, i) => {
    rows.push({ ...g, type: 'spiral' })
    if (i < count) rows.push({ type: 'hoop', angle: 90, layers: base + (i < extra ? 1 : 0) })
  })
  if (!spiral.length && hoop > 0) rows.push({ type: 'hoop', angle: 90, layers: hoop })
  return planFromRows(rows)
}

/** 等厚置换时保留用户既有行序、停用行和环向角度。 */
export function transferHoop(plan: LayupPlan, count: number, angle: number): LayupPlan {
  const rows = layupGroups(plan).map(g => ({ ...g }))
  let remaining = count
  for (let i = rows.length - 1; i >= 0 && remaining > 0; i--) {
    const g = rows[i]
    if (g.type !== 'hoop' || g.active === false) continue
    const take = Math.min(g.layers, remaining)
    g.layers -= take
    remaining -= take
  }
  const hit = rows.find(g => g.type === 'spiral' && g.active !== false && Math.abs(g.angle - angle) < 1e-9)
  if (hit) hit.layers += count - remaining
  else rows.push({ type: 'spiral', angle, layers: count - remaining })
  return planFromRows(rows)
}
