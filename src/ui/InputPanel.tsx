/** InputPanel.tsx — 参数输入（规划 §5）：几何 / 材料工艺 / 强度 / 设计要求 / 约束 / 派生汇总 */
import { useMemo } from 'react'
import type { DesignStore } from '../state/store'
import { Section, Num, Radio, Check, Chips } from './fields'
import { angleFromPoleRadius, checkPoleConsistency } from '../core/geodesic'
import { effectiveRBoss } from '../core/checker'
import { compositeLayerThickness, fiberLayerThickness, totalBandWidth } from '../core/materials'

const f = (v: number, n = 4) => (Number.isFinite(v) ? v.toFixed(n).replace(/\.?0+$/, '') : '—')

export function InputPanel({ store }: { store: DesignStore }) {
  const { input, patch, setGeometry, result } = store
  const g = input.geometry
  const m = input.material
  const s = input.strength
  const rq = input.requirement
  const c = input.constraint
  const d = result.derived

  const tf = fiberLayerThickness(m)
  const tc = compositeLayerThickness(m)
  const band = totalBandWidth(m)

  const minAngle = useMemo(() => {
    const a = input.plan.spiral.filter((x) => x.layers > 0).map((x) => x.angle)
    return a.length ? Math.min(...a) : null
  }, [input.plan.spiral])

  const consistency = minAngle === null ? null : checkPoleConsistency(g.R, d.r0, minAngle, band)
  const implied = angleFromPoleRadius(g.R, d.r0)

  return (
    <div className="inputs panel">
      <Section n={1} title="几何参数" tail="全部默认可改">
        <Num label="筒身段半径 R" value={g.R} unit="mm" step={0.5} onChange={(v) => v !== null && setGeometry({ R: v })} />
        <Radio
          label="极孔半径口径"
          value={g.poleMode}
          options={[
            { value: 'winding', text: '缠绕极孔直填' },
            { value: 'port', text: '瓶口内半径+内衬' },
          ]}
          onChange={(v) => setGeometry({ poleMode: v })}
        />
        {g.poleMode === 'winding' ? (
          <Num label="极孔半径 r₀" value={g.r0Winding} unit="mm" step={0.5} onChange={(v) => v !== null && setGeometry({ r0Winding: v })} />
        ) : (
          <>
            <Num label="成品瓶口内半径" value={g.portInnerRadius} unit="mm" step={0.5} onChange={(v) => v !== null && setGeometry({ portInnerRadius: v })} />
            <Num label="极孔处内衬厚度" value={g.linerAtPole} unit="mm" step={0.5} onChange={(v) => v !== null && setGeometry({ linerAtPole: v })} />
          </>
        )}
        <div className={`hint${consistency && consistency.level !== 'ok' ? ' warn' : ''}`}>
          ↳ 缠绕极孔 r₀ = {f(d.r0, 3)} mm，对应测地线角 α = arcsin(r₀/R) = <b>{f(implied, 2)}°</b>
          {minAngle !== null && (
            <>
              <br />
              {consistency?.text}
            </>
          )}
        </div>
        <Num label="封头短半轴 h（椭圆）" value={g.headShortAxis} unit="mm" step={5} onChange={(v) => v !== null && setGeometry({ headShortAxis: v })} hint="第一期仅记录：封头厚度公式不依赖它，用于轮廓绘制与重量估算" />
        <div className="field wide">
          <Num label="筒身段长度" value={g.cylLength} unit="mm" step={10} onChange={(v) => v !== null && setGeometry({ cylLength: v })} />
          <Num label="设计容积" value={g.volumeL} unit="L" step={5} onChange={(v) => v !== null && setGeometry({ volumeL: v })} />
        </div>
        <Num label="内衬厚度（记录）" value={g.linerThickness} unit="mm" step={0.5} onChange={(v) => v !== null && setGeometry({ linerThickness: v })} hint="网格理论等厚假设与长度无关；此处仅供重量参考值" />
      </Section>

      <Section n={2} title="材料 / 工艺参数">
        <Num label="线密度 tex" value={m.tex} unit="g/m" step={0.05} onChange={(v) => v !== null && patch('material', { tex: v })} />
        <Num label="纤维密度 ρ" value={m.fiberDensity} unit="g/cm³" step={0.05} onChange={(v) => v !== null && patch('material', { fiberDensity: v })} />
        <Num label="缠绕带宽 b" value={m.bandWidth} unit="mm" step={0.5} onChange={(v) => v !== null && patch('material', { bandWidth: v })} />
        <Num
          label="每束纱数 n"
          value={m.strandCount}
          unit={`→ 总带宽 ${f(band, 1)} mm`}
          step={1}
          onChange={(v) => v !== null && patch('material', { strandCount: v })}
        />
        <Num label="纤维体积含量 Vf" value={m.vf} step={0.01} onChange={(v) => v !== null && patch('material', { vf: v })} />
        <Num label="树脂密度（重量用）" value={m.resinDensity} unit="g/cm³" step={0.05} onChange={(v) => v !== null && patch('material', { resinDensity: v })} />
        <div className="hint">
          ↳ 自动派生：tf = tex/(ρ·b) = <b>{f(tf, 4)}</b> mm　tc = tf/Vf = <b>{f(tc, 4)}</b> mm
          <br />
          ↳ 封头每组循环数 = 该组层数 / 2（★每组各自取值）
        </div>
      </Section>

      <Section n={3} title="强度参数">
        <Radio
          label="给定模式"
          value={s.mode}
          options={[
            { value: 'A', text: 'A 软件自算' },
            { value: 'B', text: 'B 直接给定' },
          ]}
          onChange={(v) => patch('strength', { mode: v })}
        />
        {s.mode === 'A' ? (
          <>
            <Num label="NOL 环拉伸强度 σ_NOL" value={s.sigmaNOL} unit="MPa" step={5} onChange={(v) => v !== null && patch('strength', { sigmaNOL: v })} />
            <Num label="强度损失系数 k" value={s.kLoss} step={0.01} onChange={(v) => v !== null && patch('strength', { kLoss: v })} hint="课程经验 0.8~0.9" />
            <div className="hint">
              ↳ σ发挥 = σ_NOL / Vf × k = <b>{f(d.sigmaSpiral, 1)}</b> MPa（螺旋/环向同值）
              <br />
              ↳ σc 复材层 = σ发挥 × Vf = <b>{f(d.sigmaComposite, 1)}</b> MPa
            </div>
          </>
        ) : (
          <>
            <Num label="螺旋层发挥强度" value={s.sigmaSpiralDirect} unit="MPa" step={5} onChange={(v) => v !== null && patch('strength', { sigmaSpiralDirect: v })} />
            <Num label="环向层发挥强度" value={s.sigmaHoopDirect} unit="MPa" step={5} onChange={(v) => v !== null && patch('strength', { sigmaHoopDirect: v })} />
            <Num
              label="复材层强度 σc（留空=自动）"
              value={s.sigmaCompositeDirect}
              unit="MPa"
              step={5}
              onChange={(v) => patch('strength', { sigmaCompositeDirect: v })}
            />
            <div className="hint">
              ↳ 筒身纵向/环向分别用 σ_螺旋、σ_环向；封头用 σc = <b>{f(d.sigmaComposite, 1)}</b> MPa
              <br />
              ↳ 70MPa 课程案例即此模式（螺旋 3859 / 环向 4342 MPa）
            </div>
          </>
        )}
      </Section>

      <Section n={4} title="设计要求">
        <Radio
          label="给定方式"
          value={rq.pbMode}
          options={[
            { value: 'direct', text: '设计爆压' },
            { value: 'wp_sf', text: '工作压力 × 系数' },
          ]}
          onChange={(v) => patch('requirement', { pbMode: v })}
        />
        {rq.pbMode === 'direct' ? (
          <Num label="设计爆破压强 pb" value={rq.pb} unit="MPa" step={1} onChange={(v) => v !== null && patch('requirement', { pb: v })} />
        ) : (
          <div className="field wide">
            <Num label="工作压力" value={rq.workingPressure} unit="MPa" step={1} onChange={(v) => v !== null && patch('requirement', { workingPressure: v })} />
            <Num label="安全系数" value={rq.safetyFactor} step={0.01} onChange={(v) => v !== null && patch('requirement', { safetyFactor: v })} />
          </div>
        )}
        <Num label="应力平衡系数 ks" value={rq.ks} step={0.01} onChange={(v) => v !== null && patch('requirement', { ks: v })} hint={`Excel 取 0.75，讲义 ~0.7；当前换算 pb = ${f(d.pb, 2)} MPa${rq.pbMode === 'wp_sf' ? ` = ${rq.workingPressure} × ${rq.safetyFactor}` : ''}`} />
      </Section>

      <Section n={5} title="设计约束 / 自动生成选项">
        <div className="field" style={{ marginBottom: 2 }}>
          <span className="lbl">候选螺旋角集（课件经验，可增删）</span>
          <span />
          <span />
        </div>
        <Chips items={c.candidates} onChange={(v) => patch('constraint', { candidates: v })} />
        <div className="field">
          <span className="lbl">角度分配规则</span>
          <select value={c.angleRule} onChange={(e) => patch('constraint', { angleRule: e.target.value as 'alternate' | 'manual' })}>
            <option value="alternate">课件经验：隔一取一</option>
            <option value="manual">手动指定</option>
          </select>
          <span className="unit" />
        </div>
        <Check label="螺旋层必须偶数（±成对）" checked={c.forceEvenSpiral} onChange={(v) => patch('constraint', { forceEvenSpiral: v })} />
        <Num label="参考角 αref（初估用）" value={c.alphaRef} unit="°" step={1} onChange={(v) => v !== null && patch('constraint', { alphaRef: v })} />
        <Check label="判定窗口下界 r_boss 自动取（最低角组 r₀ + 1 带宽）" checked={c.rBossAuto} onChange={(v) => patch('constraint', { rBossAuto: v })} />
        {!c.rBossAuto && (
          <Num label="r_boss" value={c.rBoss} unit="mm" step={1} onChange={(v) => v !== null && patch('constraint', { rBoss: v })} />
        )}
        <div className="hint">
          ↳ 封头判定窗口 r ∈ [{f(effectiveRBoss(input), 1)}, {g.R}] mm：
          窗口下界以下为金属接嘴/瓶口补强区，不计入最小爆压判定
          <br />
          ↳ 层数、角度组数均不设上限；约束不可行时算法明确报错并给出缺口方向与数值
        </div>
      </Section>

      <Section n={6} title="派生汇总（实时重算）">
        <div className="derived">
          <div>螺旋层总厚 <b>{f(result.cylinder.spiralThickness)} mm</b>（{result.cylinder.spiralLayers} 层）</div>
          <div>环向层总厚 <b>{f(result.cylinder.hoopThickness)} mm</b>（{result.cylinder.hoopLayers} 层）</div>
          <div>缠绕层总厚 <b>{f(result.cylinder.totalThickness)} mm</b></div>
          <div>封头厚度峰值 <b>{f(Math.max(...result.dome.profile.map((p) => p.tTotal)))} mm</b> @ r≈{f(result.dome.profile.reduce((a, b) => (b.tTotal > a.tTotal ? b : a), result.dome.profile[0]).r, 1)}</div>
          <div>
            状态：{result.cylinder.paPass && result.cylinder.pthPass ? '筒身 ✓ 满足' : '筒身 ✗ 不足'}
            {' | '}
            封头 {result.dome.pass ? '✓ 满足' : '△ 薄弱待调整'}
          </div>
          <div>
            复材重量参考 <b>{f(result.weight.totalKg, 2)} kg</b>（筒身 {f(result.weight.cylinderKg, 2)} + 2×封头 {f(result.weight.domeKg, 2)}，ρc={f(result.weight.rhoComposite, 2)}）
          </div>
        </div>
      </Section>
    </div>
  )
}
