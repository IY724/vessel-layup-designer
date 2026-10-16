/** 封头逐角度计算，按课件原表的实际公式与人工选取复现。
 * mR、覆盖公式、体积矩阵采用 3.1415926；角度输入弧度采用 Math.PI。
 * 局部角 K 以 3.1415926 转成度；余弦项修正为 cos²u，u=K*Math.PI/180。
 * 此逐点曲线仅作参考；课件封头经验初估另用筒身角 α₀。
 * 正样条外插保留；循环数为每组层数/2；45° 原表 163 mm 分段由输入显式保留。
 */
import type { DomeGroup, DomeProfilePoint, DomeResult } from './types'
import { RAD } from './geodesic'
import { COURSE_PI, courseGrid } from './course'

const clamp1 = (x: number) => Math.max(-1, Math.min(1, x))

/** 4×4 高斯消元（列主元）。奇异/病态返回 null。 */
export function solve4(A: number[][]): number[] | null {
  const M = A.map((r) => [...r])
  for (let c = 0; c < 4; c++) {
    let piv = c
    for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-12) return null
    const t = M[c]
    M[c] = M[piv]
    M[piv] = t
    for (let r = 0; r < 4; r++) {
      if (r === c || Math.abs(M[r][c]) < 1e-16) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k < 5; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((r, i) => r[4] / r[i])
}

/** 构建单个角度组的封头模型（含样条系数求解） */
export function buildDomeGroup(
  angleDeg: number,
  layers: number,
  R: number,
  bandTotal: number,
  tc: number,
  splineEndRadius?: number | null,
): DomeGroup | { error: string } {
  const a = angleDeg * RAD
  const r0 = R * Math.sin(a)
  const rb = r0 + bandTotal
  const r2b = r0 + 2 * bandTotal
  const mR = (2 * COURSE_PI * R * Math.cos(a)) / bandTotal
  const nR = 1
  const tp = tc
  const tR = 2 * nR * tp
  const k = (mR * nR * tp) / COURSE_PI

  const cov = (r: number) =>
    r > rb ? k * (Math.acos(clamp1(r0 / r)) - Math.acos(clamp1(rb / r))) : 0
  const covD = (r: number) =>
    r > rb
      ? k * (r0 / (r * Math.sqrt(Math.max(1e-12, r * r - r0 * r0))) - rb / (r * Math.sqrt(Math.max(1e-12, r * r - rb * rb))))
      : 0

  if (!(r0 > 0) || !(bandTotal > 0) || !(mR > 0)) {
    return { error: `${angleDeg}° 组：极孔半径或带宽不合法（r_0=${r0.toFixed(3)}，总带宽=${bandTotal}）` }
  }

  const V1 = mR * nR * tp * (rb * rb * Math.acos(clamp1(r0 / rb)) - r0 * Math.sqrt(Math.max(0, rb * rb - r0 * r0)))
  const V2 = (r2b * r2b - rb * rb) * mR * nR * tp * (Math.acos(clamp1(r0 / r2b)) - Math.acos(clamp1(rb / r2b)))
  const Vconst = V1 + V2

  const rhs1 = tp * nR
  const rhs2 = cov(r2b)
  const rhs3 = covD(r2b)
  const sys = [
    [1, r0, r0 ** 2, r0 ** 3, rhs1],
    [1, r2b, r2b ** 2, r2b ** 3, rhs2],
    [0, 1, 2 * r2b, 3 * r2b ** 2, rhs3],
    [
      COURSE_PI * (r2b ** 2 - r0 ** 2),
      (2 / 3) * COURSE_PI * (r2b ** 3 - r0 ** 3),
      (COURSE_PI / 2) * (r2b ** 4 - r0 ** 4),
      (2 / 5) * COURSE_PI * (r2b ** 5 - r0 ** 5),
      Vconst,
    ],
  ]
  const m = solve4(sys)
  if (!m) return { error: `${angleDeg}° 组：样条系数方程组奇异，无法求解` }

  const cycles = layers / 2
  return {
    angle: angleDeg,
    splineEndRadius: splineEndRadius ?? r2b,
    manualSplineEndRadius: splineEndRadius,
    layers,
    cycles,
    r0,
    rb,
    r2b,
    mR,
    nR,
    tp,
    tR,
    V1,
    V2,
    Vconst,
    m: [m[0], m[1], m[2], m[3]],
    valid: r0 < R,
    note: r0 >= R ? 'r0 ≥ R：该角度组在筒身半径内无覆盖区（角度过大或极孔过大）' : '',
  }
}

export function isDomeGroup(x: DomeGroup | { error: string }): x is DomeGroup {
  return 'angle' in x
}

/** 样条值（r0 ≤ r ≤ r2b 区间定义，允许外插用于 excel 对账口径） */
export function splineAt(g: DomeGroup, r: number): number {
  return g.m[0] + g.m[1] * r + g.m[2] * r * r + g.m[3] * r ** 3
}

/** 覆盖公式值（r > rb） */
export function coverageAt(g: DomeGroup, r: number): number {
  if (r < g.rb) return 0
  const k = (g.mR * g.nR * g.tp) / COURSE_PI
  return k * (Math.acos(clamp1(g.r0 / r)) - Math.acos(clamp1(g.rb / r)))
}

/** 单层等效厚度 t(r)（不含循环数）；r < r0 时该组纤维够不到，取 0 */
export function layerThickness(g: DomeGroup, r: number): number {
  const t = r <= g.splineEndRadius ? splineAt(g, r) : coverageAt(g, r)
  // 原表 F 列先留空，再填入正值样条；起铺圆以下残留的正值也照原表保留。
  return Number.isFinite(t) ? Math.max(0, t) : 0
}

/** 组厚度 t_g(r) = 循环数 × t(r) */
export function groupThickness(g: DomeGroup, r: number): number {
  return layerThickness(g, r) * g.cycles
}

/** 逐半径爆破压强贡献：原表流程，余弦项修正为 cos²αg(r)，未乘 ks。 */
export function groupPressure(
  g: DomeGroup,
  r: number,
  R: number,
  sigmaComposite: number,
): number {
  if (r < g.r0) return 0
  const t = groupThickness(g, r)
  const localDegrees = Math.asin(clamp1(g.r0 / r)) / COURSE_PI * 180
  const u = localDegrees / 180 * Math.PI
  return ((2 * t * sigmaComposite) / R) * Math.cos(u) ** 2
}

export interface DomeArgs {
  R: number
  bandTotal: number
  tc: number
  sigmaComposite: number
  ks: number
  rBoss: number
  /** 设计爆破压强：用于薄弱区判定 */
  pb: number
  /** 采样点数 */
  samples?: number
}

/** 在任意平行圆 r 处的精确求值（曲线采样、hover 读数都用它，避免采样步长带来的假偏差） */
export function domeAt(
  groups: DomeGroup[],
  r: number,
  R: number,
  sigmaComposite: number,
  ks: number,
): DomeProfilePoint {
  const tGroups: number[] = []
  const pGroups: number[] = []
  for (const g of groups) {
    tGroups.push(groupThickness(g, r))
    pGroups.push(groupPressure(g, r, R, sigmaComposite))
  }
  const pSum = pGroups.reduce((x, y) => x + y, 0)
  return {
    r,
    tGroups,
    pGroups,
    tTotal: tGroups.reduce((x, y) => x + y, 0),
    pSum,
    pTotal: pSum * ks,
  }
}

/** 封头逐角度组 + 沿母线的 t总(r) / p总(r) 曲线 */
export function domeCheck(groups: DomeGroup[], a: DomeArgs, failed: DomeGroupBuildFailure[] = []): DomeResult {
  const active = groups.filter((g) => g.layers > 0 && g.r0 < a.R)
  const rMin = active.length ? Math.min(...active.map((g) => g.r0)) : 0
  const start = Math.max(rMin, 1e-6)
  const profile: DomeProfilePoint[] = []
  for (const r of courseGrid(start, a.R)) {
    profile.push(domeAt(active, r, a.R, a.sigmaComposite, a.ks))
  }

  const inZone = profile.filter((p) => p.r >= a.rBoss)
  const zone = inZone.length ? inZone : profile
  let minP = Infinity
  let minPR = 0
  let maxP = -Infinity
  let maxPR = 0
  for (const p of zone) {
    if (p.pTotal < minP) {
      minP = p.pTotal
      minPR = p.r
    }
    if (p.pTotal > maxP) {
      maxP = p.pTotal
      maxPR = p.r
    }
  }
  const minPAll = profile.length ? Math.min(...profile.map((p) => p.pTotal)) : 0

  // 薄弱区：p总 < pb 的连续 r 段（pb 由调用方通过 ks 阈值传入时再判定，这里用 pass 字段）
  const weakZones: DomeResult['weakZones'] = []
  let cur: DomeProfilePoint[] = []
  const flush = () => {
    if (!cur.length) return
    let mn = Infinity
    let at = 0
    for (const p of cur)
      if (p.pTotal < mn) {
        mn = p.pTotal
        at = p.r
      }
    weakZones.push({ from: cur[0].r, to: cur[cur.length - 1].r, min: mn, minAt: at })
    cur = []
  }
  for (const p of zone) {
    if (p.pTotal < a.pb) cur.push(p)
    else flush()
  }
  flush()

  const tAtR = profile.length ? profile[profile.length - 1].tTotal : 0
  return {
    groups: active,
    profile,
    rFirst: start,
    rFull: active.length ? Math.max(...active.map((g) => g.r0)) : start,
    rBoss: a.rBoss,
    minP: Number.isFinite(minP) ? minP : 0,
    minPR,
    maxP: Number.isFinite(maxP) ? maxP : 0,
    maxPR,
    minPAll,
    tAtR,
    weakZones,
    pass: Number.isFinite(minP) && minP >= a.pb,
    failedGroups: failed.map((f) => ({ angle: f.angle, reason: f.reason })),
  }
}

export interface DomeGroupBuildFailure {
  angle: number
  reason: string
}

/**
 * 由铺层方案的螺旋角组构建封头模型。
 * 返回顺序 = 用户给定的缠绕先后顺序（不重排）：封头逐层轮廓按此顺序累加堆叠，
 * 因此若把小角度组放在最后，它会包住前面各层并覆盖极孔区。
 * 环向层（90°）不上封头 → 记入 failed 供界面提示；角度非法/方程组奇异同样记入。
 */
export function buildDomeGroups(
  spiral: Array<{ angle: number; layers: number; active?: boolean; splineEndRadius?: number | null }>,
  R: number,
  bandTotal: number,
  tc: number,
): { groups: DomeGroup[]; failed: DomeGroupBuildFailure[] } {
  const groups: DomeGroup[] = []
  const failed: DomeGroupBuildFailure[] = []
  for (const g of spiral) {
    if (g.active === false || g.layers <= 0) continue
    if (g.angle >= 90) {
      failed.push({ angle: g.angle, reason: '环向层（90°）铺不进封头，不参与封头校核' })
      continue
    }
    const built = buildDomeGroup(g.angle, g.layers, R, bandTotal, tc, g.splineEndRadius)
    if (isDomeGroup(built)) groups.push(built)
    else failed.push({ angle: g.angle, reason: built.error })
  }
  return { groups, failed }
}
