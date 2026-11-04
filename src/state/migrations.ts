import type { DesignInput } from '../core/types'
import { defaultInput, excelBaselineInput } from '../core/presets'
import { layupGroups } from '../core/layup'

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}

function identity(input: DesignInput) {
  return stable({ ...input, geometry: { ...input.geometry, headVolumeFactor: input.geometry.headVolumeFactor ?? 0.8 },
    constraint: { ...input.constraint, manualSpiralEstimate: input.constraint.manualSpiralEstimate ?? null,
      manualHoopEstimate: input.constraint.manualHoopEstimate ?? null, preserveCourseSelections: input.constraint.preserveCourseSelections ?? false },
    plan: layupGroups(input.plan).map(g => ({ ...g, active: g.active !== false })),
  })
}

/** 只识别完整未修改的历史默认数据；编辑过的参数、层数、顺序和停用状态均不覆盖。 */
export function migrateDefaultLayup(input: DesignInput): DesignInput {
  const current = defaultInput()
  const flat = { spiral: current.plan.spiral, hoop: 36 }
  const oldRadius: DesignInput = { ...current,
    geometry: { ...current.geometry, R: 135, headShortAxis: 67.5 },
    constraint: { ...current.constraint, expansionGeometry: JSON.stringify([135,36,20]) },
  }
  const previous: DesignInput = { ...oldRadius,
    geometry: { ...oldRadius.geometry, portInnerRadius: 16, linerAtPole: 20 },
    material: { ...current.material, tex: 1.65 },
    strength: { ...current.strength, sigmaNOL: 2390, kLoss: 0.85, sigmaHoopDirect: 2080/0.6 },
    requirement: { ...current.requirement, pbMode: 'direct', ks: 0.75 },
    plan: flat,
  }
  const candidates = [oldRadius, { ...oldRadius, plan: flat }, previous, { ...previous, plan: current.plan }, excelBaselineInput(), { ...current, plan: flat }]
  const key = identity(input)
  return candidates.some(candidate => identity(candidate) === key) ? current : input
}
