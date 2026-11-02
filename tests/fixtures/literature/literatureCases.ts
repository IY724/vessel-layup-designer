/**
 * literatureCases.ts — 四篇文献的参数映射与印刷值夹具（阶段3）
 *
 * 每个案例三块：
 *   input()    软件可执行的 DesignInput（用论文自身参数，不引入经验乘数）
 *   printed    论文印刷数值（校核对象）；逐项带 page 锚点
 *   notes      口径差异（两个口径并列、论文内部矛盾等），不悄悄放宽门槛
 *
 * 来源：F:\abaqus_temp\type4_xianyu\wenxian 四个 PDF 的全文提取 TXT
 * （OUT/papers/{zhang,cao,jia,zhu}.txt，哈希见 OUT/papers/source-hashes.txt）。
 */
import type { DesignInput } from '../../../src/core/types'
import { defaultInput } from '../../../src/core/presets'

export interface PrintedValue {
  key: string
  label: string
  printed: number
  page: string
  /** 论文口径说明（哪个公式/哪个表） */
  basis: string
}

export interface LiteratureCase {
  id: string
  paper: string
  title: string
  input: () => DesignInput
  /** A 路正向复算的对照值与口径 */
  printed: PrintedValue[]
  /** 论文自身口径的备注（矛盾/差异），REPORT.md 引用 */
  notes: string[]
}

/* ------------------------------------------------------------------ */
/* 通用：按论文口径构造 DesignInput 的公共片段                          */
/* ------------------------------------------------------------------ */

const baseRequirement = {
  pbMode: 'direct' as const,
  workingPressure: 70,
  safetyFactor: 2.25,
  ks: 0.75,
}

/* ------------------------------------------------------------------ */
/* 1) 曹龙彪 2022 — 车载Ⅳ型储氢瓶缠绕层优化及有限元分析                */
/*    D=348→R=174, r0=40, Vf=60%, σf发挥=3385, σc=2031, tc=0.3,      */
/*    总带宽15, 设计161, ks=0.75;                                     */
/*    表6: ±13.3²/±18.4²/±23.7⁴/±29.2⁶/±35.1⁸/±41.4¹⁰ + 环向2/3/4/5/6/7 */
/*    印刷 Pα=263.8, Pθ=212.42, 封头197.8 —— 三值均按 tc=0.3 直接乘    */
/*    σf=3385（把纤维强度乘在复材厚度上，比物理一致口径放大 1/Vf）；     */
/*    物理一致口径 tf=0.3×0.6=0.18 × σf=3385（≡ tc×σc）Pα=158.3。      */
/* ------------------------------------------------------------------ */

/** 曹文印刷口径（非物理一致）：σ 用 3385、单层厚用 tc=0.3 → 等效于软件 σ=3385/0.6、tc=0.3 */
function caoPrintedInput(): DesignInput {
  return {
    geometry: {
      R: 174,
      poleMode: 'winding',
      r0Winding: 40,
      portInnerRadius: 34,
      linerAtPole: 6,
      headShortAxis: 87,
      cylLength: 570,
      volumeL: 210,
      linerThickness: 4,
    },
    // 工艺链等效：tf = tex/(ρ·b) = 1.62/(1.8×5) = 0.18 = tc×Vf = 0.3×0.6（物理一致）
    material: { tex: 1.62, fiberDensity: 1.8, bandWidth: 5, strandCount: 3, vf: 0.6, resinDensity: 1.2 },
    strength: { mode: 'B', sigmaNOL: 3385, kLoss: 1, sigmaSpiralDirect: 3385 / 0.6, sigmaHoopDirect: 3385 / 0.6, sigmaCompositeDirect: 2031 },
    requirement: { ...baseRequirement, pb: 161 },
    constraint: {
      manualSpiralEstimate: null,
      manualHoopEstimate: null,
      candidates: [13, 18, 24, 29, 35, 41],
      angleRule: 'manual',
      candidateSource: 'expansion',
      expansionGeometry: JSON.stringify([174, 40, 15]),
      forceEvenSpiral: true,
      alphaRef: 13.3,
    },
    plan: {
      spiral: [
        { angle: 13.3, layers: 2 },
        { angle: 18.4, layers: 2 },
        { angle: 23.7, layers: 4 },
        { angle: 29.2, layers: 6 },
        { angle: 35.1, layers: 8 },
        { angle: 41.4, layers: 10 },
      ],
      hoop: 27,
    },
  }
}

/** 曹文物理一致口径：σ=σc=2031 乘 tc=0.3（≡ tf=0.18×σf=3385） */
function caoConsistentInput(): DesignInput {
  const d = caoPrintedInput()
  return { ...d, strength: { ...d.strength, sigmaSpiralDirect: 2031 / 0.6, sigmaHoopDirect: 2031 / 0.6 } }
}

/* ------------------------------------------------------------------ */
/* 2) 张宜凯 2025 — 车载复合材料储氢气瓶优化设计与失效模式研究          */
/*    R=168, r0=40→α=14°, pb=157.5, σf=2800, K=0.75（并入两式分母）,   */
/*    T700 带宽2mm 单层0.227mm; tα=6.695→30层, tθ印刷9.058→40层。      */
/*    环向式原文（p34 视觉核对）：tθ=RP/(2σ)·(2−(1/K)tan²α)，K 在 tan² 项 */
/*    内 → 复算 9.0584，与印刷 9.058 精确吻合（+0.004%）。论文自洽。     */
/*    软件式无 K：(2−tan²α) 口径 → 9.1563（+1.07%），是 K 口径差非矛盾。 */
/*    （最接近的变体是无 K 式 9.156，差-1.1%；论文按 40 层制造）。      */
/* ------------------------------------------------------------------ */

function zhangInput(): DesignInput {
  return {
    geometry: {
      R: 168,
      poleMode: 'winding',
      r0Winding: 40,
      portInnerRadius: 34,
      linerAtPole: 6,
      headShortAxis: 84,
      cylLength: 900,
      volumeL: 205,
      linerThickness: 5,
    },
    // 张文单层带厚 0.227（预浸带实测，含树脂）：tf=0.227 → tex=0.227×1.8×2=0.8172，Vf=0.65（表2.3）。
    // 论文把 0.227 同时当除数（t/0.227=层数）与乘数（层数×0.227=厚度），是 tf/tc 混同的单口径；
    // 软件保持 Vf 真实值，厚度对照行按论文口径用 n×tf，软件 tc 口径（n×tc）另列。
    material: { tex: 0.8172, fiberDensity: 1.8, bandWidth: 2, strandCount: 1, vf: 0.65, resinDensity: 1.2 },
    // K=0.75 并入分母 ⇔ 发挥强度 = 2800×0.75（张文把 K 当作强度折减放在分母）
    strength: { mode: 'B', sigmaNOL: 2800, kLoss: 1, sigmaSpiralDirect: 2800 * 0.75, sigmaHoopDirect: 2800 * 0.75, sigmaCompositeDirect: 2100 },
    requirement: { ...baseRequirement, pb: 157.5 },
    constraint: {
      manualSpiralEstimate: null,
      manualHoopEstimate: null,
      candidates: [14],
      angleRule: 'manual',
      candidateSource: 'expansion',
      expansionGeometry: JSON.stringify([168, 40, 2]),
      forceEvenSpiral: true,
      alphaRef: 14,
    },
    plan: { spiral: [{ angle: 14, layers: 30 }], hoop: 40 },
  }
}

/* ------------------------------------------------------------------ */
/* 3) 贾子璇 2021 — 塑料内衬复合材料储氢气瓶的结构设计及有限元验证      */
/*    R=142.5, r0=50→α=19.5°, 表2-3: Pmax=157.5, [σ]=1674, k=0.8,      */
/*    tf=0.325; 印刷 tα=10.48, tθ=13.96 → 32/42层。                    */
/*    印刷厚度按 175 MPa 分子算得（10.478/13.963），与表2-3 的 157.5     */
/*    自相矛盾；按 157.5 复算 tα=9.43/tθ=12.57。42.95→42 层为舍位。     */
/* ------------------------------------------------------------------ */

function jiaInput(): DesignInput {
  return {
    geometry: {
      R: 142.5,
      poleMode: 'winding',
      r0Winding: 50,
      portInnerRadius: 44,
      linerAtPole: 6,
      headShortAxis: 71,
      cylLength: 900,
      volumeL: 135,
      linerThickness: 5,
    },
    // 贾文单层纤维带厚 0.325：tf=0.325 → tex=0.325×1.8×2=1.17，Vf 取常规 0.6。
    // 论文同样把 0.325 同时当除数与乘数（单口径）；软件保持 Vf 真实值，厚度对照按 n×tf。
    material: { tex: 1.17, fiberDensity: 1.8, bandWidth: 2, strandCount: 1, vf: 0.6, resinDensity: 1.2 },
    strength: { mode: 'B', sigmaNOL: 1674, kLoss: 1, sigmaSpiralDirect: 1674 * 0.8, sigmaHoopDirect: 1674 * 0.8, sigmaCompositeDirect: 1339.2 },
    requirement: { ...baseRequirement, pb: 157.5 },
    constraint: {
      manualSpiralEstimate: null,
      manualHoopEstimate: null,
      candidates: [19.5],
      angleRule: 'manual',
      candidateSource: 'expansion',
      expansionGeometry: JSON.stringify([142.5, 50, 2]),
      forceEvenSpiral: true,
      alphaRef: 19.5,
    },
    plan: { spiral: [{ angle: 19.5, layers: 32 }], hoop: 42 },
  }
}

/* ------------------------------------------------------------------ */
/* 4) 朱宁 2023 — Ⅳ型高压储氢气瓶结构设计及优化研究（浙大）             */
/*    R=140, r0=36→α=15°, pb=157.5, σf=2080, tc=0.3(纯复材单层),       */
/*    式2.19: h螺=8.12/h环=10.22 → 28/36层；扩孔方案表2.4:              */
/*    15/20/25/35/40 × 8/8/4/4/4 + 90°×36（表2.5 打印 69.00/65.30/     */
/*    30.37/24.81/21.70/160.45，总计211.19/183.43）。                  */
/*    表2.5 各螺旋行按 R=135 算（69.00=8.625×8 精确），环向按 R=140；    */
/*    正文环向 180.98 与表 183.43 自相矛盾。R=135 vs 140 差异已记录。   */
/* ------------------------------------------------------------------ */

/** 朱文表2.4/2.5 方案直接用 defaultInput()（presets 已承载），这里只给印刷值与口径说明。 */

export const literatureCases: LiteratureCase[] = [
  {
    id: 'cao',
    paper: '车载Ⅳ型储氢瓶绕缠绕层优化及有限元分析（曹龙彪 2022，化工设备与管道）',
    title: 'D348/R174，±13.3→41.4 扩孔 + 环向27层',
    input: caoPrintedInput,
    printed: [
      { key: 'pa', label: '筒身纵向爆破压强 Pα', printed: 263.8, page: 'PDF p5 式(5)-(7)后文', basis: 'Pα=Σ2·cos²α·σfb·hf/R，hf 用 tc=0.3（复材厚度×纤维强度，非物理一致口径）' },
      { key: 'pth', label: '筒身环向爆破压强 Pθ', printed: 212.42, page: 'PDF p5 式(6)后文', basis: '同上口径；= 螺旋环向分量54.85 + 环向层157.58' },
      { key: 'head', label: '封头爆破压强', printed: 197.8, page: 'PDF p5 式(8)后文', basis: 'ks=0.75 × 全螺旋层赤道贡献 = 0.75×263.8' },
    ],
    notes: [
      '印刷值口径 = 复合材料单层厚0.3 直接乘纤维发挥强度3385；等效于把纤维强度放大 1/Vf=1.667 倍。',
      '物理一致口径（tf=0.18×3385 ≡ tc=0.3×σc=2031）下 Pα=158.29、Pθ=127.47，双双低于设计161 —— 论文自身口径导致。',
      '软件对照两列：printed 口径复现 263.82/212.43/197.87；consistent 口径复算 158.29/127.47。',
    ],
  },
  {
    id: 'zhang',
    paper: '车载复合材料储氢气瓶优化设计与失效模式研究（张宜凯，大连理工）',
    title: 'R168/r0=40/α14°，K=0.75 并入分母，30+40层',
    input: zhangInput,
    printed: [
      { key: 'tSpiral', label: '螺旋向纤维厚度（30层×0.227）', printed: 6.695, page: 'PDF p34（印刷页-21）', basis: '论文 tα=R·Pmax/(2·K·σf·cos²14°)=6.6916→印刷6.695；软件=30×tc=6.81（层数取整+1.7%）' },
      { key: 'tHoop', label: '环向纤维厚度（40层×0.227）', printed: 9.058, page: 'PDF p34（印刷页-21）', basis: '论文式 tθ=RP/(2σ)·(2−(1/K)tan²α)，K 在 tan² 项内 → 复算9.0584（+0.004%，精确）；软件式无K (2−tan²α)→9.1563（+1.07%），软件=40×tc=9.08（+0.24%）' },
      { key: 'nSpiral', label: '螺旋缠绕层数', printed: 30, page: 'PDF p34', basis: '6.695/0.227=29.49 → 30层（向上取整）' },
      { key: 'nHoop', label: '环向缠绕层数', printed: 40, page: 'PDF p34', basis: '9.058/0.227=39.90 → 40层' },
    ],
    notes: [
      '论文为单口径：0.227（单层带厚）直接除厚度得层数、乘层数得厚度；σf=2800 为纤维强度。软件用 Vf=1 表达该单口径（tf=tc=0.227），不动源码。',
      'K=0.75 在论文式2.17 中并入两式分母，软件用 mode B σ=2800×0.75 等价实现，不加经验乘数。',
      '环向式（p34 视觉核对）tθ=RP/(2σ)·(2−(1/K)tan²α)，K 在 tan² 项内 → 复算 9.0584，与印刷 9.058 精确吻合（论文自洽，此前误判为矛盾源于把 K 放错位置）。',
      '螺旋复算 6.6916 vs 印刷 6.695（-0.05%，论文舍入）。',
    ],
  },
  {
    id: 'jia',
    paper: '塑料内衬复合材料储氢气瓶的结构设计及有限元验证（贾子璇，北京化工大学）',
    title: 'R142.5/r0=50/α19.5°，σ=1674×0.8，32+42层',
    input: jiaInput,
    printed: [
      { key: 'tSpiral', label: '螺旋向缠绕层厚度（32层×0.325）', printed: 10.48, page: 'PDF p32 表2-3后', basis: '印刷10.48 按 175 MPa 分子复算10.4781（+0.02%）；按表2-3 Pmax=157.5 复算9.4303（-10.0%）。软件=32×tc=10.40（-0.76%）' },
      { key: 'tHoop', label: '环向缠绕层厚度（42层×0.325）', printed: 13.96, page: 'PDF p32 表2-3后', basis: '印刷13.96 按 175 MPa 分子复算13.9629（+0.02%）；按157.5 复算12.5666（-10.0%）。软件=42×tc=13.65（-2.2%）' },
      { key: 'nSpiral', label: '螺旋缠绕层数', printed: 32, page: 'PDF p32 表2-4', basis: '10.48/0.325=32.25 → 32（向下取整/舍位）' },
      { key: 'nHoop', label: '环向缠绕层数', printed: 42, page: 'PDF p32 表2-4', basis: '13.96/0.325=42.95 → 42（舍位，非四舍五入43）' },
    ],
    notes: [
      '论文为单口径：0.325 直接除厚度得层数、乘层数得厚度；[σ]=1674 为纤维许用应力。软件用 Vf=1 表达（tf=tc=0.325）。',
      '论文内部矛盾：表2-3 印刷 Pmax=157.5，但两个厚度印刷值均按 175 MPa 分子算得（双双吻合0.02%）。',
      '按论文自述参数（157.5）软件复算 9.43/12.57 → 层数 30/39（取整后）；按 175 才复现 10.48/13.96。',
      '运行器两口径并列，不把矛盾藏起来。',
    ],
  },
  {
    id: 'zhu',
    paper: 'Ⅳ型高压储氢气瓶结构设计及优化研究（朱宁 2023，浙江大学）',
    title: 'R140/r0=36/α15°，σf=2080，扩孔 28+36层（表2.4）',
    // 朱文案例即软件默认模板（initialCase.test.ts 已承载同一组印刷值对照）
    input: defaultInput,
    printed: [
      { key: 'tSpiralEst', label: '公式初估螺旋厚度（式2.19, K=0.7, 复材口径）', printed: 8.12, page: 'PDF p92 式2.19（定义见p36）', basis: 'tα=R·Pb/(2·K·[σ]·cos²15°)，K=0.7（p36定义，取值区间0.7-0.8下限）→ 复算8.1158（-0.05%）；软件初估×(1/Vf)÷K 精确等价（软件无K，靠补层保底）' },
      { key: 'tHoopEst', label: '公式初估环向厚度（式2.19 无K, 复材口径）', printed: 10.22, page: 'PDF p92 式2.19', basis: 'tθ=(2−tan²15°)·R·Pb/(2·[σ]) → 复算10.2204；软件初估×(1/Vf) 精确等价（+0.004%）' },
      { key: 'nSpiral', label: '公式初估螺旋层数', printed: 28, page: 'PDF p92', basis: '8.12/0.3=27.07 → 28（双交叉缠绕向上取整到偶）；软件无K初估18.94→20层，差异全部来自K=0.7口径（软件补层循环后24层）' },
      { key: 'nHoop', label: '公式初估环向层数', printed: 36, page: 'PDF p92', basis: '10.22/0.3=34.07 → 36（"向上取整后"双交叉到偶）；软件35层（差1制造层，达标）' },
      { key: 'pa', label: '筒身纵向爆破压强（表2.5）', printed: 211.19, page: 'PDF p92 表2.5', basis: '各螺旋行按 R=135 算（69.00=8.625×8 精确闭合）；软件按 R=140 得 203.65（-3.57%）' },
      { key: 'pth', label: '筒身环向爆破压强（表2.5总计）', printed: 183.43, page: 'PDF p92 表2.5', basis: '环向行按 R=140（160.45=4.4571×36 精确）；软件 183.4329（+0.002%）' },
    ],
    notes: [
      '式2.19（p36定义）：螺旋分母带强度利用系数 K（0.7-0.8，朱文取0.7），环向不带 K —— 数值精确闭合。',
      '层数取整规则："纤维缠绕通常为双层交叉缠绕，因此向上取整"（34.07→36，27.07→28）。',
      '表2.5 正文写环向 180.98，表尾总计 183.43 —— 论文自相矛盾（180.98 疑为旧稿遗留）。',
      '表2.5 螺旋行按 R=135 闭合 vs 环向行/总计按 R=140 —— 混合口径已在 initialCase.test.ts 记录。',
      '朱文 tc=0.3 是复合材料单层厚，[σ]=Xt=2080 是复合材料拉伸强度 —— 与软件 defaultInput 口径一致。',
    ],
  },
]

/** 曹文第二个口径（物理一致）作为附加对照案例暴露给运行器 */
export const caoConsistentCase = {
  id: 'cao-consistent',
  input: caoConsistentInput,
  printed: [
    { key: 'pa', label: '筒身纵向爆破压强 Pα（物理一致口径）', printed: 158.29, page: '推算：tf=0.3×0.6, σf=3385', basis: 'tc=0.3×σc=2031 ≡ tf=0.18×σf=3385；软件复算即此值' },
    { key: 'pth', label: '筒身环向爆破压强 Pθ（物理一致口径）', printed: 127.47, page: '推算', basis: '同上口径换算（螺旋32.91+环向94.55）' },
  ],
}
