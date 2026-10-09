/** DetailView.tsx — 校核明细：参数、筒身、封头逐格数值，公式对照与参考表已知问题 */
import type { ReactNode } from 'react'
import type { CheckResult, DesignInput } from '../core/types'
import { CYLINDER_FORMULAS, DOME_FORMULAS, EXCEL_ISSUES } from '../core/excelRef'
import { effectiveRBoss } from '../core/checker'
import { sym } from './Sym'

const n = (v: number, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '—')

function KV(props: { rows: Array<[ReactNode, string]> }) {
  return (
    <div className="kv">
      {props.rows.map(([k, v]) => (
        <div key={String(k)}>
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
        <b>1) 输入参数</b>
        <KV
          rows={[
            ['筒身段半径 R', `${n(g.R, 3)} mm`],
            ['单束带宽 b', `${n(input.material.bandWidth, 3)} mm`],
            ['纤维体积含量 Vf', n(input.material.vf, 4)],
            ['纤维密度 ρ', `${n(input.material.fiberDensity, 3)} g/cm³`],
            ['线密度 tex', `${n(input.material.tex, 3)} g/m`],
            ['单层纤维厚 tf', `${n(d.tf, 7)} mm`],
            ['含树脂单层厚 tc', `${n(d.tc, 7)} mm`],
            ['设计爆压 pb', `${n(d.pb, 3)} MPa`],
            ['纤维发挥强度（螺旋/环向）', `${n(d.sigmaSpiral, 2)} / ${n(d.sigmaHoop, 2)} MPa`],
            ['复材层强度', `${n(d.sigmaComposite, 2)} MPa`],
            ['每束纱数 → 总带宽', `${input.material.strandCount} → ${n(d.bandTotal, 2)} mm`],
            ['封头深度 b', `${n(g.headShortAxis, 1)} mm`],
            ['应力平衡系数', n(input.requirement.ks, 3)],
            [sym('封头判定范围下界 r_boss'), `${n(rBoss, 2)} mm`],
            ['封头算法', input.refMode === 'corrected' ? '正确算法（cos²α）' : '参考表原算法 cos(u·cos u)'],
          ]}
        />
      </div>

      <div className="grp">
        <b>2) 筒身：各角度组的贡献</b>
        <div className="tablewrap" style={{ maxHeight: 240 }}>
          <table className="grid">
            <thead>
              <tr>
                <th>缠绕角 α</th>
                <th>cos²α</th>
                <th>sin²α</th>
                <th>层数</th>
                <th>纵向 单层</th>
                <th>环向 单层</th>
                <th>纵向 合计</th>
                <th>环向 合计</th>
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
                <td colSpan={6}>合计</td>
                <td>{n(cy.pa)}</td>
                <td>{n(cy.pth)}</td>
                <td>{n(cy.totalThickness)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <KV
          rows={[
            ['初估参考角', `${n(input.constraint.alphaRef, 1)}°`],
            ['螺旋层厚度初估', `${n(cy.estimate.hSpiral)} mm → ${cy.estimate.nSpiral} 层`],
            ['环向层厚度初估', `${n(cy.estimate.hHoop)} mm → ${cy.estimate.nHoop} 层`],
            ['估算纤维总厚 / 含树脂总厚', `${n(cy.estimate.hTotal)} / ${n(cy.estimate.tComposite)} mm`],
          ]}
        />
      </div>

      <div className="grp">
        <b>3) 封头：各角度组的模型参数</b>
        <div className="tablewrap" style={{ maxHeight: 260 }}>
          <table className="grid">
            <thead>
              <tr>
                <th>缠绕角 α</th>
                <th>层数</th>
                <th>循环数</th>
                <th>{sym('起铺圆 r_0')}</th>
                <th>{sym('边界圆 r_b')}</th>
                <th>{sym('衔接圆 r_2b')}</th>
                <th>{sym('斜率 m_R')}</th>
                <th>{sym('赤道厚 t_R')}</th>
                <th>V₁</th>
                <th>V₂</th>
                <th>常数项</th>
                <th>m₁</th>
                <th>m₂</th>
                <th>m₃</th>
                <th>m₄</th>
                <th>赤道总厚</th>
                <th>赤道爆压</th>
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
        <b>4) 封头沿母线的数值（每隔若干点列一行）</b>
        <div className="tablewrap" style={{ maxHeight: 260 }}>
          <table className="grid">
            <thead>
              <tr>
                <th>平行圆半径 r /mm</th>
                {dome.groups.map((gr) => (
                  <th key={gr.angle}>{gr.angle}° 层厚</th>
                ))}
                <th>总厚</th>
                <th>各层爆压相加</th>
                <th>乘系数后爆压</th>
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
                      {p.r < rBoss ? '极孔侧' : p.pTotal >= d.pb ? '达标' : '不达标'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grp">
        <b>5) 公式对照（参考表写法 ⇄ 本软件写法）</b>
        <table className="formula">
          <thead>
            <tr>
              <td style={{ width: 150, fontWeight: 600, color: '#1e3a5f' }}>项目</td>
              <td style={{ width: 320, fontWeight: 600, color: '#1e3a5f' }}>参考表写法</td>
              <td style={{ width: 260, fontWeight: 600, color: '#1e3a5f' }}>本软件写法</td>
              <td style={{ fontWeight: 600, color: '#1e3a5f' }}>说明</td>
            </tr>
          </thead>
          <tbody>
            {[...CYLINDER_FORMULAS, ...DOME_FORMULAS].map((f, i) => (
              <tr key={i}>
                <td style={{ width: 150 }}>{sym(f.label)}</td>
                <td style={{ width: 320, color: '#64748b' }}>{sym(f.excel)}</td>
                <td style={{ width: 260, color: '#1e3a5f' }}>{sym(f.corrected)}</td>
                <td style={{ color: f.note ? '#92400e' : '#94a3b8' }}>{f.note ? sym(f.note) : '一致'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grp">
        <b>6) 参考表已核对出的问题</b>
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
        <b>7) 一致性检查与全部诊断</b>
        <KV
          rows={[
            ['封头赤道处总厚', `${n(result.consistency.domeSpiralAtR)} mm`],
            ['筒身螺旋层厚', `${n(result.consistency.cylinderSpiral)} mm`],
            ['衔接偏差', `${result.consistency.diff >= 0 ? '+' : ''}${n(result.consistency.diff)} mm ${result.consistency.ok ? '合格' : '偏大 >8%'}`],
            ['封头判定范围内最低爆压', `${n(dome.minP, 2)} MPa @ r=${n(dome.minPR, 1)}`],
            ['封头极孔侧最低爆压（仅参考）', `${n(dome.minPAll, 2)} MPa`],
            ['封头最厚处', `${n(Math.max(...dome.profile.map((p) => p.tTotal)), 3)} mm @ r=${n(dome.profile.reduce((a, b) => (b.tTotal > a.tTotal ? b : a), dome.profile[0]).r, 1)}`],
            ['复材重量参考', `${n(result.weight.totalKg, 3)} kg（筒身 ${n(result.weight.cylinderKg, 3)} + 两个封头 ${n(result.weight.domeKg, 3)}）`],
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
