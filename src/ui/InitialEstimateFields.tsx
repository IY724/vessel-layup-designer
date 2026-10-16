import type { DesignInput } from '../core/types'
import { initialDesign } from '../core/initialDesign'

export function InitialEstimateFields({ input }: { input: DesignInput }) {
  const initial = initialDesign(input)
  const f = (v: number, places = 0) => Number.isFinite(v) ? v.toFixed(places) : '—'
  return <div className="estimate-fields">
    <div className="field">
      <span className="lbl">极孔反算角</span>
      <output>{Number.isFinite(initial.startAngle) ? initial.startAngle.toFixed(2) : '—'}</output>
      <span className="unit">°</span>
    </div>
    <div className="field">
      <span className="lbl">螺旋初估层数</span>
      <output aria-label="螺旋初估层数">{f(initial.spiral)}</output>
      <span className="unit">层</span>
    </div>
    <div className="field">
      <span className="lbl">环向初估层数</span>
      <output aria-label="环向初估层数">{f(initial.hoop)}</output>
      <span className="unit">层</span>
    </div>
    <div className={`hint initial-pressure ${initial.pass ? '' : 'warn'}`}>
      纵向 {f(initial.pa, 2)} / 环向 {f(initial.pth, 2)} MPa · {initial.pass ? '满足' : '请检查参数'}
    </div>
  </div>
}
