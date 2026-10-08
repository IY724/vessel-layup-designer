/** DetailView.tsx — 校核明细（逐格对表两张 Excel）+ 公式对照 + 原表问题清单 */
import type { CheckResult, DesignInput } from '../core/types'
import { CYLINDER_FORMULAS, DOME_FORMULAS, EXCEL_ISSUES } from '../core/excelRef'
import { effectiveRBoss } from '../core/checker'

const n = (v: number, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '—')

function KV(props: { rows: Array<[string, string]> }) {
  return (
    <div className="kv">
      {props.rows.map(([k, v]) => (
        <div key={k}>
          <span className="k">{k}</span>
          <span className="v">{v}</span>
        </div>
      ))}
    </div>
  )
}

export function DetailView({ input, result }: { input: DesignInput; result: CheckResult }) {
  const { derived: d, cylinder: cy, dome } = result
  const g = input.geometry
  const rBoss = effectiveRBoss(input)
  const step = Math.max(1, Math.round(dome.profile.length / 30))

  return (
    <div className="detail">
      <div className="grp">
        <b>① 参数区（对照 Excel「参数设置」A~C 列）</b>
        <KV
          rows={[
            ['筒身段半径 R', `${n(g.R, 3)} mm`],
            ['缠绕带宽 b（单束）', `${n(input.material.bandWidth, 3)} mm`],
            ['纤维体积含量 Vf', n(input.material.vf, 4)],
            ['纤维密度 ρ', `${n(input.material.fiberDensity, 3)} g/cm³`],
            ['线密度 tex', `${n(input.material.tex, 3)} g/m`],
            ['纤维单层厚 tf', `${n(d.tf, 7)} mm`],
            ['复材单层厚 tc', `${n(d.tc, 7)} mm`],
            ['设计爆破压强 pb', `${n(d.pb, 3)} MPa`],
            ['纤维发挥强度 σ（螺旋/环向）', `${n(d.sigmaSpiral, 2)} / ${n(d.sigmaHoop, 2)} MPa`],
            ['复材层强度 σc', `${n(d.sigmaComposite, 2)} MPa`],
            ['缠绕纤维根数 n → 总带宽', `${input.material.strandCount} → ${n(d.bandTotal, 2)} mm`],
            ['封头短半轴 h（记录）', `${n(g.headShortAxis, 1)} mm`],
            ['应力平衡系数 ks', n(input.requirement.ks, 3)],
            ['判定窗口下界 r_boss', `${n(rBoss, 2)} mm`],
            ['计算口径', input.refMode === 'corrected' ? '修正版 cos²α' : 'Excel 原样 cos(u·cos u)'],
          ]}
        />
      </div>

      <div className="grp">
        <b>② 筒身缠绕角参数与强度（对照「缠绕角度参数计算」H~L 列）</b>
        <div className="tablewrap" style={{ maxHeight: 240 }}>
          <table className="grid">
            <thead>
              <tr>
                <th>α</th>
                <th>cos²α</th>
                <th>sin²α</th>
                <th>层数</th>
                <th>pα 单层</th>
                <th>pθ 单层</th>
                <th>pα 多层</th>
                <th>pθ 多层</th>
                <th>厚度 mm</th>
              </tr>
            </thead>
            <tbody>
              {cy.rows.map((r) => (
                <tr key={r.angle}>
                  <td className="angle">{r.angle}°</td>
                  <td>{n(Math.cos((r.angle * Math.PI) / 180) ** 2)}</td>
                  <td>{n(Math.sin((r.angle * Math.PI) / 180) ** 2)}</td>
                  <td>{r.layers}</td>
                  <td>{n(r.paUnit)}</td>
                  <td>{n(r.pthUnit)}</td>
                  <td>{n(r.paSum)}</td>
                  <td>{n(r.pthSum)}</td>
                  <td>{n(r.thickness)}</td>
                </tr>
              ))}
              <tr className="total">
                <td colSpan={6}>合计（Excel I26 / J26 / I30 / J30 / K30）</td>
                <td>{n(cy.pa)}</td>
                <td>{n(cy.pth)}</td>
                <td>{n(cy.totalThickness)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <KV
          rows={[
            ['初估参考角 αref', `${n(input.constraint.alphaRef, 1)}°`],
            ['螺旋向厚度初估 h螺', `${n(cy.estimate.hSpiral)} mm → ${cy.estimate.nSpiral} 层`],
            ['环向厚度初估 h环', `${n(cy.estimate.hHoop)} mm → ${cy.estimate.nHoop} 层`],
            ['估算纤维总厚 / 复材总厚', `${n(cy.estimate.hTotal)} / ${n(cy.estimate.tComposite)} mm`],
          ]}
        />
      </div>

      <div className="grp">
        <b>③ 封头逐角度组参数（对照各角度 sheet 的 F~P 列与 m1~m4）</b>
        <div className="tablewrap" style={{ maxHeight: 260 }}>
          <table className="grid">
            <thead>
              <tr>
                <th>α</th>
                <th>层数</th>
                <th>循环数 I23</th>
                <th>r0</th>
                <th>rb</th>
                <th>r2b</th>
                <th>mR</th>
                <th>tR</th>
                <th>V1</th>
                <th>V2</th>
                <th>Vconst</th>
                <th>m1</th>
                <th>m2</th>
                <th>m3</th>
                <th>m4</th>
                <th>t总(R)</th>
                <th>p(R)×ks</th>
              </tr>
            </thead>
            <tbody>
              {dome.groups.map((gr) => {
                const i = dome.groups.indexOf(gr)
                const atR = dome.profile[dome.profile.length - 1]
                return (
                  <tr key={gr.angle}>
                    <td className="angle">{gr.angle}°</td>
                    <td>{gr.layers}</td>
                    <td>{gr.cycles}</td>
                    <td>{n(gr.r0)}</td>
                    <td>{n(gr.rb)}</td>
                    <td>{n(gr.r2b)}</td>
                    <td>{n(gr.mR)}</td>
                    <td>{n(gr.tR)}</td>
                    <td>{n(gr.V1, 3)}</td>
                    <td>{n(gr.V2, 3)}</td>
                    <td>{n(gr.Vconst, 3)}</td>
                    <td>{n(gr.m[0], 5)}</td>
                    <td>{n(gr.m[1], 6)}</td>
                    <td>{n(gr.m[2], 8)}</td>
                    <td>{n(gr.m[3], 11)}</td>
                    <td>{n(atR ? atR.tGroups[i] : 0)}</td>
                    <td>{n(atR ? atR.pGroups[i] * input.requirement.ks : 0)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {dome.failedGroups.length > 0 && (
          <div className="banner err">
            <span>⛔</span>
            <div>
              {dome.failedGroups.map((f) => (
                <div key={f.angle + f.reason}>
                  {f.angle}°：{f.reason}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grp">
        <b>④ 封头沿母线数值（对照「总厚度」「总爆破压强」两个 sheet）</b>
        <div className="tablewrap" style={{ maxHeight: 260 }}>
          <table className="grid">
            <thead>
              <tr>
                <th>r (mm)</th>
                {dome.groups.map((gr) => (
                  <th key={gr.angle}>{gr.angle}° 组厚</th>
                ))}
                <th>t总</th>
                <th>Σp_g</th>
                <th>p总×ks</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>
              {dome.profile
                .filter((_p, i) => i % step === 0 || i === dome.profile.length - 1)
                .map((p) => (
                  <tr key={p.r}>
                    <td>{p.r.toFixed(2)}</td>
                    {p.tGroups.map((t, i) => (
                      <td key={i}>{t.toFixed(4)}</td>
                    ))}
                    <td>{p.tTotal.toFixed(4)}</td>
                    <td>{p.pSum.toFixed(3)}</td>
                    <td>{p.pTotal.toFixed(3)}</td>
                    <td className={p.r < rBoss ? '' : p.pTotal >= d.pb ? 'ok' : 'bad'}>
                      {p.r < rBoss ? '接嘴区' : p.pTotal >= d.pb ? '✓' : '✗'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grp">
        <b>⑤ 公式对照（Excel 原文 ⇄ 软件实现）</b>
        <table className="formula">
          <tbody>
            {[...CYLINDER_FORMULAS, ...DOME_FORMULAS].map((f, i) => (
              <tr key={i}>
                <td style={{ width: 150 }}>{f.label}</td>
                <td style={{ width: 320, color: '#64748b' }}>{f.excel}</td>
                <td style={{ width: 260, color: '#1e3a5f' }}>{f.corrected}</td>
                <td style={{ color: f.note ? '#92700c' : '#cbd5e1' }}>{f.note || '一致'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grp">
        <b>⑥ 已核对出的原表问题</b>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {EXCEL_ISSUES.map((x) => (
            <li key={x.id} style={{ marginBottom: 4 }}>
              <b style={{ color: x.severity === '高' ? '#b91c1c' : x.severity === '中' ? '#92400e' : '#64748b' }}>[{x.severity}]</b> {x.where}：
              {x.text}
            </li>
          ))}
        </ul>
      </div>

      <div className="grp">
        <b>⑦ 一致性检查与全部诊断</b>
        <KV
          rows={[
            ['封头 t总(R)', `${n(result.consistency.domeSpiralAtR)} mm`],
            ['筒身螺旋层厚', `${n(result.consistency.cylinderSpiral)} mm`],
            ['衔接偏差', `${result.consistency.diff >= 0 ? '+' : ''}${n(result.consistency.diff)} mm ${result.consistency.ok ? '✓' : '△ >8%'}`],
            ['封头有效区最小爆压', `${n(dome.minP, 2)} MPa @ r=${n(dome.minPR, 1)}`],
            ['封头全区间最小（含接嘴区）', `${n(dome.minPAll, 2)} MPa`],
            ['封头峰值厚度', `${n(Math.max(...dome.profile.map((p) => p.tTotal)), 3)} mm @ r=${n(dome.profile.reduce((a, b) => (b.tTotal > a.tTotal ? b : a), dome.profile[0]).r, 1)}`],
            ['复材重量参考', `${n(result.weight.totalKg, 3)} kg（筒身 ${n(result.weight.cylinderKg, 3)} + 2×封头 ${n(result.weight.domeKg, 3)}）`],
          ]}
        />
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {result.diagnoses.map((dd, i) => (
            <li key={i} style={{ color: dd.level === 'error' ? '#991b1b' : dd.level === 'warn' ? '#92400e' : '#15803d' }}>
              {dd.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
