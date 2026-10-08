/**
 * store.ts — 单一状态源：输入 + 当前方案。
 * 任何改动 → core 纯函数全量重算（毫秒级）→ 判定/表格/封头曲线同时刷新，无隐藏状态。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DesignInput, GeometryInput, LayupPlan } from '../core/types'
import { runCheck } from '../core/checker'
import { PRESETS, courseCase } from '../core/presets'

const KEY = 'vessel-layup-designer.input.v1'

function load(): DesignInput {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DesignInput
      if (parsed?.geometry && parsed?.plan && parsed?.constraint) return parsed
    }
  } catch {
    /* 隐私模式/无 localStorage：忽略，用预设 */
  }
  return courseCase()
}

export function useDesign() {
  const [input, setInput] = useState<DesignInput>(load)
  const [presetId, setPresetId] = useState<string>('course140')

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
  const setPreset = useCallback((id: string) => {
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    setPresetId(id)
    setInput(p.make())
  }, [])
  const reset = useCallback(() => setInput(PRESETS.find((p) => p.id === presetId)?.make() ?? courseCase()), [presetId])

  const result = useMemo(() => runCheck(input), [input])

  return { input, setInput, patch, setGeometry, setPlan, setPreset, presetId, reset, result }
}

export type DesignStore = ReturnType<typeof useDesign>
