/**
 * presets.ts — 默认模板（全部字段载入后仍可修改，软件不做任何用户改不了的隐藏假设）
 *
 * 只有一套模板，命名"默认"。它的数值取自本项目的基准算例（140 L / 35 MPa，见 tests/baseline.test.ts），
 * 这样"导出 Excel 计算书"与"校核明细"开箱即可与参考表逐格对账；换成自己的瓶子时把字段改掉即可。
 * 来源标注（讲义/论文/插件）只写在 docs 与代码注释里，界面一律不出现。
 */
import type { DesignInput, MaterialInput, StrengthInput } from './types'

/** 默认工艺参数：T700 级碳纤维 24K，4 束并线 */
export const DEFAULT_MATERIAL: MaterialInput = {
  tex: 1.65,
  fiberDensity: 1.8,
  bandWidth: 5,
  strandCount: 4,
  vf: 0.6,
  resinDensity: 1.2,
}

/** 默认强度（"直接给定"模式：纤维发挥强度 3385 MPa、复材层强度 2031 MPa） */
export const DEFAULT_STRENGTH_B: StrengthInput = {
  mode: 'B',
  sigmaNOL: 2390,
  kLoss: 0.85,
  sigmaSpiralDirect: 3385,
  sigmaHoopDirect: 3385,
  sigmaCompositeDirect: 2031,
}

/** 常用候选螺旋角（度） */
export const CANDIDATE_ANGLES = [10, 12, 15, 17, 20, 25, 30, 37, 40, 45]

/** 铺层为空的输入（强度按 NOL 自算）：供测试与"从零开始"使用 */
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
    material: { ...DEFAULT_MATERIAL },
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
      manualSpiralEstimate: 14,
      manualHoopEstimate: 24,
      candidates: [...CANDIDATE_ANGLES],
      angleRule: 'alternate',
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

/** 默认模板 = 基准算例的完整输入（强度直接给定，便于逐格对账） */
export function defaultInput(): DesignInput {
  return { ...blankInput(), strength: { ...DEFAULT_STRENGTH_B } }
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
  note: '140 L / 35 MPa 级瓶子的常用初值：R=173.5 mm、24K×4 束、Vf 0.6、爆压 90 MPa、平衡系数 0.75',
  make: defaultInput,
}

export const PRESETS: Preset[] = [DEFAULT_PRESET]
