/** InputPanel.tsx — 参数输入：几何 / 纤维工艺 / 强度 / 设计要求 / 结果概览 */
import { useMemo } from 'react'
import type { DesignStore } from '../state/store'
import { Section, Num, Radio } from './fields'
import { checkPoleConsistency } from '../core/geodesic'
import { compositeLayerThickness, fiberLayerThickness, totalBandWidth } from '../core/materials'
import { FormulaHelp } from './FormulaHelp'
import { sym } from './Sym'
import { spiralGroups } from '../core/layup'
import { InitialEstimateFields } from './InitialEstimateFields'

const f = (v: number, n = 4) => (Number.isFinite(v) ? v.toFixed(n).replace(/\.?0+$/, '') : '—')

export function InputPanel({ store }: { store: DesignStore }) {
  const { input, patch, setGeometry, result } = store
  const g = input.geometry
  const m = input.material
  const s = input.strength
  const rq = input.requirement
  const d = result.derived

  const tf = fiberLayerThickness(m)
  const tc = compositeLayerThickness(m)
  const band = totalBandWidth(m)

  const minAngle = useMemo(() => {
    const a = spiralGroups(input.plan).filter((x) => x.active !== false && x.layers > 0).map((x) => x.angle)
    return a.length ? Math.min(...a) : null
  }, [input.plan])

  const consistency = minAngle === null ? null : checkPoleConsistency(g.R, d.r0, minAngle, band)

  return (
    <div className="inputs panel">
      <Section
        title="几何参数"
        tail={
          <FormulaHelp
            title="几何与极孔公式"
            items={[
              { frm: 'r_0=R\\sin\\alpha', desc: 'α 为极孔处的测地线角' },
              { frm: 'b=\\dfrac{R_{in}}{\\lambda}', desc: 'λ 为封头轴比（λ=2 为标准椭圆封头）' },
            ]}
          />
        }
      >
        <Num label={sym('筒身段半径 R')} value={g.R} unit="mm" step={0.5} onChange={(v) => v !== null && setGeometry({ R: v })} />
        <Radio
          label="极孔半径取法"
          value={g.poleMode}
          options={[
            { value: 'winding', text: '直接填缠绕极孔' },
            { value: 'port', text: '瓶口内半径 + 内衬厚' },
          ]}
          onChange={(v) => setGeometry({ poleMode: v })}
        />
        {g.poleMode === 'winding' ? (
          <Num label="缠绕极孔半径" value={g.r0Winding} unit="mm" step={0.5} onChange={(v) => v !== null && setGeometry({ r0Winding: v })} />
        ) : (
          <>
            <Num label="成品瓶口内半径" value={g.portInnerRadius} unit="mm" step={0.5} onChange={(v) => v !== null && setGeometry({ portInnerRadius: v })} />
            <Num label="极孔处内衬厚度" value={g.linerAtPole} unit="mm" step={0.5} onChange={(v) => v !== null && setGeometry({ linerAtPole: v })} />
          </>
        )}
        {consistency?.level === 'warn' && <div className="hint warn pole-advice" role="status">{consistency.text}</div>}
        <Num
          label="封头深度 b（半椭球短半轴）"
          value={g.headShortAxis}
          unit="mm"
          step={5}
          onChange={(v) => v !== null && setGeometry({ headShortAxis: v })}
          hint="只用于画轮廓和估算重量，不影响强度计算"
        />
        <div className="field wide">
          <Num label="筒身段长度" value={g.cylLength} unit="mm" step={10} onChange={(v) => v !== null && setGeometry({ cylLength: v })} />
          <Num label="设计容积" value={g.volumeL} unit="L" step={5} onChange={(v) => v !== null && setGeometry({ volumeL: v })} />
        </div>
        <Num
          label="内衬厚度"
          value={g.linerThickness}
          unit="mm"
          step={0.5}
          onChange={(v) => v !== null && setGeometry({ linerThickness: v })}
          hint="强度按缠绕层等厚计算，内衬只计入重量参考值"
        />
      </Section>

      <Section
        title="纤维与工艺"
        tail={
          <FormulaHelp
            title="材料与工艺公式"
            items={[
              { frm: 't_f=\\dfrac{tex}{\\rho_{f}\\cdot b}', desc: 'tex 为线密度，ρ_f 为纤维密度，b 为单束带宽' },
              { frm: 't_c=\\dfrac{t_f}{V_f}' },
              { frm: 'cycles=\\dfrac{n}{2}', desc: '该组缠绕循环数 = 层数 ÷ 2' },
            ]}
          />
        }
      >
        <Num label="线密度 tex" value={m.tex} unit="g/m" step={0.05} onChange={(v) => v !== null && patch('material', { tex: v })} />
        <Num label="纤维密度 ρ" value={m.fiberDensity} unit="g/cm³" step={0.05} onChange={(v) => v !== null && patch('material', { fiberDensity: v })} />
        <Num label="单束带宽 b" value={m.bandWidth} unit="mm" step={0.5} onChange={(v) => v !== null && patch('material', { bandWidth: v })} />
        <Num
          label="每束纱数 n"
          value={m.strandCount}
          unit={`→ 总带宽 ${f(band, 1)} mm`}
          step={1}
          onChange={(v) => v !== null && patch('material', { strandCount: v })}
        />
        <Num label={sym('纤维体积含量 V_f')} value={m.vf} step={0.01} onChange={(v) => v !== null && patch('material', { vf: v })} />
        <Num label="树脂密度" value={m.resinDensity} unit="g/cm³" step={0.05} onChange={(v) => v !== null && patch('material', { resinDensity: v })} hint="仅用于重量参考值" />
        <div className="hint">
          单层纤维厚 {sym('t_f')} = <b>{f(tf, 4)}</b> mm　含树脂单层厚 {sym('t_c')} = <b>{f(tc, 4)}</b> mm
        </div>
      </Section>

      <Section
        title="强度"
        tail={
          <FormulaHelp
            title="强度换算公式"
            items={[
              { frm: '\\sigma_{\\text{发挥}}=\\dfrac{\\sigma_{NOL}}{V_f}\\,k', desc: '模式 A；螺旋、环向同值' },
              { frm: '\\sigma_c=\\sigma_{\\text{发挥}}V_f' },
              { note: '模式 B：螺旋／环向发挥强度与 σ_c 直接给定' },
            ]}
          />
        }
      >
        <Radio
          label="强度输入"
          value={s.mode}
          options={[
            { value: 'A', text: '由 NOL 环强度换算' },
            { value: 'B', text: '直接给定发挥强度' },
          ]}
          onChange={(v) => patch('strength', { mode: v })}
        />
        {s.mode === 'A' ? (
          <>
            <Num label={sym('NOL 环拉伸强度 σ_NOL')} value={s.sigmaNOL} unit="MPa" step={5} onChange={(v) => v !== null && patch('strength', { sigmaNOL: v })} />
            <Num
              label="强度损失系数 k"
              value={s.kLoss}
              step={0.01}
              onChange={(v) => v !== null && patch('strength', { kLoss: v })}
              hint="常用 0.8~0.9"
            />
            <div className="hint">
              纤维发挥强度 {sym('σ_发挥')} = <b>{f(d.sigmaSpiral, 1)}</b> MPa（螺旋、环向同值）
              <br />
              复材层强度 {sym('σ_c')} = <b>{f(d.sigmaComposite, 1)}</b> MPa
            </div>
          </>
        ) : (
          <>
            <Num label="螺旋层发挥强度" value={s.sigmaSpiralDirect} unit="MPa" step={5} onChange={(v) => v !== null && patch('strength', { sigmaSpiralDirect: v })} />
            <Num label="环向层发挥强度" value={s.sigmaHoopDirect} unit="MPa" step={5} onChange={(v) => v !== null && patch('strength', { sigmaHoopDirect: v })} />
            <Num
              label="复材层强度（留空自动）"
              value={s.sigmaCompositeDirect}
              unit="MPa"
              step={5}
              onChange={(v) => patch('strength', { sigmaCompositeDirect: v })}
            />
            <div className="hint">
              封头经验初估用纤维强度；局部曲线用 {sym('σ_c')} = <b>{f(d.sigmaComposite, 1)}</b> MPa
              （留空时按螺旋层发挥强度 × {sym('V_f')} 取）
            </div>
          </>
        )}
      </Section>

      <Section
        title="设计要求"
        tail={
          <FormulaHelp
            title="设计要求公式"
            items={[
              { frm: 'p_b=p_{\\text{工作}}\\times S', desc: 'S 为安全系数；直接给定时 p_b 即为参与判定的值' },
              { frm: 'p_{\\text{总}}=k_s\\sum p_g', desc: 'k_s 为应力平衡系数，常用 0.70~0.80' },
            ]}
          />
        }
      >
        <Radio
          label="爆压输入"
          value={rq.pbMode}
          options={[
            { value: 'direct', text: '设计爆压' },
            { value: 'wp_sf', text: '工作压力 × 安全系数' },
          ]}
          onChange={(v) => patch('requirement', { pbMode: v })}
        />
        {rq.pbMode === 'direct' ? (
          <Num label={sym('设计爆压 pb')} value={rq.pb} unit="MPa" step={1} onChange={(v) => v !== null && patch('requirement', { pb: v })} />
        ) : (
          <div className="field wide">
            <Num label="工作压力" value={rq.workingPressure} unit="MPa" step={1} onChange={(v) => v !== null && patch('requirement', { workingPressure: v })} />
            <Num label="安全系数" value={rq.safetyFactor} step={0.01} onChange={(v) => v !== null && patch('requirement', { safetyFactor: v })} />
          </div>
        )}
        <Num
          label={sym('应力平衡系数 k_s')}
          value={rq.ks}
          step={0.01}
          onChange={(v) => v !== null && patch('requirement', { ks: v })}
          hint={sym(`常用 0.70~0.80；换算设计爆压 p_b = ${f(d.pb, 2)} MPa${rq.pbMode === 'wp_sf' ? `（${rq.workingPressure} × ${rq.safetyFactor}）` : ''}`)}
        />
      </Section>

      <Section title="筒身层数计算">
        <Num label="筒身计算角度" value={input.constraint.alphaRef} unit="°" invalid={!(input.constraint.alphaRef>0 && input.constraint.alphaRef<54.7356)} onChange={v => v !== null && patch('constraint', { alphaRef: v })} />
        <InitialEstimateFields input={input} />
      </Section>
      <Section
        title="结果概览"
        tail={
          <FormulaHelp
            title="汇总公式"
            items={[
              { frm: 't_{\\text{螺旋}}=\\sum n_i\\,t_c' },
              { frm: 't_{\\text{总}}=t_{\\text{螺旋}}+n_{90}\\,t_c' },
              { frm: 'W=\\rho\\,V_{\\text{缠绕}}', desc: '缠绕层体积按筒身 + 两个封头计' },
            ]}
          />
        }
      >
        <div className="derived">
          <div>
            螺旋层总厚 <b>{f(result.cylinder.spiralThickness)} mm</b>（{result.cylinder.spiralLayers} 层）
          </div>
          <div>
            环向层总厚 <b>{f(result.cylinder.hoopThickness)} mm</b>（{result.cylinder.hoopLayers} 层）
          </div>
          <div>
            缠绕层总厚 <b>{f(result.cylinder.totalThickness)} mm</b>
          </div>
          <div>
            封头最厚处 <b>{f(Math.max(...result.dome.profile.map((p) => p.tTotal)))} mm</b> @ r≈
            {f(result.dome.profile.reduce((a, b) => (b.tTotal > a.tTotal ? b : a), result.dome.profile[0])?.r ?? 0, 1)} mm
          </div>
          <div>
            筒身 {result.cylinder.paPass && result.cylinder.pthPass ? '满足' : '不足'}　封头初估{' '}
            {result.head.pass ? '满足' : '不足'}
          </div>
        </div>
      </Section>
    </div>
  )
}
