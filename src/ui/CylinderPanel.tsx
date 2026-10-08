/** CylinderPanel.tsx — 筒身铺层表（核心交互件，规划 §6.2）：行数不限、可滚动、改动即时刷新 */
import type { DesignStore } from '../state/store'
import { CYL_COLOR } from './colors'

const n = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export function CylinderPanel({ store }: { store: DesignStore }) {
  const { input, setPlan, result } = store
  const cy = result.cylinder
  const pb = result.derived.pb
  const spiral = [...input.plan.spiral].sort((a, b) => a.angle - b.angle)

  const setLayers = (angle: number, layers: number) => {
    const next = spiral
      .map((g) => (g.angle === angle ? { ...g, layers: Math.max(0, layers) } : { ...g }))
      .filter((g) => g.layers > 0)
    setPlan({ spiral: next, hoop: input.plan.hoop })
  }
  const removeGroup = (angle: number) =>
    setPlan({ spiral: spiral.filter((g) => g.angle !== angle), hoop: input.plan.hoop })
  const addGroup = () => {
    const v = window.prompt('新增角度组的缠绕角（度）与层数，例如 "50 2"', '50 2')
    if (v === null) return
    const [a, l] = v.split(/[\s,]+/).map(Number)
    if (!Number.isFinite(a) || a <= 0 || a >= 90) return
    if (spiral.some((g) => Math.abs(g.angle - a) < 1e-9)) return
    setPlan({ spiral: [...spiral, { angle: a, layers: Math.max(2, Math.round(l || 2)) }], hoop: input.plan.hoop })
  }
  const setHoop = (layers: number) => setPlan({ spiral, hoop: Math.max(0, layers) })

  const rowOf = (angle: number) => cy.rows.find((r) => Math.abs(r.angle - angle) < 1e-9)

  return (
    <div className="card">
      <h3>
        筒身铺层方案
        <span className="tail">网格理论 · 层数不限，滚动编辑，改动即时刷新（螺旋层 ±成对，故应为偶数）</span>
      </h3>
      <div className="tablewrap">
        <table className="grid">
          <thead>
            <tr>
              <th>角度</th>
              <th>类型</th>
              <th>层数（步进可调）</th>
              <th>pα 贡献 /MPa</th>
              <th>pθ 贡献 /MPa</th>
              <th>厚度 /mm</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {spiral.map((g) => {
              const r = rowOf(g.angle)
              const odd = g.layers % 2 === 1
              return (
                <tr key={g.angle}>
                  <td className="angle" style={{ color: CYL_COLOR[g.angle] ?? undefined }}>
                    {g.angle}°
                  </td>
                  <td className="tag">螺旋</td>
                  <td>
                    <span className="stepper">
                      <button onClick={() => setLayers(g.angle, g.layers - 1)}>−</button>
                      <input
                        type="number"
                        value={g.layers}
                        min={0}
                        onChange={(e) => setLayers(g.angle, Math.round(Number(e.target.value) || 0))}
                      />
                      <button onClick={() => setLayers(g.angle, g.layers + 1)}>＋</button>
                    </span>
                    {odd && <span className="tag" style={{ color: '#d97706' }}> ⚠非偶</span>}
                  </td>
                  <td>{n(r?.paSum ?? 0)}</td>
                  <td>{n(r?.pthSum ?? 0)}</td>
                  <td>{n(g.layers * result.derived.tc)}</td>
                  <td>
                    <button className="btn sm ghost" onClick={() => removeGroup(g.angle)} title="删除该角度组">
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
            <tr>
              <td className="angle">90°</td>
              <td className="tag">环向</td>
              <td>
                <span className="stepper">
                  <button onClick={() => setHoop(input.plan.hoop - 1)}>−</button>
                  <input
                    type="number"
                    value={input.plan.hoop}
                    min={0}
                    onChange={(e) => setHoop(Math.round(Number(e.target.value) || 0))}
                  />
                  <button onClick={() => setHoop(input.plan.hoop + 1)}>＋</button>
                </span>
              </td>
              <td className="tag">0.00</td>
              <td className={cy.pthPass ? 'ok' : 'bad'}>{n(cy.rows.find((r) => r.type === 'hoop')?.pthSum ?? 0)}</td>
              <td>{n(cy.hoopThickness)}</td>
              <td className="tag">上不了封头</td>
            </tr>
            <tr className="sub">
              <td colSpan={2}>分组小计</td>
              <td>
                螺旋 {cy.spiralLayers} 层 / 环向 {cy.hoopLayers} 层
              </td>
              <td />
              <td />
              <td>
                螺旋 {n(cy.spiralThickness)} + 环向 {n(cy.hoopThickness)}
              </td>
              <td />
            </tr>
            <tr className="total">
              <td colSpan={2}>合计</td>
              <td>{cy.spiralLayers + cy.hoopLayers} 层</td>
              <td className={cy.paPass ? 'ok' : 'bad'}>{n(cy.pa)}</td>
              <td className={cy.pthPass ? 'ok' : 'bad'}>{n(cy.pth)}</td>
              <td>{n(cy.totalThickness)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={addGroup}>
          ＋ 添加角度组
        </button>
        <span className="tag">
          设计爆压 pb = {n(pb, 1)} MPa；单层厚 tc = {n(result.derived.tc, 4)} mm；σ发挥 螺旋 {n(result.derived.sigmaSpiral, 0)} / 环向{' '}
          {n(result.derived.sigmaHoop, 0)} MPa
        </span>
      </div>
      {result.advice.kind !== 'none' && (
        <div className={`banner ${result.verdict === 'fail' ? 'err' : ''}`} style={{ marginTop: 10 }}>
          <span>💡</span>
          <div>
            <b>薄弱环诊断：</b>
            {result.advice.text}
            {result.advice.variants.length > 0 && (
              <div style={{ marginTop: 4 }}>
                试算：
                {result.advice.variants.map((v) => (
                  <span key={v.transfer} className="tag" style={{ marginRight: 10 }}>
                    置换 {v.transfer} 层 → min {v.minP.toFixed(1)}（r≈{v.minPR.toFixed(0)}）、r=R {v.pAtR.toFixed(1)}、pθ {v.pth.toFixed(1)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {result.diagnoses
        .filter((d) => d.level !== 'ok')
        .slice(0, 4)
        .map((d, i) => (
          <div key={i} className={`banner ${d.level === 'error' ? 'err' : ''}`} style={{ marginTop: 6 }}>
            <span>{d.level === 'error' ? '⛔' : '⚠'}</span>
            <div>{d.text}</div>
          </div>
        ))}
    </div>
  )
}
