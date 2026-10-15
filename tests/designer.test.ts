/**
 * designer.test.ts — 自动铺层方案生成的行为约束
 *
 * 关注三件事：① 生成的方案必须满足筒身双向要求；② 螺旋层成对（偶数）；
 * ③ 不可行时明确报缺口而不是静默给出欠强方案。
 */
import { describe, expect, it } from 'vitest'
import { autoDesign, pickAlternate } from '../src/core/designer'
import { runCheck } from '../src/core/checker'
import { defaultInput, blankInput } from '../src/core/presets'
import { cylinderCheck } from '../src/core/netting'
import { deriveParams } from '../src/core/materials'
import type { DesignInput } from '../src/core/types'

const withPlan = (input: DesignInput, plan: DesignInput['plan']) => ({ ...input, plan })

describe('候选角"隔一取一"（课件经验规则）', () => {
  it('等差序列隔一个抽取，且保留首尾', () => {
    expect(pickAlternate([10, 12, 15, 17, 20, 25, 30, 37, 40, 45])).toEqual([10, 15, 20, 30, 40, 45])
    expect(pickAlternate([10, 20])).toEqual([10, 20])
    expect(pickAlternate([10, 20, 30])).toEqual([10, 20, 30])
  })
})

describe('自动生成', () => {
  const base = blankInput()

  it('从空方案生成满足双向要求的铺层', () => {
    const out = autoDesign({ ...base, plan: { spiral: [], hoop: 0 } })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const res = runCheck(withPlan(base, out.plan))
    expect(res.cylinder.pa).toBeGreaterThanOrEqual(res.derived.pb)
    expect(res.cylinder.pth).toBeGreaterThanOrEqual(res.derived.pb)
    expect(out.trace.length).toBeGreaterThan(3)
  })

  it('螺旋层保持偶数（±成对）', () => {
    const out = autoDesign({ ...base, plan: { spiral: [], hoop: 0 } })
    if (!out.ok) throw new Error(out.reason)
    expect(out.plan.spiral.every((g) => g.layers % 2 === 0)).toBe(true)
  })

  it('关闭偶数约束后允许奇数层，且结果不厚于强制偶数', () => {
    const even = autoDesign({ ...base, plan: { spiral: [], hoop: 0 } })
    const free = autoDesign({
      ...base,
      constraint: { ...base.constraint, forceEvenSpiral: false },
      plan: { spiral: [], hoop: 0 },
    })
    if (!even.ok || !free.ok) throw new Error('生成失败')
    const th = (p: DesignInput['plan']) => cylinderCheck(p, {
      R: base.geometry.R, tf: deriveParams(base).tf, tc: deriveParams(base).tc,
      sigmaSpiral: deriveParams(base).sigmaSpiral, sigmaHoop: deriveParams(base).sigmaHoop,
      pb: deriveParams(base).pb, alphaRef: 20,
    }).totalThickness
    expect(th(free.plan)).toBeLessThanOrEqual(th(even.plan) + 1e-6)
  })

  it('生成的方案不会厚于课程手工方案（等强度目标下更省料）', () => {
    const out = autoDesign({ ...base, plan: { spiral: [], hoop: 0 } })
    if (!out.ok) throw new Error(out.reason)
    const auto = runCheck(withPlan(base, out.plan)).cylinder.totalThickness
    const course = runCheck(defaultInput()).cylinder.totalThickness
    expect(auto).toBeLessThan(course)
  })

  it('候选角集为空时明确报错，不返回半成品', () => {
    const out = autoDesign({
      ...base,
      constraint: { ...base.constraint, candidates: [] },
      plan: { spiral: [], hoop: 0 },
    })
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('应失败')
    expect(out.reason).toContain('候选螺旋角集为空')
  })

  it('要求高到角集无法承担时报出缺口方向与数值', () => {
    const out = autoDesign({
      ...base,
      requirement: { ...base.requirement, pbMode: 'direct', pb: 400 },
      constraint: { ...base.constraint, candidates: [5, 6] },
      plan: { spiral: [], hoop: 0 },
    })
    // 400 MPa 对 5/6° 角集：纵向够但环向几乎为零 → 应判不可行或给出极厚方案
    if (out.ok) {
      const res = runCheck(withPlan(base, out.plan))
      expect(res.cylinder.pa).toBeGreaterThanOrEqual(400)
      expect(res.cylinder.pth).toBeGreaterThanOrEqual(400)
    } else {
      expect(out.reason).toMatch(/缺口|无法同时满足/)
    }
  })

  it('封头反馈使用课件经验初估，并保留筒身双向约束', () => {
    const out = autoDesign({ ...base, plan: { spiral: [], hoop: 0 } })
    if (!out.ok) throw new Error(out.reason)
    const trace = out.trace.join(' ')
    const last = runCheck(withPlan(base, out.plan))
    expect(trace).toMatch(/封头经验初估|封头初估/)
    expect(trace).not.toMatch(/窗口|固有低载区|预计 min/)
    expect(last.cylinder.paPass && last.cylinder.pthPass).toBe(true)
    expect(out.verdict).toBe(last.verdict)
  })
})
