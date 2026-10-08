/**
 * materials.ts — 工艺参数链与强度参数（两种模式）
 *
 * 复刻 Excel 参数区（强度设计与计算.xls / 封头厚度计算公式.xls 的 A 列参数块）：
 *   tf = tex / (ρ_fiber · b)        纤维单层厚
 *   tc = tf / Vf                    复材单层厚
 *   b_tot = n · b                   总带宽
 *   模式 A: σ发挥 = σ_NOL / Vf · k ；σc = σ发挥 · Vf
 *   模式 B: σ发挥(螺旋/环向可分给)、σc 由用户直接给定
 */
import type { DerivedParams, DesignInput, GeometryInput, MaterialInput, StrengthInput } from './types'

export function fiberLayerThickness(m: MaterialInput): number {
  // g/m ÷ (g/cm³ · mm)：10⁻³ 单位差在数值上自洽抵消（Excel 同口径）
  return m.tex / (m.fiberDensity * m.bandWidth)
}

export function compositeLayerThickness(m: MaterialInput): number {
  return fiberLayerThickness(m) / m.vf
}

export function totalBandWidth(m: MaterialInput): number {
  return m.strandCount * m.bandWidth
}

/** 缠绕极孔半径：口径二选一 */
export function windingPoleRadius(g: GeometryInput): number {
  return g.poleMode === 'winding' ? g.r0Winding : g.portInnerRadius + g.linerAtPole
}

export function deriveStrength(m: MaterialInput, s: StrengthInput): Pick<
  DerivedParams,
  'sigmaSpiral' | 'sigmaHoop' | 'sigmaComposite' | 'sigmaNOLAdjusted'
> {
  if (s.mode === 'A') {
    const sigma = (s.sigmaNOL / m.vf) * s.kLoss
    return {
      sigmaSpiral: sigma,
      sigmaHoop: sigma,
      sigmaComposite: sigma * m.vf,
      sigmaNOLAdjusted: sigma,
    }
  }
  const autoC = s.sigmaCompositeDirect ?? s.sigmaSpiralDirect * m.vf
  return {
    sigmaSpiral: s.sigmaSpiralDirect,
    sigmaHoop: s.sigmaHoopDirect,
    sigmaComposite: autoC,
    sigmaNOLAdjusted: s.sigmaSpiralDirect,
  }
}

export function designBurstPressure(input: DesignInput): number {
  const r = input.requirement
  return r.pbMode === 'direct' ? r.pb : r.workingPressure * r.safetyFactor
}

export function deriveParams(input: DesignInput): DerivedParams {
  const { material, geometry, strength, requirement } = input
  const tf = fiberLayerThickness(material)
  return {
    tf,
    tc: tf / material.vf,
    bandTotal: totalBandWidth(material),
    r0: windingPoleRadius(geometry),
    ...deriveStrength(material, strength),
    pb: requirement.pbMode === 'direct' ? requirement.pb : requirement.workingPressure * requirement.safetyFactor,
  }
}
