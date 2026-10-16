/**
 * presets.ts — 默认模板（全部字段载入后仍可修改，软件不做任何用户改不了的隐藏假设）
 *
 * 只有一套界面模板，命名"默认"：初版设计算例（78 L / 70 MPa）的几何、工况与初始铺层，
 * 开箱即可与设计资料逐项对账（核对基线见 tests/initialCase.test.ts）；换成自己的瓶子时
 * 把字段改掉即可。
 * 140 L / 35 MPa 基准案例保留为 excelBaselineInput()（与参考 Excel 逐格对账用，测试与
 * 课程流程固定挂此案例），不再作为界面默认。
 * 来源标注（讲义/论文/插件）只写在 docs 与代码注释里，界面一律不出现。
 */
import type { DesignInput, MaterialInput, StrengthInput } from './types'
import { defaultAngles, expansionAngles } from './expansion'

/** 默认工艺参数：T700 级碳纤维 24K，4 束并线 */
export const DEFAULT_MATERIAL: MaterialInput = {
  tex: 1.65,
  fiberDensity: 1.8,
  bandWidth: 5,
  strandCount: 4,
  vf: 0.6,
  resinDensity: 1.2,
}

/** 140 L 基准案例的强度（"直接给定"：发挥强度 3385、复材层 2031，与参考 Excel 一致） */
export const DEFAULT_STRENGTH_B: StrengthInput = {
  mode: 'B',
  sigmaNOL: 2390,
  kLoss: 0.85,
  sigmaSpiralDirect: 3385,
  sigmaHoopDirect: 3385,
  sigmaCompositeDirect: 2031,
}

/** 默认模板强度（"直接给定"）：复材层强度 2080，发挥强度 = 2080 / Vf */
export const INITIAL_STRENGTH_B: StrengthInput = {
  mode: 'B',
  sigmaNOL: 2390,
  kLoss: 0.85,
  sigmaSpiralDirect: 2080 / 0.6,
  sigmaHoopDirect: 2080 / 0.6,
  sigmaCompositeDirect: 2080,
}

/** 常用候选螺旋角（按 140 L 基准案例几何的扩孔步进生成） */
export const CANDIDATE_ANGLES = defaultAngles(expansionAngles(173.5, 30.13, 20).map(r => r.angle))

/** 140 L 基准案例（与参考 Excel 逐格对账；测试、课程流程固定使用） */
export function excelBaselineInput(): DesignInput {
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
    material: { ...DEFAULT_MATERIAL },
    strength: { ...DEFAULT_STRENGTH_B },
    requirement: {
      pbMode: 'direct',
      pb: 90,
      workingPressure: 35,
      safetyFactor: 2.57,
      ks: 0.75,
    },
    constraint: {
      manualSpiralEstimate: null,
      manualHoopEstimate: null,
      candidates: [...CANDIDATE_ANGLES],
      angleRule: 'manual',
      candidateSource: 'expansion',
      expansionGeometry: JSON.stringify([173.5, 30.13, 20]),
      forceEvenSpiral: true,
      alphaRef: 20,
    },
    plan: {
      spiral: [
        { angle: 10, layers: 4 },
        { angle: 17, layers: 4 },
        { angle: 25, layers: 4 },
        { angle: 37, layers: 2 },
        { angle: 40, layers: 2 },
        { angle: 45, layers: 2, splineEndRadius: 163 },
      ],
      hoop: 23,
    },
  }
}

/** 铺层为空的输入（强度按 NOL 自算）：供测试与"从零开始"使用 */
export function blankInput(): DesignInput {
  const data = excelBaselineInput()
  return {
    ...data,
    strength: {
      mode: 'A',
      sigmaNOL: 2390,
      kLoss: 0.85,
      sigmaSpiralDirect: 3385,
      sigmaHoopDirect: 3385,
      sigmaCompositeDirect: null,
    },
  }
}

/** 默认模板 = 初版设计算例（78 L / 70 MPa）：几何、工况与初始铺层全量载入 */
export function defaultInput(): DesignInput {
  return {
    geometry: {
      R: 135,
      poleMode: 'winding',
      r0Winding: 36,
      portInnerRadius: 16,
      linerAtPole: 20,
      headShortAxis: 67.5,
      cylLength: 1282,
      volumeL: 78,
      linerThickness: 5,
    },
    material: { ...DEFAULT_MATERIAL },
    strength: { ...INITIAL_STRENGTH_B },
    requirement: {
      pbMode: 'direct',
      pb: 157.5,
      workingPressure: 70,
      safetyFactor: 2.25,
      ks: 0.75,
    },
    constraint: {
      manualSpiralEstimate: null,
      manualHoopEstimate: null,
      candidates: [15, 20, 25, 35, 40],
      angleRule: 'manual',
      candidateSource: 'expansion',
      expansionGeometry: JSON.stringify([135, 36, 20]),
      forceEvenSpiral: true,
      alphaRef: 15,
    },
    plan: {
      spiral: [
        { angle: 15, layers: 8 },
        { angle: 20, layers: 8 },
        { angle: 25, layers: 4 },
        { angle: 35, layers: 4 },
        { angle: 40, layers: 4 },
      ],
      hoop: 36,
    },
  }
}

/** 原表固定案例：保留 C27=14、C29=24 的人工选层，供逐格核对使用。 */
export function courseInput(): DesignInput {
  const data = excelBaselineInput()
  return { ...data, constraint: { ...data.constraint, manualSpiralEstimate: 14, manualHoopEstimate: 24, preserveCourseSelections: true } }
}

export interface Preset {
  id: string
  label: string
  note: string
  make: () => DesignInput
}

/** 界面只暴露这一套模板 */
export const DEFAULT_PRESET: Preset = {
  id: 'default',
  label: '默认',
  note: '78 L / 70 MPa 级瓶子的常用初值：R=135 mm、24K×4 束、Vf 0.6、爆压 157.5 MPa、平衡系数 0.75',
  make: defaultInput,
}

export const PRESETS: Preset[] = [DEFAULT_PRESET]
