/** 扩孔选角沿用前面的几何、工艺和筒身初算结果；不重复编辑上游参数。 */
import { useState } from 'react'
import type { DesignInput } from '../core/types'
import { autoDesign } from '../core/designer'
import { prepareExpansion } from '../core/expansion'
import { expandedLayerCounts } from '../core/initialDesign'
import { ExpansionPicker } from './ExpansionPicker'
import { Modal } from './Modal'

export function AutoDesignModal({ input, onApply, onClose }: { input: DesignInput; onApply: (next: DesignInput) => void; onClose: () => void }) {
  const [d, setD] = useState(() => prepareExpansion({ ...input, constraint: { ...input.constraint,
    manualSpiralEstimate: null, manualHoopEstimate: null, preserveCourseSelections: false } }))
  const [error, setError] = useState('')
  const allocation = expandedLayerCounts(d, d.constraint.candidates.length)
  const initial = allocation.initial
  const run = () => {
    const out = autoDesign(d)
    if (!out.ok) { setError(out.reason); return }
    onApply({ ...d, plan: out.plan })
    onClose()
  }
  return <Modal title="自动生成铺层方案" onClose={onClose} className="auto-design">
    <div className="hint initial-summary">筒身初算：螺旋 {Number.isFinite(initial.spiral) ? initial.spiral : '—'} 层，环向 {Number.isFinite(initial.hoop) ? initial.hoop : '—'} 层</div>
    <ExpansionPicker input={d} onChange={candidates => setD(s => ({ ...s, constraint: { ...s.constraint, candidates, angleRule: 'manual' } }))} />
    {allocation.added > 0 && <div className="hint allocation-advice">所选{d.constraint.candidates.length}组螺旋层至少需要{allocation.spiral}层，生成时按{allocation.spiral}层分配。</div>}
    {!initial.pass && <div className="hint warn">请先完成筒身层数计算。</div>}
    {error && <div className="banner err">{error}</div>}
    <div className="dlg-foot">
      <button className="btn primary" disabled={!initial.pass || !d.constraint.candidates.length} onClick={run}>生成并填入</button>
      <button className="btn" onClick={onClose}>取消</button>
    </div>
  </Modal>
}
