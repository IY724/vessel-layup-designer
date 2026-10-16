/** DetailView.tsx — 校核明细：参数、筒身、封头逐格数值，公式与说明、一致性检查 */
import { useState, type ReactNode } from 'react'
import type { CheckResult, DesignInput } from '../core/types'
import { FORMULAS } from '../core/excelRef'
import { sym } from './Sym'
import { Tex } from './Tex'
import { coverageAt, groupPressure, layerThickness, splineAt } from '../core/dome'
import { COURSE_PI } from '../core/course'

const n = (v: number, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '—')

function KV(props: { rows: Array<[ReactNode, string]> }) {
  return (
    <div className="kv">
      {props.rows.map(([k, v], i) => (
        <div key={i}>
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
  const [groupIndex,setGroupIndex] = useState(0)
  const selected=dome.groups[Math.min(groupIndex,dome.groups.length-1)]

  return (
    <div className="detail">
      <div className="grp">
        <b>输入参数</b>
        <KV
          rows={[
            ['筒身段半径 R', `${n(g.R, 3)} mm`],
            ['单束带宽 b', `${n(input.material.bandWidth, 3)} mm`],
            [sym('纤维体积含量 V_f'), n(input.material.vf, 4)],
            ['纤维密度 ρ', `${n(input.material.fiberDensity, 3)} g/cm³`],
            ['线密度 tex', `${n(input.material.tex, 3)} g/m`],
            [sym('单层纤维厚 t_f'), `${n(d.tf, 7)} mm`],
            [sym('含树脂单层厚 t_c'), `${n(d.tc, 7)} mm`],
            [sym('设计爆压 p_b'), `${n(d.pb, 3)} MPa`],
            ['纤维发挥强度（螺旋/环向）', `${n(d.sigmaSpiral, 2)} / ${n(d.sigmaHoop, 2)} MPa`],
            [sym('复材层强度 σ_c'), `${n(d.sigmaComposite, 2)} MPa`],
            ['每束纱数 → 总带宽', `${input.material.strandCount} → ${n(d.bandTotal, 2)} mm`],
            ['封头深度 b', `${n(g.headShortAxis, 1)} mm`],
            [sym('应力平衡系数 k_s'), n(input.requirement.ks, 3)],
            [sym('全铺层覆盖起点 r_full'), `${n(dome.rFull, 2)} mm`],
          ]}
        />
      </div>

      <div className="grp">
        <b>筒身强度校核</b>
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
              {cy.rows.map((r,i) => (
                <tr key={i}>
                  <td className="angle">{r.angle}°</td>
                  <td>{n(Math.cos((r.angle * COURSE_PI) / 180) ** 2)}</td>
                  <td>{n(Math.sin((r.angle * COURSE_PI) / 180) ** 2)}</td>
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
            ['筒身初算采用角度', `${n(input.constraint.alphaRef, 1)}°`],
            ['螺旋层厚度初估', `${n(cy.estimate.hSpiral)} mm → ${cy.estimate.nSpiral} 层`],
            ['环向层厚度初估', `${n(cy.estimate.hHoop)} mm → ${cy.estimate.nHoop} 层`],
            ['估算纤维总厚 / 含树脂总厚', `${n(cy.estimate.hTotal)} / ${n(cy.estimate.tComposite)} mm`],
          ]}
        />
      </div>

      <div className="grp">
        <b>封头参数</b>
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
                <th>{sym('V_1')}</th>
                <th>{sym('V_2')}</th>
                <th>常数项</th>
                <th>{sym('m_1')}</th>
                <th>{sym('m_2')}</th>
                <th>{sym('m_3')}</th>
                <th>{sym('m_4')}</th>
                <th>赤道总厚</th>
                <th>赤道爆压</th>
              </tr>
            </thead>
            <tbody>
              {dome.groups.map((gr) => {
                const i = dome.groups.indexOf(gr)
                const atR = dome.profile[dome.profile.length - 1]
                return (
                  <tr key={i}>
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
                    <td>{n(atR ? atR.pGroups[i] : 0)}</td>
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
                  {f.angle}°：{sym(f.reason)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grp">
        <b>封头局部参考值</b>
        <div className="tablewrap" style={{ maxHeight: 260 }}>
          <table className="grid">
            <thead>
              <tr>
                <th>平行圆半径 r /mm</th>
                {dome.groups.map((gr) => (
                  <th key={dome.groups.indexOf(gr)}>{Number(gr.angle.toFixed(3))}° 层厚</th>
                ))}
                <th>总厚</th>
                <th>各层爆压相加</th>
                <th>乘系数后爆压</th>
                <th>与设计值比较</th>
              </tr>
            </thead>
            <tbody>
              {dome.profile
                .map((p) => (
                  <tr key={p.r}>
                    <td>{p.r.toFixed(2)}</td>
                    {p.tGroups.map((t, i) => (
                      <td key={i}>{t.toFixed(4)}</td>
                    ))}
                    <td>{p.tTotal.toFixed(4)}</td>
                    <td>{p.pSum.toFixed(3)}</td>
                    <td>{p.pTotal.toFixed(3)}</td>
                    <td>
                      {p.pTotal >= d.pb ? '≥ 设计值' : '< 设计值'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <div className="grp">
        <b>螺旋铺层校验</b>
        <select aria-label="校验角度" value={groupIndex} onChange={e=>setGroupIndex(Number(e.target.value))} style={{marginLeft:16}}>
          {dome.groups.map((g,i)=><option key={i} value={i}>{Number(g.angle.toFixed(3))}°（第{i+1}组）</option>)}
        </select>
        <div className="tablewrap" style={{maxHeight:360}}>
          <table className="grid"><thead><tr><th>平行圆半径 / mm</th><th>2倍带宽内厚度 / mm</th><th>2倍带宽外厚度 / mm</th><th>厚度 / mm</th><th>层数</th><th>总厚度 / mm</th><th>封头局部角 K / °</th><th>局部参考爆压 / MPa</th></tr></thead>
          <tbody>{dome.profile.map(p=><tr key={p.r}>
            <td>{n(p.r,1)}</td><td>{p.r>selected.splineEndRadius?'—':n(Math.max(0,splineAt(selected,p.r)))}</td><td>{p.r<selected.rb?'—':n(coverageAt(selected,p.r))}</td><td>{n(layerThickness(selected,p.r))}</td><td>{selected.cycles}</td><td>{n(layerThickness(selected,p.r)*selected.cycles)}</td><td>{p.r<selected.r0?'—':n(Math.asin(selected.r0/p.r)/COURSE_PI*180)}</td><td>{n(groupPressure(selected,p.r,g.R,d.sigmaComposite))}</td>
          </tr>)}</tbody></table>
        </div>
      </div>}

      <div className="grp">
        <b>计算公式</b>
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 170, textAlign: 'left' }}>项目</th>
              <th style={{ textAlign: 'left' }}>公式</th>
              <th style={{ width: 260, textAlign: 'left' }}>作用</th>
            </tr>
          </thead>
          <tbody>
            {FORMULAS.map((f, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'left' }}>{sym(f.label)}</td>
                <td style={{ textAlign: 'left', color: '#1e3a5f', whiteSpace: 'normal' }}>
                  <Tex src={f.formula} />
                </td>
                <td style={{ textAlign: 'left', color: '#64748b', whiteSpace: 'normal' }}>{sym(f.purpose)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grp">
        <b>校核结果</b>
        <KV
          rows={[
            ['封头赤道处总厚', `${n(result.consistency.domeSpiralAtR)} mm`],
            ['筒身螺旋层厚', `${n(result.consistency.cylinderSpiral)} mm`],
            ['衔接偏差', `${result.consistency.diff >= 0 ? '+' : ''}${n(result.consistency.diff)} mm`],
            ['封头经验初估（α₀）', `${n(result.head.pressure, 2)} MPa`],
            ['局部曲线最低值（参考）', `${n(dome.minP, 3)} MPa @ r=${n(dome.minPR, 1)}`],
            ['封头最厚处', `${n(Math.max(...dome.profile.map((p) => p.tTotal)), 3)} mm @ r=${n(dome.profile.reduce((a, b) => (b.tTotal > a.tTotal ? b : a), dome.profile[0]).r, 1)}`],
          ]}
        />
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {result.diagnoses.map((dd, i) => (
            <li key={i} style={{ color: dd.level === 'error' ? '#991b1b' : dd.level === 'warn' ? '#92400e' : '#15803d' }}>
              {sym(dd.text)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
