/**
 * geometry.ts — 气瓶几何板块（容积↔尺寸互算、半椭球外形轮廓、线型缠绕切点校验）
 *
 * 公式出处（页码为论文印刷页 / PDF 页）：
 *   朱宁《Ⅳ型高压储氢气瓶结构设计及优化研究》2023
 *     式(2.6) p17/PDF32  容积正算：V = (4π/3)·K_f·(D/2−t)²·(D/(2λ)−t) + π·(D/2−t)²·l
 *     式(2.7) p18/PDF33  由目标容积反算筒身长度 l，再代入芯模转角 θ'_n 选径
 *     式(2.2)            测地线 sinα = r₀/r
 *     式(2.3~2.5)        单程转角 θ'_t = γ + β，双程 θ'_n = 2θ'_t
 *     式(2.20) p22/PDF37 回转壳主曲率 R_φ、R_θ
 *   郑强《全缠绕复合气瓶有限元分析和优化设计》2008 —— 只取其**线型缠绕工艺**部分：
 *     式(2-4) p14/PDF21  γ = l·tanα₀/(πD)·360°，β = 2(90° + arcsin((h·tanα₀ − r₀)/R))
 *     表2-1   p14/PDF21  纤维缠绕线型表（切点数 n 与转角 θ 的对应）
 *     ★ 郑强式(2-5) 的容积三段拆分（含"接嘴项"）是 **Ⅲ型瓶（金属内衬）** 口径，本项目做
 *       Ⅳ型瓶（塑料内胆），**不采用**。Ⅳ型瓶瓶口/接头区尺寸按既有 Abaqus Ⅳ型瓶插件的
 *       接头设计口径另行定义，见 JointParams。
 *
 * 半径口径（重要，勿与铺层设计的 R 混用）：
 *   本模块一律用 **内表面（芯模/内胆外表面）半径 R_in**；铺层设计里的 R 是缠绕层受力计算半径。
 *   两者关系：R_in = R − 铺层内表面偏移，由用户分别填写并在界面标注。
 */
import { DEG, RAD } from './geodesic'

const clamp1 = (x: number) => Math.max(-1, Math.min(1, x))

export interface VolumeParams {
  /** 筒身内半径 R_in (mm) = D/2 − t */
  R_in: number
  /** 筒身段长度 l (mm) */
  l: number
  /** 封头轴比 λ = a/b（a 径向半轴=R_in，b 轴向半轴=封头深度）。标准椭圆 2，郑强取 √2，一般 ≤2.5 */
  lambda: number
  /** 极孔半径 r₀ (mm) */
  r0: number
  /** 阀座占用使封头实际容积折减的系数 K_f（朱宁取 0.8） */
  Kf: number
}

/** 封头轴向短半轴 b（=封头深度 h）；朱宁式(2.6) 原文写法见 computeVolumeZhuLiteral */
export function headMinorAxis(p: VolumeParams): number {
  return p.R_in / p.lambda
}

export interface VolumeParts {
  /** 两个封头合计（含 Kf 折减）mm³ */
  headMm3: number
  /** 筒身段 mm³ */
  cylMm3: number
  totalMm3: number
  /** 容积 (L) */
  totalL: number
  /** 封头轴向短半轴 b (mm) */
  b: number
  /** 封头深度（含极孔区）用的轴比 */
  lambda: number
}

/** 容积正算（朱宁式2.6：封头半椭球 + 筒身圆柱；Ⅳ型瓶接头区见 JointParams） */
export function computeVolume(p: VolumeParams): VolumeParts {
  const a = p.R_in
  const b = a / p.lambda
  const headMm3 = ((4 * Math.PI) / 3) * p.Kf * a * a * b
  const cylMm3 = Math.PI * a * a * p.l
  const totalMm3 = headMm3 + cylMm3
  return { headMm3, cylMm3, totalMm3, totalL: totalMm3 / 1e6, b, lambda: p.lambda }
}

/** 朱宁式(2.6) 的原文写法（b = D/(2λ) − t，即把 λ 先作用在外径上再减壁厚） */
export function computeVolumeZhuLiteral(p: VolumeParams, t: number): VolumeParts {
  const D = 2 * (p.R_in + t)
  const a = D / 2 - t
  const b = D / (2 * p.lambda) - t
  const headMm3 = ((4 * Math.PI) / 3) * p.Kf * a * a * b
  const cylMm3 = Math.PI * a * a * p.l
  const totalMm3 = headMm3 + cylMm3
  return { headMm3, cylMm3, totalMm3, totalL: totalMm3 / 1e6, b, lambda: p.lambda }
}

export type UnknownField = 'none' | 'l' | 'R_in' | 'lambda' | 'volumeL'

/**
 * 容积↔尺寸互算：指定一个未知量，由其余量解出它（朱宁式2.7 是其 l 未知时的闭式特例）。
 *  - 'l'      : 闭式
 *  - 'R_in'   : 单调增，二分求根
 *  - 'lambda' : 单调减，二分求根
 *  - 'volumeL': 正算
 * targetL 为目标容积（L）。返回补全后的完整参数与容积分解。
 */
export function solveGeometry(
  p: VolumeParams,
  unknown: UnknownField,
  targetL: number,
): { params: VolumeParams; parts: VolumeParts; solved: string; ok: boolean } {
  const targetMm3 = targetL * 1e6
  if (unknown === 'none' || unknown === 'volumeL') {
    return { params: p, parts: computeVolume(p), solved: `${computeVolume(p).totalL.toFixed(3)} L（正算）`, ok: true }
  }
  if (unknown === 'l') {
    const v = computeVolume(p)
    const l = (targetMm3 - v.headMm3) / (Math.PI * p.R_in ** 2)
    const ok = Number.isFinite(l) && l > 0
    const params = { ...p, l: ok ? l : p.l }
    return { params, parts: computeVolume(params), solved: `筒身长度 l = ${l.toFixed(2)} mm`, ok }
  }
  if (unknown === 'R_in') {
    const f = (R: number) => computeVolume({ ...p, R_in: R }).totalMm3 - targetMm3
    const root = bisect(f, 1, 2000)
    if (root === null) return { params: p, parts: computeVolume(p), solved: '筒身内半径无解（目标容积过小或过大）', ok: false }
    const params = { ...p, R_in: root }
    return { params, parts: computeVolume(params), solved: `筒身内半径 R_in = ${root.toFixed(2)} mm（D = ${(2 * root).toFixed(1)} mm）`, ok: true }
  }
  // lambda：b = R/λ，λ↑ → 封头变浅 → 容积单调减
  const f = (lam: number) => computeVolume({ ...p, lambda: lam }).totalMm3 - targetMm3
  const root = bisect(f, 1.0001, 20)
  if (root === null) return { params: p, parts: computeVolume(p), solved: '封头轴比无解（λ 超出 1~20）', ok: false }
  const params = { ...p, lambda: root }
  return { params, parts: computeVolume(params), solved: `封头轴比 λ = ${root.toFixed(3)}（封头深度 b = ${(root ? params.R_in / root : 0).toFixed(1)} mm）`, ok: true }
}

/** 区间二分求根（要求 f 在区间端点异号；单调问题足够用） */
function bisect(f: (x: number) => number, lo: number, hi: number): number | null {
  let a = lo
  let b = hi
  let fa = f(a)
  let fb = f(b)
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || fa * fb > 0) return null
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2
    const fm = f(m)
    if (!Number.isFinite(fm)) return null
    if (Math.abs(fm) < 1e-3) return m
    if (fa * fm < 0) {
      b = m
      fb = fm
    } else {
      a = m
      fa = fm
    }
  }
  return (a + b) / 2
}

/** 由封头深度 b 反推轴比 λ（Excel 里 C14「封头短半轴对应长度」就是这个 b） */
export function lambdaFromDepth(R_in: number, b: number): number {
  return R_in / b
}

/** 由轴比 λ 求封头深度 b */
export function depthFromLambda(R_in: number, lambda: number): number {
  return R_in / lambda
}

export interface MeridianPoint {
  /** 平行圆半径 r (mm) */
  r: number
  /** 轴向坐标 z (mm)，赤道 z=0，极点 z=b */
  z: number
  /** 主曲率半径 R_φ（子午面内）mm — 朱宁式(2.20) */
  Rphi: number
  /** 主曲率半径 R_θ（法截面内）mm — 朱宁式(2.20) */
  Rtheta: number
}

/**
 * 内表面子午线（半椭球）：z(r) = b·√(1 − (r/a)²)，a = R_in，b = a/λ。
 * 同时给出两篇论文用于壳分析的主曲率半径（朱宁式2.20 的椭球闭式）。
 */
export function meridianProfile(p: VolumeParams, samples = 80): MeridianPoint[] {
  const a = p.R_in
  const b = a / p.lambda
  const out: MeridianPoint[] = []
  for (let i = 0; i < samples; i++) {
    const r = p.r0 + ((a - p.r0) * i) / (samples - 1)
    const s = Math.max(0, 1 - (r / a) ** 2)
    const dzdr = (-b * r) / (a * a * Math.sqrt(Math.max(1e-12, s)))
    const q = Math.sqrt(1 + dzdr * dzdr)
    // 椭球 z = b√(1−r²/a²) 的子午向曲率：z'' = −b / (a²·(1−r²/a²)^{3/2})
    const zpp = -b / (a * a * Math.pow(Math.max(1e-12, s), 1.5))
    out.push({
      r,
      z: b * Math.sqrt(s),
      Rphi: Math.pow(q, 3) / Math.abs(zpp),
      Rtheta: r * q,
    })
  }
  return out
}

/**
 * 封头内表面积（回转面）：A = 2π∫[r0,R_in] r·ds，ds = √(1+z'²)dr。
 * heads = 计入几个封头（默认 2，即整瓶两端）。
 */
export function headSurfaceArea(p: VolumeParams, heads = 2, samples = 400): number {
  const a = p.R_in
  const b = a / p.lambda
  const z = (x: number) => b * Math.sqrt(Math.max(0, 1 - (x / a) ** 2))
  let s = 0
  for (let i = 1; i <= samples; i++) {
    const r0p = p.r0 + ((a - p.r0) * (i - 1)) / samples
    const r1p = p.r0 + ((a - p.r0) * i) / samples
    const rm = (r0p + r1p) / 2
    s += 2 * Math.PI * rm * Math.hypot(r1p - r0p, z(r1p) - z(r0p))
  }
  return s * heads
}

/** 筒身段内表面积 */
export function cylinderSurfaceArea(p: VolumeParams): number {
  return 2 * Math.PI * p.R_in * p.l
}

// ── 线型缠绕：切点数与转角（郑强 表2-1 / 式2-4）──────────────────────────────

/**
 * 线型表：θ = 360°·(m + K/n)，n 为切点数，K/n 为最简真分数（n=1 时 K=0 即整圈）。
 * 论文印刷式为 "θ_n=(K/N+N)·360°±Δθ/n"，其中第二个 N 实为整数圈数 m；
 * 本实现按可复算的形式生成，并与原表逐格核对（见 tests/geometry.test.ts）。
 */
export interface LineTypeRow {
  theta: number
  /** 切点数 n */
  n: number
  /** 最简真分数的分子 K */
  K: number
  /** 整数圈数 m */
  m: number
}

const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x)

export function lineTypeTable(maxN = 6, maxM = 6): LineTypeRow[] {
  const rows: LineTypeRow[] = []
  for (let n = 1; n <= maxN; n++) {
    for (let K = n === 1 ? 0 : 1; K < n; K++) {
      if (n !== 1 && gcd(K, n) !== 1) continue
      for (let m = n === 1 ? 1 : 0; m < maxM; m++) {
        const theta = 360 * (m + K / n)
        if (theta > 0) rows.push({ theta, n, K, m })
      }
    }
  }
  return rows.sort((a, b) => a.theta - b.theta)
}

/**
 * 单程/双程转角（郑强式2-4）：
 *   α₀ = arcsin(r₀/R)  —— 筒身处缠绕角（=极孔切线角）
 *   γ = l·tanα₀/(πD)·360°
 *   β = 2(90° + arcsin((h·tanα₀ − r₀)/R))
 *   θ'_n = 2(γ + β)
 * h 为封头深度（短半轴 b）。
 */
export function windingTurns(p: VolumeParams) {
  const R = p.R_in
  const D = 2 * R
  const h = R / p.lambda
  const sinA = clamp1(p.r0 / R)
  const alpha0 = Math.asin(sinA)
  const tanA = Math.tan(alpha0)
  const gamma = ((p.l * tanA) / (Math.PI * D)) * 360
  const arg = clamp1((h * tanA - p.r0) / R)
  const beta = 2 * (90 + Math.asin(arg) * DEG)
  const oneWay = gamma + beta
  return {
    alpha0Deg: alpha0 * DEG,
    gamma,
    beta,
    oneWay,
    roundTrip: 2 * oneWay,
  }
}

/** 把算得的转角与线型表比对：给出最接近的几个 (n, K, m) 及偏差（度） */
export function matchLineType(thetaDeg: number, opts: { maxDeviation?: number } = {}) {
  const tol = opts.maxDeviation ?? 45
  return lineTypeTable()
    .map((row) => ({ ...row, dev: row.theta - thetaDeg }))
    .filter((r) => Math.abs(r.dev) <= tol)
    .sort((a, b) => Math.abs(a.dev) - Math.abs(b.dev) || a.n - b.n)
    .slice(0, 5)
}

/** 常用区间提示（只给判据，来源标注见 docs/DESIGN.md） */
export function geometryChecks(p: VolumeParams): Array<{ level: 'ok' | 'warn'; text: string }> {
  const out: Array<{ level: 'ok' | 'warn'; text: string }> = []
  const L = 2 * (p.R_in + p.l + 2 * (p.R_in / p.lambda))
  const ratio = p.l / (2 * p.R_in)
  out.push({
    level: ratio > 0 && (ratio < 2 || ratio > 5) ? 'warn' : 'ok',
    text: `筒身长径比 l/D = ${ratio.toFixed(2)}，常用 2~5；总长≈${L.toFixed(0)} mm`,
  })
  out.push({
    level: p.lambda > 2.5 ? 'warn' : 'ok',
    text: `封头轴比 λ = ${p.lambda.toFixed(3)}，一般 ≤2.5（标准椭圆为 2，取 √2≈1.414 时赤道环向应力为正）`,
  })
  const r0d = p.r0 / (2 * p.R_in)
  out.push({
    level: r0d > 0.2 || r0d < 0.05 ? 'warn' : 'ok',
    text: `极孔比 r₀/D = ${r0d.toFixed(3)}，常用 0.05~0.20`,
  })
  return out
}

// ── Ⅳ型瓶瓶口/接头区尺寸设计（对齐既有 Abaqus Ⅳ型瓶插件 type4_builder_kernel.py）──
//
// ★ 口径要点：插件里 boreRadius r0（阀座通孔半径，默认 16 mm）与缠绕的测地线极孔
//   r_cl = R_out·sinα₀ 是**两个不同的量**（kernel 第 13~15 行明确声明）。
//   铺层设计里填的"缠绕极孔半径"对应 r_cl，不是瓶口物理孔径。
//   接头段长度不给输入，全部由圆角相切关系定位；R_nf 与封头外曲线的切点用数值求根。

export interface JointParams {
  /** 筒身内半径 R_in (mm) — 插件 barrelRadius */
  R_in: number
  /** 直筒段内衬壁厚 t1 (mm) — 插件 linerThickness（仅直筒段） */
  t1: number
  /** 直筒段长度 l1 (mm) — 插件 barrelLength */
  l1: number
  /** 两端极孔端面间距 L (mm) — 插件 overallLength */
  L: number
  /** 封头-接头分界半径 r_sp — 插件 bossSplitRadius */
  r_sp: number
  /** 内衬-阀座粘结界面环半径 r_f — 插件 interfaceCollarRadius */
  r_f: number
  /** 界面圆角 R_if — 插件 interfaceFillet */
  R_if: number
  /** 内肩外圆角 R_so（切筒身内壁）— 插件 shoulderOuterFillet */
  R_so: number
  /** 内肩内圆角 R_si — 插件 shoulderInnerFillet */
  R_si: number
  /** 内衬回折壁半径 r_c — 插件 collarReturnRadius */
  r_c: number
  /** 环端面相对切点偏移 l_tip（正→朝筒身）— 插件 collarTipOffset */
  l_tip: number
  /** 阀座通孔（物理极孔）半径 r0 — 插件 boreRadius */
  r0: number
  /** 阀座颈壁厚 t4 → r_n = r0 + t4 — 插件 neckWallThickness */
  t4: number
  /** 颈-封头外曲线圆角 R_nf — 插件 neckFillet */
  R_nf: number
  /** 孔底圆角 R_bf — 插件 boreFillet */
  R_bf: number
  /** 封头轴比 k = R_out/b（插件 semiellipsoidal 用外表面定义）*/
  k: number
}

/** 插件 DEFAULT_PARAMS 基准值（type4_builder_kernel.py:35-57），可整体载入后修改 */
export const PLUGIN_JOINT_DEFAULT: JointParams = {
  R_in: 135, t1: 5, l1: 1282, L: 1520,
  r_sp: 90, r_f: 43, R_if: 35, R_so: 30, R_si: 28, r_c: 50, l_tip: 22,
  r0: 16, t4: 20, R_nf: 12, R_bf: 6, k: 2,
}

export interface JointDerived {
  R_out: number
  r_n: number
  y_eq: number
  H: number
  /** 界面圆角圆心行高 z_28 = R_so − R_si */
  z_28: number
  /** z_35 = z_28 + R_if */
  z_35: number
  /** 封头深度 l₂ = z_sp（分界半径 r_sp 处的封头轴向坐标） */
  z_sp: number
  /** R_nf 与封头外曲线相切的圆心轴向位置 yc（数值求根） */
  yc: number
  /** 颈直段长度 = H − yc，插件要求 ≥3 mm */
  neckStraight: number
  /** 内肩直段余量 = R_in − R_so − r_c − R_si，插件要求 >0 */
  shoulderFlat: number
  /** 测地线 Clairaut 常数 r_cl = R_out·sinα₀（与 r0 不同量） */
  rCl: number
}

/**
 * 封头外曲线（插件 semiellipsoidal 用外表面）：z(r) = b·√(1 − (r/R_out)²)，b = R_out/k。
 * 定义域 r ≤ R_out。
 */
function headOuterZ(r: number, R_out: number, k: number): number {
  const s = 1 - (r / R_out) ** 2
  return s <= 0 ? 0 : (R_out / k) * Math.sqrt(s)
}

/**
 * R_nf 与封头外曲线的相切定位（复刻 kernel:277-316）：
 * 圆心 c = (r_n + R_nf, yc)，在封头采样点上找使圆弧与曲线相切（即圆与曲线恰好接触）
 * 的最大 yc。用"扫描 + 二分"求根：对每个 yc，比较圆心到曲线的最小距离与 R_nf。
 */
function solveNeckTangency(r_n: number, R_nf: number, R_out: number, k: number): number {
  const samples = 400
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= samples; i++) {
    const r = r_n + ((R_out - r_n) * i) / samples
    pts.push([r, headOuterZ(r, R_out, k)])
  }
  const minDist = (yc: number) => {
    let best = Infinity
    for (const [r, z] of pts) {
      const d = Math.hypot(r - (r_n + R_nf), z - yc)
      if (d < best) best = d
    }
    return best
  }
  // yc 由小到大扫，找到 minDist 恰好等于 R_nf 的最大 yc
  let lo = 0
  let hi = R_out
  for (let i = 0; i <= 400; i++) {
    const y = (hi * i) / 400
    if (minDist(y) <= R_nf) lo = y
    else break
  }
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2
    if (minDist(m) <= R_nf) lo = m
    else hi = m
  }
  return lo
}

/** 由接头参数算出全部派生量 */
export function deriveJoint(p: JointParams, alpha0Deg?: number): JointDerived {
  const R_out = p.R_in + p.t1
  const r_n = p.r0 + p.t4
  const y_eq = p.l1 / 2
  const H = p.L / 2 - y_eq
  const z_28 = p.R_so - p.R_si
  const z_35 = z_28 + p.R_if
  const z_sp = headOuterZ(p.r_sp, R_out, p.k)
  const yc = solveNeckTangency(r_n, p.R_nf, R_out, p.k)
  return {
    R_out,
    r_n,
    y_eq,
    H,
    z_28,
    z_35,
    z_sp,
    yc,
    neckStraight: H - yc,
    shoulderFlat: p.R_in - p.R_so - p.r_c - p.R_si,
    rCl: alpha0Deg === undefined ? 0 : R_out * Math.sin(alpha0Deg * RAD),
  }
}

export interface JointCheck {
  name: string
  ok: boolean
  text: string
  /** 出处：type4_builder_kernel.py 行号 */
  src: string
}

/** 插件 kernel:198-236 的约束链逐条校验（含 α₀ 与 r_cl 的关系） */
export function checkJoint(p: JointParams, d: JointDerived, alpha0Deg?: number): JointCheck[] {
  const rows: JointCheck[] = []
  const add = (name: string, ok: boolean, text: string, src: string) => rows.push({ name, ok, text, src })
  const chain = `0 < r0(${p.r0}) < r_n(${d.r_n}) < r_f(${p.r_f}) < r_c(${p.r_c}) < r_sp(${p.r_sp}) < R_in(${p.R_in}) < R_out(${d.R_out})`
  add(
    '半径链',
    p.r0 < d.r_n && d.r_n < p.r_f && p.r_f < p.r_c && p.r_c < p.r_sp && p.r_sp < p.R_in && p.R_in < d.R_out,
    chain,
    'K:205-208',
  )
  add('内肩直段', d.shoulderFlat > 0, `R_in − R_so − r_c − R_si = ${d.shoulderFlat.toFixed(2)} mm > 0`, 'K:209-211')
  add('内外圆角', p.R_si < p.R_so, `R_si(${p.R_si}) < R_so(${p.R_so})`, 'K:212-216')
  add('环端面偏移', p.l_tip > -(p.R_so - p.R_si), `l_tip(${p.l_tip}) > −(R_so−R_si) = ${-(p.R_so - p.R_si)}`, 'K:212-216')
  add('孔底圆角', p.R_bf < p.t4, `R_bf(${p.R_bf}) < t4(${p.t4})`, 'K:217')
  add('总长', d.H >= 10, `H = L/2 − l1/2 = ${d.H.toFixed(2)} mm ≥ 10`, 'K:221-222')
  add('颈直段', d.neckStraight >= 3, `颈直段 = H − yc = ${d.neckStraight.toFixed(2)} mm ≥ 3（yc=${d.yc.toFixed(2)} 由 R_nf 相切数值求解）`, 'K:313-315')
  add(
    '封头深度与接头',
    d.z_sp > d.z_35 + 1 && d.z_sp < d.H - 1,
    `封头分界深度 z_sp(${d.z_sp.toFixed(2)}) 需 > z_28+R_if+1(${(d.z_35 + 1).toFixed(2)}) 且 < H−1(${(d.H - 1).toFixed(2)})`,
    'K:268-274',
  )
  if (alpha0Deg !== undefined) {
    add('缠绕角上限', alpha0Deg > 0 && alpha0Deg < 54.74, `α₀ = ${alpha0Deg.toFixed(2)}°，须 0 < α₀ < 54.74°`, 'K:225-236')
    add('Clairaut 常数', d.rCl < p.r_sp, `r_cl = R_out·sinα₀ = ${d.rCl.toFixed(2)} mm < r_sp(${p.r_sp})`, 'K:225-236')
    add('Clairaut 与颈圆角', d.rCl < d.r_n + 2 * p.R_nf, `r_cl(${d.rCl.toFixed(2)}) < r_n + 2R_nf = ${(d.r_n + 2 * p.R_nf).toFixed(2)}`, 'K:225-236')
    add('r_cl ≠ 通孔半径', true, `注意：阀座通孔 r0=${p.r0} 与缠绕测地线极孔 r_cl=${d.rCl.toFixed(2)} 是两个不同的量`, 'K:13-15')
  }
  return rows
}

/** 判定窗口下界的几何依据：复合层能到达的最小平行圆 = r_cl，接头覆盖到 r_sp */
export function bossZoneRadius(d: JointDerived, p: JointParams): { rCl: number; r_sp: number; suggest: number } {
  return { rCl: d.rCl, r_sp: p.r_sp, suggest: Math.min(p.r_sp, Math.max(d.rCl, 1)) }
}
