/** Overview.tsx — 计算结果表（判定与关键数值） */
import type { CheckResult, DesignInput } from '../core/types'
import { FormulaHelp } from './FormulaHelp'
import { sym } from './Sym'

const n2 = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

function Row(props: { k: string; v: string; unit?: string; note?: string; cls?: '' | 'ok' | 'bad' }) {
  return (
    <tr>
      <td>{sym(props.k)}</td>
      <td className={props.cls}>{props.v}</td>
      <td style={{ textAlign: 'left', color: '#64748b' }}>{props.unit ?? ''}</td>
      <td style={{ textAlign: 'left', color: '#64748b', whiteSpace: 'normal' }}>{sym(props.note ?? '')}</td>
    </tr>
  )
}

export function Overview({ result }: { result: CheckResult; input: DesignInput }) {
  const { cylinder: cy, dome, head, derived } = result
  const pb = derived.pb
  const last = dome.profile[dome.profile.length - 1]
  const verdict = result.verdict === 'pass' ? '满足' : result.verdict === 'adjust' ? '待调整' : '不满足'
  const margin = Math.min(cy.paMargin, cy.pthMargin)

  return (
    <div className="card">
      <h3>
        计算结果
        <span className="tail">
          封头经验初估
          <FormulaHelp
            title="判定与汇总公式"
            items={[
              { frm: 'p_\\alpha\\ge p_b,\\quad p_\\theta\\ge p_b', desc: '筒身：网格理论等厚，与筒身长度无关' },
              { frm: 'P_{b,h}=k_s\\sum_i\\dfrac{2\\sigma_{fb}n_it_f\\cos^2\\alpha_{0i}}{R}', desc: '筒身角 α₀、纯纤维厚度；经验初估' },
            ]}
          />
        </span>
      </h3>
      <div className="tablewrap" style={{ maxHeight: 'none', borderTop: 0, borderLeft: 0, borderRight: 0 }}>
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 190 }}>项目</th>
              <th style={{ width: 96 }}>数值</th>
              <th style={{ width: 56 }}>单位</th>
              <th style={{ textAlign: 'left' }}>要求 / 说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>初步计算判定</td>
              <td colSpan={3} style={{ textAlign: 'left' }}>
                <span className={`verdict ${result.verdict}`}>{verdict}</span>
                <span className="tag" style={{ marginLeft: 10 }}>
                  筒身 {cy.paPass && cy.pthPass ? '满足' : '不足'}；封头初估 {head.pass ? '满足' : '不足'}
                </span>
              </td>
            </tr>
            <Row k="纵向爆破压强 p_α" v={n2(cy.pa)} unit="MPa" cls={cy.paPass ? 'ok' : 'bad'} note={`需 ≥ p_b = ${n2(pb, 1)}；裕度 ${cy.paMargin >= 0 ? '+' : ''}${n2(cy.paMargin * 100, 1)}%`} />
            <Row k="环向爆破压强 p_θ" v={n2(cy.pth)} unit="MPa" cls={cy.pthPass ? 'ok' : 'bad'} note={`需 ≥ p_b = ${n2(pb, 1)}；其中环向层贡献 ${n2(cy.rows[cy.rows.length - 1]?.pthSum ?? 0)}`} />
            <Row k="筒身最小裕度" v={`${margin >= 0 ? '+' : ''}${n2(margin * 100, 1)}`} unit="%" note="取纵向、环向中较差的一个" />
            <Row k="筒身总厚度" v={n2(cy.totalThickness)} unit="mm" note={`螺旋 ${n2(cy.spiralThickness)} + 环向 ${n2(cy.hoopThickness)}`} />
            <Row k="封头经验初估" v={n2(head.pressure)} unit="MPa" cls={head.pass ? 'ok' : 'bad'} note={`需 ≥ ${n2(pb, 1)}；筒身角 α₀`} />
            <Row k="局部曲线最低值" v={n2(dome.minP, 3)} unit="MPa" note={`参考值；r=${n2(dome.minPR, 1)} mm，局部角 K`} />
            <Row k="局部曲线赤道值" v={n2(last ? last.pTotal : 0, 2)} unit="MPa" note="参考值" />
            <Row k="封头赤道处总厚" v={n2(dome.tAtR)} unit="mm" note={`筒身螺旋层厚 ${n2(cy.spiralThickness)}；偏差 ${result.consistency.diff >= 0 ? '+' : ''}${n2(result.consistency.diff, 3)}`} />
          </tbody>
        </table>
      </div>
    </div>
  )
}
