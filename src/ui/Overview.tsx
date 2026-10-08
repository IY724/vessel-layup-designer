/** Overview.tsx — 综合判定与指标卡（规划 §6.1） */
import type { CheckResult, DesignInput } from '../core/types'

const n2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—')
const n1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '—')

export function Overview({ result, input }: { result: CheckResult; input: DesignInput }) {
  const { cylinder: cy, dome, derived } = result
  const pb = derived.pb
  const verdictText =
    result.verdict === 'pass' ? '方案满足' : result.verdict === 'adjust' ? '待调整' : '不满足'
  const last = dome.profile[dome.profile.length - 1]

  return (
    <div className="cards">
      <div className={`card metric verdict ${result.verdict === 'pass' ? 'ok pass' : result.verdict === 'fail' ? 'bad fail' : ''}`}>
        <div className="t">综合判定</div>
        <div style={{ margin: '4px 0' }}>
          <span className="badge">
            {result.verdict === 'pass' ? '✓ ' : result.verdict === 'adjust' ? '⚠ ' : '✗ '}
            {verdictText}
          </span>
        </div>
        <ul>
          <li>筒身 {cy.paPass && cy.pthPass ? '✓ 满足' : '✗ 不足'}</li>
          <li>封头 {dome.pass ? '✓ 满足' : '△ 存在薄弱环'}</li>
        </ul>
      </div>

      <div className={`metric ${cy.paPass ? 'ok' : 'bad'}`}>
        <div className="t">纵向爆压 pα</div>
        <div className="v">
          {n2(cy.pa)} <small>MPa</small>
        </div>
        <div className="s">
          {cy.paPass ? '✓' : '✗'} ≥ pb {n1(pb)}（单层贡献见铺层表）
        </div>
      </div>

      <div className={`metric ${cy.pthPass ? 'ok' : 'bad'}`}>
        <div className="t">环向爆压 pθ</div>
        <div className="v">
          {n2(cy.pth)} <small>MPa</small>
        </div>
        <div className="s">
          {cy.pthPass ? '✓' : '✗'} ≥ pb {n1(pb)}（含环向层 {n2(cy.rows[cy.rows.length - 1]?.pthSum ?? 0)}）
        </div>
      </div>

      <div className="metric">
        <div className="t">筒身爆压裕度</div>
        <div className="v">
          {cy.paPass && cy.pthPass ? '+' : ''}
          {n1(Math.min(cy.paMargin, cy.pthMargin) * 100)} <small>%</small>
        </div>
        <div className="s">min(pα, pθ) ÷ pb − 1</div>
      </div>

      <div className="metric">
        <div className="t">筒身总厚度</div>
        <div className="v">
          {n2(cy.totalThickness)} <small>mm</small>
        </div>
        <div className="s">
          螺旋 {n2(cy.spiralThickness)} + 环向 {n2(cy.hoopThickness)}
        </div>
      </div>

      <div className={`metric ${dome.pass ? 'ok' : 'bad'}`}>
        <div className="t">封头最小爆压（判定窗口内）</div>
        <div className="v">
          {n1(dome.minP)} <small>MPa</small>
        </div>
        <div className="s">
          ⚠ @ r≈{n1(dome.minPR)}（×ks={input.requirement.ks} 口径）{' < ' + n1(pb)}
        </div>
      </div>

      <div className="metric">
        <div className="t">封头 r=R 处爆压</div>
        <div className="v">
          {n1(last ? last.pTotal : 0)} <small>MPa</small>
        </div>
        <div className="s">
          与筒身螺旋层衔接：t总(R)={n2(dome.tAtR)} vs {n2(cy.spiralThickness)} mm
        </div>
      </div>
    </div>
  )
}
