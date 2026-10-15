/**
 * store.ts — 单一状态源：输入 + 当前方案。
 * 任何改动 → core 纯函数全量重算（毫秒级）→ 判定/表格/封头曲线同时刷新，无隐藏状态。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DesignInput, GeometryInput, LayupPlan } from '../core/types'
import { runCheck } from '../core/checker'
import { defaultInput } from '../core/presets'

const KEY = 'vessel-layup-designer.input.v1'

function load(): DesignInput {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DesignInput
      if (parsed?.geometry && parsed?.plan && parsed?.constraint) {
        const originalPlan=JSON.stringify(parsed.plan.spiral.map(g=>[g.angle,g.layers]))===JSON.stringify([[10,4],[17,4],[25,4],[37,2],[40,2],[45,2]])
        if(originalPlan && parsed.geometry.R===173.5 && parsed.material.bandWidth*parsed.material.strandCount===20){
          parsed.plan.spiral=parsed.plan.spiral.map(g=>g.angle===45&&g.splineEndRadius===undefined?{...g,splineEndRadius:163}:g)
          if(parsed.constraint.manualSpiralEstimate===undefined)parsed.constraint.manualSpiralEstimate=14
          if(parsed.constraint.manualHoopEstimate===undefined)parsed.constraint.manualHoopEstimate=24
        }
        return parsed
      }
    }
  } catch {
    /* 隐私模式/无 localStorage：忽略，用默认模板 */
  }
  return defaultInput()
}

export function useDesign() {
  const [input, setInput] = useState<DesignInput>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(input))
    } catch {
      /* ignore */
    }
  }, [input])

  const patch = useCallback(
    <K extends keyof DesignInput>(key: K, value: Partial<DesignInput[K]>) =>
      setInput((s) => ({ ...s, [key]: { ...(s[key] as object), ...value } })),
    [],
  )
  const setGeometry = useCallback((v: Partial<GeometryInput>) => patch('geometry', v), [patch])
  const setPlan = useCallback((plan: LayupPlan) => setInput((s) => ({ ...s, plan })), [])
  /** 恢复默认模板 */
  const reset = useCallback(() => setInput(defaultInput()), [])

  const result = useMemo(() => runCheck(input), [input])

  return { input, setInput, patch, setGeometry, setPlan, reset, result }
}

export type DesignStore = ReturnType<typeof useDesign>
