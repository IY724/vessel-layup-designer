import type { DesignInput } from '../core/types'
import { deriveParams } from '../core/materials'
import { defaultAngles, expansionAngles } from '../core/expansion'

export function ExpansionPicker({ input, onChange }: { input: DesignInput; onChange: (angles: number[]) => void }) {
  const d = deriveParams(input)
  const computed = expansionAngles(input.geometry.R, d.r0, d.bandTotal)
  const selected = input.constraint.candidates
  const extras = selected.filter(a => !computed.some(r => Math.abs(r.angle - a) < 1e-8))
    .map(angle => ({ angle, diameter: 2 * input.geometry.R * Math.sin(angle * Math.PI / 180), boundary: false }))
  const rows = [...computed, ...extras].sort((a, b) => a.angle - b.angle)
  const available = rows.filter(r => !r.boundary).map(r => r.angle)
  const toggle = (angle: number, checked: boolean) => onChange(checked ? [...new Set([...selected, angle])].sort((a, b) => a - b) : selected.filter(a => a !== angle))
  return <div className="expansion-picker">
    <div className="pane-actions">
      <button className="btn sm" onClick={() => onChange(defaultAngles(computed.map(r => r.angle)))}>默认跳选8个</button>
      <button className="btn sm" onClick={() => onChange(available)}>全选</button>
      <button className="btn sm" onClick={() => onChange([])}>清空选择</button>
      <b className="selection-count" aria-live="polite">已选 {selected.length} 个螺旋角度</b>
    </div>
    <div className="tablewrap expansion-table">
      <table className="grid"><thead><tr><th>选用</th><th>极孔直径 / mm</th><th>螺旋角 / °</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.angle} className={selected.includes(row.angle) ? 'selected-angle' : ''}>
          <td><input type="checkbox" aria-label={`选用${row.angle.toFixed(3)}°螺旋角`} disabled={row.boundary} checked={!row.boundary && selected.includes(row.angle)} onChange={e => toggle(row.angle, e.target.checked)} /></td>
          <td>{row.diameter.toFixed(3)}</td><td>{row.angle.toFixed(3)}</td>
        </tr>)}</tbody></table>
    </div>
    {!computed.length && <div className="hint warn">请先填写有效的筒身半径、极孔半径和总带宽。扩孔候选超过10000个时，请增大带宽。</div>}
  </div>
}
