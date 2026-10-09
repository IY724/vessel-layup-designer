/** Overview.tsx — 计算结果表（判定与关键数值） */
import type { CheckResult, DesignInput } from '../core/types'
import { effectiveRBoss } from '../core/checker'

const n2 = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

function Row(props: { k: string; v: string; unit?: string; note?: string; cls?: '' | 'ok' | 'bad' }) {
  return (
    <tr>
      <td>{props.k}</td>
      <td className={props.cls}>{props.v}</td>
      <td style={{ textAlign: 'left', color: '#64748b' }}>{props.unit ?? ''}</td>
      <td style={{ textAlign: 'left', color: '#64748b', whiteSpace: 'normal' }}>{props.note ?? ''}</td>
    </tr>
  )
}

export function Overview({ result, input }: { result: CheckResult; input: DesignInput }) {
  const { cylinder: cy, dome, derived } = result
  const pb = derived.pb
  const last = dome.profile[dome.profile.length - 1]
  const verdict = result.verdict === 'pass' ? '满足' : result.verdict === 'adjust' ? '待调整' : '不满足'
  const margin = Math.min(cy.paMargin, cy.pthMargin)

  return (
    <div className="card">
      <h3>
        计算结果
        <span className="tail">
          封头判定范围 r ∈ [{n2(effectiveRBoss(input), 1)}, {n2(input.geometry.R, 1)}] mm ·{' '}
          {input.refMode === 'corrected' ? '封头算法：正确算法' : '封头算法：参考表原算法（仅对账）'}
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
              <td>综合判定</td>
              <td colSpan={3} style={{ textAlign: 'left' }}>
                <span className={`verdict ${result.verdict}`}>{verdict}</span>
                <span className="tag" style={{ marginLeft: 10 }}>
                  筒身 {cy.paPass && cy.pthPass ? '满足' : '不足'}；封头 {dome.pass ? '满足' : '有薄弱处'}
                </span>
              </td>
            </tr>
            <Row k="纵向爆破压强 pα" v={n2(cy.pa)} unit="MPa" cls={cy.paPass ? 'ok' : 'bad'} note={`需 ≥ ${n2(pb, 1)}；裕度 ${cy.paMargin >= 0 ? '+' : ''}${n2(cy.paMargin * 100, 1)}%`} />
            <Row k="环向爆破压强 pθ" v={n2(cy.pth)} unit="MPa" cls={cy.pthPass ? 'ok' : 'bad'} note={`需 ≥ ${n2(pb, 1)}；其中环向层贡献 ${n2(cy.rows[cy.rows.length - 1]?.pthSum ?? 0)}`} />
            <Row k="筒身最小裕度" v={`${margin >= 0 ? '+' : ''}${n2(margin * 100, 1)}`} unit="%" note="取纵向、环向中较差的一个" />
            <Row k="筒身总厚度" v={n2(cy.totalThickness)} unit="mm" note={`螺旋 ${n2(cy.spiralThickness)} + 环向 ${n2(cy.hoopThickness)}`} />
            <Row k="封头最低爆压" v={n2(dome.minP, 1)} unit="MPa" cls={dome.pass ? 'ok' : 'bad'} note={`需 ≥ ${n2(pb, 1)}；出现在 r≈${n2(dome.minPR, 1)} mm`} />
            <Row k="封头赤道处爆压" v={n2(last ? last.pTotal : 0, 1)} unit="MPa" note="与筒身螺旋层衔接的位置" />
            <Row k="封头赤道处总厚" v={n2(dome.tAtR)} unit="mm" cls={result.consistency.ok ? '' : 'bad'} note={`筒身螺旋层厚 ${n2(cy.spiralThickness)}；偏差 ${result.consistency.diff >= 0 ? '+' : ''}${n2(result.consistency.diff, 3)}`} />
            <Row k="极孔侧参考值" v={n2(dome.minPAll, 1)} unit="MPa" note={`r ∈ [${n2(dome.rFirst, 1)}, ${n2(effectiveRBoss(input), 1)})，仅部分角度铺到，只列示不判定`} />
            <Row k="复材重量（参考）" v={n2(result.weight.totalKg)} unit="kg" note={`筒身 ${n2(result.weight.cylinderKg)} + 两个封头 ${n2(result.weight.domeKg)}，密度 ${n2(result.weight.rhoComposite)} g/cm³`} />
          </tbody>
        </table>
      </div>
    </div>
  )
}
