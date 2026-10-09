/**
 * AutoDesignModal.tsx — 自动生成铺层
 *
 * 交互约定：所有驱动参数就在弹窗里给（值从当前表单带入、可就地改），点"生成并填入"后
 * 算出的铺层方案直接写回表单并关闭弹窗——不额外弹提示、不显示过程流水。
 * 参数缺失或不合法时：对应输入框标红并在下方列出缺哪一项，生成按钮不可用。
 */
import { useMemo, useState } from 'react'
import type { DesignInput } from '../core/types'
import { autoDesign } from '../core/designer'
import { deriveParams } from '../core/materials'
import { Chips } from './fields'
import { sym } from './Sym'

const f = (v: number, n = 4) => (Number.isFinite(v) ? v.toFixed(n).replace(/\.?0+$/, '') : '—')

/** 弹窗里可编辑的字段路径 */
type Key =
  | 'R'
  | 'r0'
  | 'pb'
  | 'workingPressure'
  | 'safetyFactor'
  | 'tex'
  | 'fiberDensity'
  | 'bandWidth'
  | 'strandCount'
  | 'vf'
  | 'sigmaNOL'
  | 'kLoss'
  | 'sigmaSpiralDirect'
  | 'sigmaHoopDirect'
  | 'candidates'

export function AutoDesignModal({ input, onApply, onClose }: { input: DesignInput; onApply: (next: DesignInput) => void; onClose: () => void }) {
  const [d, setD] = useState<DesignInput>(() => JSON.parse(JSON.stringify(input)) as DesignInput)
  const [err, setErr] = useState<string>('')

  const dp = deriveParams(d)

  /** 生成所必需的参数：任一缺失即标红，不允许"带着空格子"去算 */
  const missing = useMemo(() => {
    const out = new Set<Key>()
    const g = d.geometry
    const m = d.material
    const s = d.strength
    const r = d.requirement
    const add = (k: Key, bad: boolean) => {
      if (bad) out.add(k)
    }
    add('R', !(g.R > 0))
    add('r0', !(g.r0Winding > 0) || g.r0Winding >= g.R)
    if (r.pbMode === 'direct') add('pb', !(r.pb > 0))
    else {
      add('workingPressure', !(r.workingPressure > 0))
      add('safetyFactor', !(r.safetyFactor > 0))
    }
    add('tex', !(m.tex > 0))
    add('fiberDensity', !(m.fiberDensity > 0))
    add('bandWidth', !(m.bandWidth > 0))
    add('strandCount', !(m.strandCount > 0))
    add('vf', !(m.vf > 0 && m.vf < 1))
    if (s.mode === 'A') {
      add('sigmaNOL', !(s.sigmaNOL > 0))
      add('kLoss', !(s.kLoss > 0))
    } else {
      add('sigmaSpiralDirect', !(s.sigmaSpiralDirect > 0))
      add('sigmaHoopDirect', !(s.sigmaHoopDirect > 0))
    }
    add('candidates', d.constraint.candidates.length === 0)
    return out
  }, [d])

  const missingLabels: Array<[Key, string]> = [
    ['R', '筒身段半径 R'],
    ['r0', '缠绕极孔半径（要小于 R）'],
    ['pb', '设计爆压'],
    ['workingPressure', '工作压力'],
    ['safetyFactor', '安全系数'],
    ['tex', '线密度 tex'],
    ['fiberDensity', '纤维密度'],
    ['bandWidth', '缠绕带宽'],
    ['strandCount', '每束纱数'],
    ['vf', '纤维体积含量（0~1）'],
    ['sigmaNOL', 'NOL 环拉伸强度'],
    ['kLoss', '强度损失系数'],
    ['sigmaSpiralDirect', '螺旋层发挥强度'],
    ['sigmaHoopDirect', '环向层发挥强度'],
    ['candidates', '候选螺旋角（至少一个）'],
  ]
  const need = missingLabels.filter(([k]) => missing.has(k)).map(([, t]) => t)

  const geo = (patch: Partial<DesignInput['geometry']>) => setD((s) => ({ ...s, geometry: { ...s.geometry, ...patch } }))
  const mat = (patch: Partial<DesignInput['material']>) => setD((s) => ({ ...s, material: { ...s.material, ...patch } }))
  const str = (patch: Partial<DesignInput['strength']>) => setD((s) => ({ ...s, strength: { ...s.strength, ...patch } }))
  const req = (patch: Partial<DesignInput['requirement']>) => setD((s) => ({ ...s, requirement: { ...s.requirement, ...patch } }))
  const con = (patch: Partial<DesignInput['constraint']>) => setD((s) => ({ ...s, constraint: { ...s.constraint, ...patch } }))

  const run = () => {
    setErr('')
    if (need.length) {
      setErr(`这些参数还没填好：${need.join('、')}`)
      return
    }
    const out = autoDesign(d)
    if (!out.ok) {
      setErr(`按当前参数得不到可行铺层：${out.reason}`)
      return
    }
    onApply({ ...d, plan: out.plan })
    onClose()
  }

  const N = (props: {
    k: Key
    label: string
    value: number
    unit?: string
    step?: number
    on: (v: number) => void
    tail?: string
  }) => (
    <div className="field">
      <span className="lbl">{sym(props.label)}</span>
      <input
        type="number"
        step={props.step ?? 1}
        className={missing.has(props.k) ? 'missing' : undefined}
        value={props.value}
        onChange={(e) => props.on(e.target.value === '' ? 0 : Number(e.target.value))}
      />
      <span className="unit">{props.unit ?? props.tail ?? ''}</span>
    </div>
  )

  return (
    <div className="modal" onClick={onClose}>
      <div className="box narrow" onClick={(e) => e.stopPropagation()}>
        <header>
          <b>自动生成铺层方案</b>
          <button className="btn sm" onClick={onClose}>
            关闭
          </button>
        </header>
        <div>
          <div className="dlg-grid">
            <div className="dlg-sec">目标</div>
            <N k="R" label="筒身段半径 R" value={d.geometry.R} unit="mm" step={0.5} on={(v) => geo({ R: v })} />
            <N k="r0" label="缠绕极孔半径" value={d.geometry.r0Winding} unit="mm" step={0.5} on={(v) => geo({ r0Winding: v })} />
            <div className="field span">
              <span className="lbl">爆破压强怎么给</span>
              <div className="radios">
                <label>
                  <input type="radio" checked={d.requirement.pbMode === 'direct'} onChange={() => req({ pbMode: 'direct' })} />
                  直接填设计爆压
                </label>
                <label>
                  <input type="radio" checked={d.requirement.pbMode === 'wp_sf'} onChange={() => req({ pbMode: 'wp_sf' })} />
                  工作压力 × 安全系数
                </label>
              </div>
              <span className="unit" />
            </div>
            {d.requirement.pbMode === 'direct' ? (
              <N k="pb" label="设计爆压 pb" value={d.requirement.pb} unit="MPa" step={1} on={(v) => req({ pb: v })} />
            ) : (
              <>
                <N k="workingPressure" label="工作压力" value={d.requirement.workingPressure} unit="MPa" step={1} on={(v) => req({ workingPressure: v })} />
                <N k="safetyFactor" label="安全系数" value={d.requirement.safetyFactor} step={0.01} on={(v) => req({ safetyFactor: v })} />
              </>
            )}

            <div className="dlg-sec">纤维与工艺</div>
            <N k="tex" label="线密度 tex" value={d.material.tex} unit="g/m" step={0.05} on={(v) => mat({ tex: v })} />
            <N k="fiberDensity" label="纤维密度" value={d.material.fiberDensity} unit="g/cm³" step={0.05} on={(v) => mat({ fiberDensity: v })} />
            <N k="bandWidth" label="单束带宽 b" value={d.material.bandWidth} unit="mm" step={0.5} on={(v) => mat({ bandWidth: v })} />
            <N k="strandCount" label="每束纱数 n" value={d.material.strandCount} unit={`→ ${f(dp.bandTotal, 1)} mm`} step={1} on={(v) => mat({ strandCount: v })} />
            <N k="vf" label="纤维体积含量 Vf" value={d.material.vf} step={0.01} on={(v) => mat({ vf: v })} />
            <div className="hint span">
              单层纤维厚 tf = <b>{f(dp.tf)}</b> mm，含树脂单层厚 tc = <b>{f(dp.tc)}</b> mm（生成时按这个厚度累加）
            </div>

            <div className="dlg-sec">强度</div>
            <div className="field span">
              <span className="lbl">强度怎么给</span>
              <div className="radios">
                <label>
                  <input type="radio" checked={d.strength.mode === 'A'} onChange={() => str({ mode: 'A' })} />
                  由 NOL 环强度换算
                </label>
                <label>
                  <input type="radio" checked={d.strength.mode === 'B'} onChange={() => str({ mode: 'B' })} />
                  直接给定发挥强度
                </label>
              </div>
              <span className="unit" />
            </div>
            {d.strength.mode === 'A' ? (
              <>
                <N k="sigmaNOL" label="NOL 环拉伸强度 σ_NOL" value={d.strength.sigmaNOL} unit="MPa" step={5} on={(v) => str({ sigmaNOL: v })} />
                <N k="kLoss" label="强度损失系数 k" value={d.strength.kLoss} step={0.01} on={(v) => str({ kLoss: v })} tail="常用 0.8~0.9" />
              </>
            ) : (
              <>
                <N k="sigmaSpiralDirect" label="螺旋层发挥强度" value={d.strength.sigmaSpiralDirect} unit="MPa" step={5} on={(v) => str({ sigmaSpiralDirect: v })} />
                <N k="sigmaHoopDirect" label="环向层发挥强度" value={d.strength.sigmaHoopDirect} unit="MPa" step={5} on={(v) => str({ sigmaHoopDirect: v })} />
              </>
            )}
            <div className="hint span">
              纤维发挥强度 螺旋 <b>{f(dp.sigmaSpiral, 1)}</b> / 环向 <b>{f(dp.sigmaHoop, 1)}</b> MPa，复材层强度 <b>{f(dp.sigmaComposite, 1)}</b> MPa，
              目标爆压 <b>{f(dp.pb, 2)}</b> MPa
            </div>

            <div className="dlg-sec">铺层怎么铺</div>
            <div className="span">
              <div className="field" style={{ marginBottom: 2 }}>
                <span className="lbl">候选螺旋角</span>
                <span />
                <span />
              </div>
              <Chips items={d.constraint.candidates} onChange={(v) => con({ candidates: v })} />
              {missing.has('candidates') && <div className="hint warn">至少要有一个候选角</div>}
            </div>
            <div className="field">
              <span className="lbl">角度取法</span>
              <select value={d.constraint.angleRule} onChange={(e) => con({ angleRule: e.target.value as 'alternate' | 'manual' })}>
                <option value="alternate">隔一个取一个（层数少、铺得开）</option>
                <option value="manual">候选角全用</option>
              </select>
              <span className="unit" />
            </div>
            <div className="field">
              <span className="lbl">初估参考角</span>
              <input type="number" step={1} value={d.constraint.alphaRef} onChange={(e) => con({ alphaRef: Number(e.target.value) || 0 })} />
              <span className="unit">°</span>
            </div>
            <div className="radios span">
              <label>
                <input
                  type="checkbox"
                  checked={d.constraint.forceEvenSpiral}
                  onChange={(e) => con({ forceEvenSpiral: e.target.checked })}
                />
                螺旋层数取偶数（±角成对，缠绕工艺要求）
              </label>
            </div>
          </div>

          {err && (
            <div className="banner err" style={{ marginTop: 12 }}>
              {err}
            </div>
          )}

          <div className="dlg-foot">
            <button className="btn primary" onClick={run} disabled={need.length > 0}>
              生成并填入
            </button>
            <button className="btn" onClick={onClose}>
              取消
            </button>
            <span className="tag">
              {need.length ? `还有 ${need.length} 项待处理` : '参数齐了，生成后直接写入铺层表'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
