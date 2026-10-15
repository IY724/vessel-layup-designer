/**
 * types.ts — 全部输入 / 方案 / 结果类型定义（第一期：铺层设计板块）
 *
 * 单位约定（全系统统一，不做隐式换算）：
 *   长度 mm · 压强 MPa · 应力 MPa · 线密度 g/m · 密度 g/cm³ · 角度 度(°)
 */

/** 强度参数给法：A = 软件由 NOL 环强度自算；B = 用户直接给定发挥强度/复材层强度 */
export type StrengthMode = 'A' | 'B'
/** 极孔半径口径：winding = 直接填缠绕极孔半径；port = 填成品瓶口内半径 + 极孔处内衬厚 */
export type PoleInputMode = 'winding' | 'port'
/** 设计爆压给法：direct = 直接填 pb；wp_sf = 工作压力 × 安全系数换算 */
export type PbInputMode = 'direct' | 'wp_sf'
export interface GeometryInput {
  /** 筒身段中面半径 R（mm）。第一期按 Excel 口径：缠绕层中心面半径 */
  R: number
  poleMode: PoleInputMode
  /** 缠绕极孔半径（mm），poleMode = winding 时生效 */
  r0Winding: number
  /** 成品瓶口内半径（mm），poleMode = port 时生效 */
  portInnerRadius: number
  /** 极孔处内衬厚度（mm），poleMode = port 时生效 */
  linerAtPole: number
  /** 椭圆封头短半轴 h（mm）— 第一期仅记录，网格理论不依赖 */
  headShortAxis: number
  /** 筒身段长度（mm）— 第一期仅记录与用于重量估算 */
  cylLength: number
  /** 设计容积（L）— 第一期仅记录 */
  volumeL: number
  /** 内衬厚度（mm）— 仅用于重量估算的参考值，第一期不参与强度 */
  linerThickness: number
}

export interface MaterialInput {
  /** 线密度 tex（g/m） */
  tex: number
  /** 纤维密度（g/cm³） */
  fiberDensity: number
  /** 单束缠绕带宽 b（mm） */
  bandWidth: number
  /** 每束纱数 n（总带宽 = n × b） */
  strandCount: number
  /** 纤维体积含量 Vf */
  vf: number
  /** 树脂密度（g/cm³）— 仅用于重量参考值估算，不参与强度 */
  resinDensity: number
}

export interface StrengthInput {
  mode: StrengthMode
  /** 模式 A：NOL 环拉伸强度（MPa） */
  sigmaNOL: number
  /** 模式 A：强度损失系数 k（0.8~0.9） */
  kLoss: number
  /** 模式 B：螺旋层纤维发挥强度（MPa） */
  sigmaSpiralDirect: number
  /** 模式 B：环向层纤维发挥强度（MPa） */
  sigmaHoopDirect: number
  /** 模式 B：复材层强度 σc（MPa）；留空(null)时按 σ发挥 × Vf 自动取 */
  sigmaCompositeDirect: number | null
}

export interface RequirementInput {
  pbMode: PbInputMode
  /** 设计爆破压强 pb（MPa），pbMode = direct 时生效 */
  pb: number
  /** 工作压力（MPa），pbMode = wp_sf 时生效 */
  workingPressure: number
  /** 安全系数（爆破/工作压力），pbMode = wp_sf 时生效 */
  safetyFactor: number
  /** 应力平衡系数 ks（封头爆压汇总用） */
  ks: number
}

export interface ConstraintInput {
  /** 原表 C27/C29 的手工选取层数；与 B27/B29 的小数估算量分开保留。 */
  manualSpiralEstimate?: number | null
  manualHoopEstimate?: number | null
  /** 候选螺旋角集（度），可自由增删 */
  candidates: number[]
  /** 角度分配规则：alternate = 课件经验"隔一取一"；manual = 手动指定 */
  angleRule: 'alternate' | 'manual'
  /** 螺旋层必须偶数（±成对，缠绕物理要求） */
  forceEvenSpiral: boolean
  /** 参考角 αref（度）：筒身厚度初估用（复刻 Excel 左列 20°） */
  alphaRef: number
}

/** 一个角度组：螺旋层 angle < 90，环向层 angle = 90 */
export interface GroupSpec {
  angle: number
  /** 原表 H 列人工选用样条的最后半径；留空时以 r2b 分段。 */
  splineEndRadius?: number | null
  /** 层数（螺旋组为 ±成对的总层数，故应为偶数） */
  layers: number
  /** 是否激活：false = 该组保留在表里但不参与计算（缺省即激活） */
  active?: boolean
}

export interface LayupPlan {
  /** 螺旋角度组；数组顺序 = 缠绕先后，允许同一角度出现多行，可标记 active=false */
  spiral: GroupSpec[]
  /** 环向层数（90°） */
  hoop: number
}

export interface DesignInput {
  geometry: GeometryInput
  material: MaterialInput
  strength: StrengthInput
  requirement: RequirementInput
  constraint: ConstraintInput
  plan: LayupPlan
}

/** 派生工艺/强度参数（materials.ts 产出） */
export interface DerivedParams {
  /** 纤维单层厚 tf = tex/(ρ·b) */
  tf: number
  /** 复材单层厚 tc = tf/Vf */
  tc: number
  /** 总带宽 b_tot = n·b */
  bandTotal: number
  /** 缠绕极孔半径（口径换算后） */
  r0: number
  /** 螺旋层纤维发挥强度（筒身纵向/环向贡献均用此值） */
  sigmaSpiral: number
  /** 环向层纤维发挥强度 */
  sigmaHoop: number
  /** 复材层强度 σc（封头爆压用） */
  sigmaComposite: number
  /** 设计爆破压强（口径换算后） */
  pb: number
  /** 强度链中间值，界面展示推导过程 */
  sigmaNOLAdjusted: number
}

/** 筒身铺层表一行 */
export interface CylinderRow {
  angle: number
  type: 'spiral' | 'hoop'
  layers: number
  /** 单层纵向爆压贡献 */
  paUnit: number
  /** 单层环向爆压贡献 */
  pthUnit: number
  paSum: number
  pthSum: number
  thickness: number
}

export interface CylinderResult {
  rows: CylinderRow[]
  /** 纵向爆破压强 pα */
  pa: number
  /** 环向爆破压强 pθ */
  pth: number
  spiralLayers: number
  hoopLayers: number
  spiralThickness: number
  hoopThickness: number
  totalThickness: number
  paPass: boolean
  pthPass: boolean
  paMargin: number
  pthMargin: number
  /** 初估（复刻 Excel 左列） */
  estimate: {
    alphaRef: number
    cosRef: number
    tanRef: number
    hSpiral: number
    hHoop: number
    nSpiral: number
    nHoop: number
    hTotal: number
    tComposite: number
  }
}

/** 封头单个角度组的模型参数 */
export interface DomeGroup {
  angle: number
  splineEndRadius: number
  manualSplineEndRadius?: number | null
  /** 该组层数 */
  layers: number
  /** 缠绕循环数 = 层数/2（每组各自取值，不能一律 ×2） */
  cycles: number
  r0: number
  rb: number
  r2b: number
  mR: number
  nR: number
  tp: number
  tR: number
  V1: number
  V2: number
  Vconst: number
  /** 三次样条系数 m1..m4 */
  m: [number, number, number, number]
  /** 该组在 [r0, R] 内是否有效（r0 ≥ R 时无覆盖区） */
  valid: boolean
  note: string
}

export interface DomeProfilePoint {
  r: number
  /** 组厚度（含循环数），按组索引 */
  tGroups: number[]
  /** 组爆压（未乘 ks），按组索引 */
  pGroups: number[]
  tTotal: number
  /** Σ p_g（未乘 ks） */
  pSum: number
  /** ks·Σ p_g */
  pTotal: number
}

export interface DomeResult {
  groups: DomeGroup[]
  profile: DomeProfilePoint[]
  /** 复合层最小平行圆 = 最低角组 r0（该处仅一组覆盖、局部角→90°，纵向承载趋于 0） */
  rFirst: number
  /** 全铺层覆盖起点 = 最高角组 r0，判定窗口下界（只用铺层自身的量，不引入接头半径） */
  rFull: number
  /** 实际生效的判定窗口下界（auto 时等于 rFull） */
  rBoss: number
  /** 判定窗口 [rBoss, R] 内最小 ks·Σp 及位置 */
  minP: number
  minPR: number
  /** 全复合区 [rFirst, R] 最小值（含极孔侧承载空档），仅作参考 */
  minPAll: number
  maxP: number
  maxPR: number
  /** t总(R)，与筒身螺旋层厚做一致性检查 */
  tAtR: number
  /** 薄弱区（pTotal < pb 的连续 r 区间，判定窗口内） */
  weakZones: Array<{ from: number; to: number; min: number; minAt: number }>
  pass: boolean
  /** 样条求解失败的组（角度过大等） */
  failedGroups: Array<{ angle: number; reason: string }>
}

export interface Diagnosis {
  level: 'ok' | 'warn' | 'error'
  text: string
}

export interface SwapVariant {
  /** 从环向层置换到高角螺旋层的层数 */
  transfer: number
  minP: number
  minPR: number
  pAtR: number
  headPressure: number
  pa: number
  pth: number
  totalThickness: number
}

export interface Advice {
  /** 薄弱点位置类型：极孔侧承载空档 / 近赤道 / 无 */
  kind: 'pole-gap' | 'equator' | 'none'
  text: string
  variants: SwapVariant[]
}

export interface CheckResult {
  derived: DerivedParams
  cylinder: CylinderResult
  dome: DomeResult
  /** 第六课椭圆封头经验初估：ks·Σ(2·σfb·n·tf·cos²α₀/R)，不作局部曲线判定。 */
  head: { pressure: number; pass: boolean }
  /** 封头→筒身螺旋层连续性：t总(R) 与筒身螺旋层厚之差 */
  consistency: { domeSpiralAtR: number; cylinderSpiral: number; diff: number }
  weight: { cylinderKg: number; domeKg: number; totalKg: number; rhoComposite: number }
  verdict: 'pass' | 'adjust' | 'fail'
  diagnoses: Diagnosis[]
  advice: Advice
}
