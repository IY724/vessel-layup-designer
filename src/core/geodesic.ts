/**
 * geodesic.ts — 测地线缠绕：螺旋角 ↔ 极孔半径互算
 *
 * 测地线 Clausius–Clapeyron 关系：sin α(r) = r₀ / r
 *   筒身段（r = R）：r₀ = R · sin αg      —— 角度决定该组纤维能"够到"的最小平行圆
 *   封头上任意平行圆 r：局部缠绕角 α(r) = arcsin(r₀ / r)
 * 扩孔工艺的本质：每个角度组有自己的极孔半径 r₀g，逐组增大。
 */

export const DEG = 180 / Math.PI
export const RAD = Math.PI / 180

/** 极孔半径 r₀ = R·sinα（mm） */
export function poleRadius(R: number, alphaDeg: number): number {
  return R * Math.sin(alphaDeg * RAD)
}

/** 由极孔半径反算筒身缠绕角（度）；r₀ > R 时返回 NaN */
export function angleFromPoleRadius(R: number, r0: number): number {
  const x = r0 / R
  if (x < -1 || x > 1) return NaN
  return Math.asin(x) * DEG
}

/** 封头上平行圆 r 处的局部缠绕角（度）；r < r₀ 时该组纤维不经过此圆，返回 NaN */
export function localAngle(r0: number, r: number): number {
  if (r <= 0) return NaN
  const x = r0 / r
  if (x > 1) return NaN
  return Math.asin(x) * DEG
}

export interface PoleRow {
  angle: number
  r0: number
  /** 与最低角度组的极孔差（扩孔量） */
  delta: number
}

/** 角度组 ↔ 极孔对照表（含扩孔量），界面"极孔对照"用 */
export function poleTable(R: number, anglesDeg: number[]): PoleRow[] {
  const rows = anglesDeg.map((a) => ({ angle: a, r0: poleRadius(R, a), delta: 0 }))
  const min = rows.length ? Math.min(...rows.map((r) => r.r0)) : 0
  return rows.map((r) => ({ ...r, delta: r.r0 - min }))
}

/**
 * 极孔一致性校验：设计输入的缠绕极孔 r₀ 应≈最低角度组的 R·sinα_min。
 * 两个判据任一超差即报警：① 半径偏差 > 1 倍总带宽；② 反算角度与 α_min 差 > alphaTolDeg。
 * （只按半径判据会漏判：R 较大时几毫米偏差对应的角度差可能很大）
 */
export function checkPoleConsistency(
  R: number,
  r0Input: number,
  alphaMinDeg: number,
  bandTotal: number,
  alphaTolDeg = 2,
) {
  const r0Geodesic = poleRadius(R, alphaMinDeg)
  const dev = r0Input - r0Geodesic
  const implied = angleFromPoleRadius(R, r0Input)
  const dAlpha = Number.isNaN(implied) ? Infinity : implied - alphaMinDeg
  const level: 'ok' | 'warn' =
    Math.abs(dev) <= bandTotal && Math.abs(dAlpha) <= alphaTolDeg ? 'ok' : 'warn'
  const text =
    level === 'ok'
      ? `极孔一致性：r₀=${r0Input.toFixed(2)} ≈ R·sin${alphaMinDeg}°=${r0Geodesic.toFixed(2)}` +
        `（偏差 ${dev >= 0 ? '+' : ''}${dev.toFixed(2)} mm / ${dAlpha >= 0 ? '+' : ''}${dAlpha.toFixed(2)}°，在容差内）`
      : `极孔半径与铺层角度不吻合，偏差 ${dev >= 0 ? '+' : ''}${dev.toFixed(2)} mm（由 r₀ 反算的角度 ${Number.isNaN(implied) ? '—' : implied.toFixed(2) + '°'}，` +
        `与最低角度组 ${alphaMinDeg}° 差 ${dAlpha >= 0 ? '+' : ''}${dAlpha.toFixed(2)}°）已超出容差，` +
        '请确认这里填的是缠绕极孔半径，还是瓶口内半径 + 极孔处内衬厚'
  return { r0Geodesic, dev, implied, dAlpha, level, text }
}
