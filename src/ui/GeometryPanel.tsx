/**
 * GeometryPanel.tsx — 几何板块（容积↔尺寸互算 · 线型切点设计）
 *
 * 两段式，顺着论文的设计顺序排：
 *   ① 容积与尺寸互算    —— 目标容积 V 是硬约束，可反推 l / R_in / λ（部分参数反推）
 *   ② 线型切点设计      —— 由 V 导出 Φ=f(D) 曲线，与线型表允许转角水平线求交，用户自选
 *
 * 初值从当前铺层输入带过来（R、缠绕极孔 r₀、封头深度 → 轴比 λ），之后各填各的：
 * 几何用**内胆外表面半径 R_in**，铺层用**缠绕层受力半径 R**，两者是不同的量。
 * 公式与取值来源写在 docs/DESIGN.md，界面只讲怎么用。
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { CheckResult, DesignInput } from '../core/types'
import {
  computeVolume,
  geometryChecks,
  lambdaFromDepth,
  solveGeometry,
  windingTurns,
  type UnknownField,
  type VolumeParams,
} from '../core/geometry'
import linetableRef from '../assets/linetableRef.json'
import { FormulaHelp } from './FormulaHelp'
import { LineTypeDesigner } from './LineTypeDesigner'
import { sym } from './Sym'

const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')
const LT_REF_SRC = `data:image/png;base64,${linetableRef.base64}`

function N(props: {
  label: ReactNode
  value: number
  onChange: (v: number) => void
  unit?: ReactNode
  step?: number
  disabled?: boolean
}) {
  return (
    <div className="field">
      <span className="lbl">{props.label}</span>
      <input
        type="number"
        step={props.step ?? 1}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="unit">{props.unit ?? ''}</span>
    </div>
  )
}

export function GeometryPanel({ input, result }: { input: DesignInput; result: CheckResult }) {
  const R = input.geometry.R
  const h = input.geometry.headShortAxis || R
  const [vp, setVp] = useState<VolumeParams>({
    R_in: R,
    l: input.geometry.cylLength,
    lambda: lambdaFromDepth(R, h),
    r0: result.derived.r0,
    Kf: 0.8,
  })
  const [unknown, setUnknown] = useState<UnknownField>('none')
  const [targetL, setTargetL] = useState(input.geometry.volumeL || 140)

  const solved = useMemo(() => solveGeometry(vp, unknown, targetL), [vp, unknown, targetL])
  const shown = solved.params
  const vol = computeVolume(vp)
  const turns = useMemo(() => windingTurns(vp), [vp])
  const hints = useMemo(() => geometryChecks(vp), [vp])

  const set = (patch: Partial<VolumeParams>) => setVp((s) => ({ ...s, ...patch }))

  return (
    <>
      {/* ── ① 容积与尺寸互算（部分参数反推） ───────────────────────────── */}
      <div className="card">
        <h3>
          ① 容积与尺寸互算
          <span className="tail">
            <FormulaHelp
              title="容积与尺寸互算 · 公式"
              items={[
                { frm: 'V=\\dfrac{4}{3}K_f\\left(\\dfrac{D}{2}\\right)^2\\dfrac{D}{2\\lambda}+\\pi\\left(\\dfrac{D}{2}\\right)^2 l' },
                { frm: 'b=\\dfrac{R_{in}}{\\lambda}', desc: 'D = 2R_in，λ 为封头轴比，K_f 为阀座容积折减' },
              ]}
            />
          </span>
        </h3>
        <div className="dome solo">
          <div className="pane">
            <div className="field">
              <span className="lbl">求解对象</span>
              <select value={unknown} onChange={(e) => setUnknown(e.target.value as UnknownField)}>
                <option value="none">按尺寸算容积（正算）</option>
                <option value="l">已知容积 → 反算筒身长度 l</option>
                <option value="R_in">已知容积 → 反算筒身内半径</option>
                <option value="lambda">已知容积 → 反算封头轴比 λ</option>
              </select>
              <span className="unit" />
            </div>
            {unknown !== 'none' && <N label="目标容积 V" value={targetL} unit="L" step={1} onChange={setTargetL} />}
            <N
              label={sym('筒身内半径 R_in（=D/2−t）')}
              value={unknown === 'R_in' ? Number(shown.R_in.toFixed(2)) : vp.R_in}
              unit="mm"
              step={0.5}
              disabled={unknown === 'R_in'}
              onChange={(v) => set({ R_in: v })}
            />
            <N
              label="筒身段长度 l"
              value={unknown === 'l' ? Number(shown.l.toFixed(2)) : vp.l}
              unit="mm"
              step={10}
              disabled={unknown === 'l'}
              onChange={(v) => set({ l: v })}
            />
            <N
              label={sym('封头轴比 λ = a/b')}
              value={unknown === 'lambda' ? Number(shown.lambda.toFixed(3)) : Number(vp.lambda.toFixed(3))}
              step={0.01}
              disabled={unknown === 'lambda'}
              onChange={(v) => set({ lambda: v })}
            />
            <N label={sym('极孔半径 r_0（阀座通孔）')} value={vp.r0} unit="mm" step={0.5} onChange={(v) => set({ r0: v })} />
            <N label={sym('阀座容积折减 K_f')} value={vp.Kf} step={0.05} onChange={(v) => set({ Kf: v })} />
            <div className="derived">
              <div>
                容积 V = 封头 <b>{f(vol.headMm3 / 1e6)}</b> + 筒身 <b>{f(vol.cylMm3 / 1e6)}</b> ={' '}
                <b>{f(computeVolume(solved.params).totalL, 3)} L</b>
              </div>
              {unknown !== 'none' && (
                <div className={solved.ok ? '' : 'bad'}>{solved.ok ? solved.solved : `无解：${solved.solved}`}</div>
              )}
            </div>
            <div className="checks">
              {hints.map((c) => (
                <div key={c.text} className={c.level}>
                  <i>{c.level === 'ok' ? '✓' : '!'}</i>
                  <span>{sym(c.text)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── ② 线型切点设计（辅助曲线 + 用户自选） ─────────────────────── */}
      <div className="card">
        <h3>
          ② 线型切点设计
          <span className="tail">
            <FormulaHelp
              title="缠绕线型公式"
              items={[
                { frm: '\\alpha_0=\\arcsin\\dfrac{r_0}{R_{in}}' },
                { frm: '\\gamma=\\dfrac{l\\,\\tan\\alpha_0}{\\pi D}\\times 360^\\circ', desc: 'D = 2R_in，l 为筒身段长度' },
                { frm: '\\beta=2\\left(90+\\arcsin\\dfrac{h\\,\\tan\\alpha_0-r_0}{R_{in}}\\right)', desc: 'h 为封头深度，即 R_in ÷ λ' },
                { frm: '\\theta_t=\\gamma+\\beta,\\quad \\theta_n=2\\,\\theta_t', desc: 'θ_t 为单程转角；θ_n 为芯模转角（往返一次）' },
                { frm: '\\theta=360^\\circ\\left(m+\\dfrac{K}{n}\\right)', desc: 'n 为切点数，K、m 为整数（K 与 n 互质）' },
                { custom: <img className="lt-ref-img" src={LT_REF_SRC} alt="表 2-1 纤维缠绕线型表" /> },
                { note: '长径比经验区间 2~5 用于初选外形；超区间的候选仍列出，在候选表中标黄。' },
              ]}
            />
          </span>
        </h3>
        <div className="hint" style={{ marginBottom: 0 }}>
          当前几何：极孔缠绕角 {sym('α_0')} = <b>{f(turns.alpha0Deg, 3)}°</b>　筒身转角 γ ={' '}
          <b>{f(turns.gamma)}</b>°　封头转角 β = <b>{f(turns.beta)}</b>°　{sym('单程 θ_t')} = <b>{f(turns.oneWay)}</b>°　
          {sym('芯模转角 θ_n')} = <b>{f(turns.roundTrip)}</b>°
        </div>
        <LineTypeDesigner
          base={{ lambda: vp.lambda, r0: vp.r0, Kf: vp.Kf }}
          volumeL={computeVolume(vp).totalL}
          currentD={2 * vp.R_in}
          onApply={({ R: Rnew, l }) => set({ R_in: Number(Rnew.toFixed(2)), l: Number(l.toFixed(1)) })}
        />
      </div>

    </>
  )
}
