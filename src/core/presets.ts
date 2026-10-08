/**
 * presets.ts — 预设模板（全部字段载入后仍可修改，软件不做任何用户改不了的隐藏假设）
 *
 * 140L/35MPa 课程案例：数值逐格取自两张 Excel（_extract/强度设计与计算.xlsx、封头厚度公式.xlsx），
 * 是基准测试的对照组，不是通用设计值。
 * 70MPa 案例：课程资料中只给出螺旋/环向发挥强度 3859/4342 MPa（无几何与铺层数据），
 * 因此仅作为「强度模式 B」的强度预设，几何/铺层需用户自行填写——不臆造数据。
 */
import type { DesignInput, MaterialInput, StrengthInput } from './types'

export const COURSE_MATERIAL: MaterialInput = {
  tex: 1.65,
  fiberDensity: 1.8,
  bandWidth: 5,
  strandCount: 4,
  vf: 0.6,
  resinDensity: 1.2,
}

/** 课程案例的强度预设（模式 B：Excel 里就是直接填 3385 / 2031） */
export const COURSE_STRENGTH_B: StrengthInput = {
  mode: 'B',
  sigmaNOL: 2390,
  kLoss: 0.85,
  sigmaSpiralDirect: 3385,
  sigmaHoopDirect: 3385,
  sigmaCompositeDirect: 2031,
}

/** 70MPa 课程案例的强度部分（螺旋/环向分别给定） */
export const MP70_STRENGTH_B: StrengthInput = {
  mode: 'B',
  sigmaNOL: 2390,
  kLoss: 0.85,
  sigmaSpiralDirect: 3859,
  sigmaHoopDirect: 4342,
  sigmaCompositeDirect: null,
}

export const CANDIDATE_ANGLES = [10, 12, 15, 17, 20, 25, 30, 37, 40, 45]

export function blankInput(): DesignInput {
  return {
    geometry: {
      R: 173.5,
      poleMode: 'winding',
      r0Winding: 30.13,
      portInnerRadius: 24,
      linerAtPole: 6,
      headShortAxis: 100,
      cylLength: 800,
      volumeL: 140,
      linerThickness: 0,
    },
    material: { ...COURSE_MATERIAL },
    strength: {
      mode: 'A',
      sigmaNOL: 2390,
      kLoss: 0.85,
      sigmaSpiralDirect: 3385,
      sigmaHoopDirect: 3385,
      sigmaCompositeDirect: null,
    },
    requirement: {
      pbMode: 'direct',
      pb: 90,
      workingPressure: 35,
      safetyFactor: 2.57,
      ks: 0.75,
    },
    constraint: {
      candidates: [...CANDIDATE_ANGLES],
      angleRule: 'alternate',
      forceEvenSpiral: true,
      rBoss: 50,
      rBossAuto: true,
      alphaRef: 20,
    },
    refMode: 'corrected',
    plan: {
      spiral: [
        { angle: 10, layers: 4 },
        { angle: 17, layers: 4 },
        { angle: 25, layers: 4 },
        { angle: 37, layers: 2 },
        { angle: 40, layers: 2 },
        { angle: 45, layers: 2 },
      ],
      hoop: 23,
    },
  }
}

/** 140L / 35MPa 课程案例（= 两张 Excel 的原始输入） */
export function courseCase(): DesignInput {
  const base = blankInput()
  return {
    ...base,
    strength: { ...COURSE_STRENGTH_B },
  }
}

/** 70MPa 课程案例：仅强度口径可复用（模式 B，螺旋/环向分别给定），几何与铺层留待填写 */
export function mp70Strength(): StrengthInput {
  return { ...MP70_STRENGTH_B }
}

export interface Preset {
  id: string
  label: string
  note: string
  make: () => DesignInput
}

export const PRESETS: Preset[] = [
  {
    id: 'course140',
    label: '140L / 35MPa 课程案例',
    note: '两张 Excel 的原始输入：R=173.5、T700-24K×4、Vf 0.6、σ发挥 3385（模式 B）、pb 90、ks 0.75',
    make: courseCase,
  },
  {
    id: 'course140A',
    label: '140L / 35MPa（强度模式 A 自算）',
    note: '同上，但由 σ_NOL=2390、k=0.85 自算 σ发挥=3385.83（Excel 取整为 3385，差 0.025%）',
    make: blankInput,
  },
  {
    id: 'blank',
    label: '空白（默认参数）',
    note: '几何/工艺取课程默认值，铺层方案为空，需自行添加角度组',
    make: () => ({ ...blankInput(), plan: { spiral: [], hoop: 0 } }),
  },
]
