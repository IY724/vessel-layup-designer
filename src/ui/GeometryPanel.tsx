/**
 * GeometryPanel.tsx — 几何板块（容积与尺寸互算 · 线型切点设计）
 *
 * 两段式，顺着论文的设计顺序排：
 *   ① 容积与尺寸互算    —— 目标容积 V 是硬约束，可反推 l / R / λ（部分参数反推）
 *   ② 线型切点设计      —— 由 V 导出 Φ=f(D) 曲线，与线型表允许转角水平线求交，用户自选
 *
 * ① ② 与左侧「几何参数」共用同一组字段（单一数据源，实时联动）：
 *   ②「采用」把筒身直径 D 与筒身长 l 写回设计输入，并保持封头轴比 λ 不变（封头深度随 R 联动）；
 *   ① 的反算结果点「采用」同样写回。任何一处都可手填，数值不合理只提示、不拦截。
 * 公式与取值来源写在 docs/DESIGN.md。
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { CheckResult, DesignInput, GeometryInput } from '../core/types'
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

/** 字段来源标注：手填 / ②采用 / 容积反算 */
type SrcTag = '手填' | '②采用' | '由容积反算'

function N(props: {
  label: ReactNode
  value: number
  onChange: (v: number) => void
  unit?: ReactNode
  step?: number
  disabled?: boolean
  src?: SrcTag
}) {
  return (
    <div className="field">
      <span className="lbl">
        {props.label}
        {props.src && <span className="src">{props.src}</span>}
      </span>
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

export function GeometryPanel({
  input,
  result,
  onGeometry,
}: {
  input: DesignInput
  result: CheckResult
  onGeometry: (v: Partial<GeometryInput>) => void
}) {
  const R = input.geometry.R
  const h = input.geometry.headShortAxis || R
  const lambda = lambdaFromDepth(R, h)
  const [kf, setKf] = useState(0.8)
  const [unknown, setUnknown] = useState<UnknownField>('none')
  const [src, setSrc] = useState<{ R?: SrcTag; l?: SrcTag }>({})
  const mark = (patch: { R?: SrcTag; l?: SrcTag }) => setSrc((s) => ({ ...s, ...patch }))

  const vp: VolumeParams = useMemo(
    () => ({ R_in: R, l: input.geometry.cylLength, lambda, r0: result.derived.r0, Kf: kf }),
    [R, input.geometry.cylLength, lambda, result.derived.r0, kf],
  )
  const targetL = input.geometry.volumeL
  const solved = useMemo(() => solveGeometry(vp, unknown, targetL), [vp, unknown, targetL])
  const shown = solved.params
  const vol = computeVolume(vp)
  const turns = useMemo(() => windingTurns(vp), [vp])
  const hints = useMemo(() => geometryChecks(vp), [vp])

  /** 反算结果写回设计输入；改 R 时同步封头深度，保持 λ 不变 */
  const applySolved = () => {
    if (!solved.ok) return
    if (unknown === 'l') {
      onGeometry({ cylLength: Number(shown.l.toFixed(1)) })
      mark({ l: '由容积反算' })
    } else if (unknown === 'R_in') {
      onGeometry({ R: Number(shown.R_in.toFixed(2)), headShortAxis: Number((shown.R_in / lambda).toFixed(1)) })
      mark({ R: '由容积反算' })
    } else if (unknown === 'lambda') {
      onGeometry({ headShortAxis: Number((R / shown.lambda).toFixed(1)) })
    }
  }

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
                { frm: 'V=\\dfrac{4\\pi}{3}K_f R^2\\dfrac{R}{\\lambda}+\\pi R^2 l' },
                { frm: 'b=\\dfrac{R}{\\lambda}', desc: 'R 为筒身段半径，b 为封头深度；K_f 为阀座容积折减' },
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
                <option value="R_in">已知容积 → 反算筒身段半径 R</option>
                <option value="lambda">已知容积 → 反算封头轴比 λ</option>
              </select>
              <span className="unit" />
            </div>
            {unknown !== 'none' && (
              <N
                label="目标容积 V（设计指标）"
                value={targetL}
                unit="L"
                step={1}
                onChange={(v) => v > 0 && onGeometry({ volumeL: v })}
              />
            )}
            <N
              label={sym('筒身段半径 R')}
              value={unknown === 'R_in' ? Number(shown.R_in.toFixed(2)) : R}
              unit="mm"
              step={0.5}
              disabled={unknown === 'R_in'}
              src={src.R ?? '手填'}
              onChange={(v) => {
                onGeometry({ R: v })
                mark({ R: '手填' })
              }}
            />
            <N
              label="筒身段长度 l"
              value={unknown === 'l' ? Number(shown.l.toFixed(2)) : input.geometry.cylLength}
              unit="mm"
              step={10}
              disabled={unknown === 'l'}
              src={src.l ?? '手填'}
              onChange={(v) => {
                onGeometry({ cylLength: v })
                mark({ l: '手填' })
              }}
            />
            <N
              label={sym('封头轴比 λ = a/b')}
              value={unknown === 'lambda' ? Number(shown.lambda.toFixed(3)) : Number(lambda.toFixed(3))}
              step={0.01}
              disabled={unknown === 'lambda'}
              onChange={(v) => v > 0 && onGeometry({ headShortAxis: Number((R / v).toFixed(1)) })}
            />
            <N
              label={sym('极孔半径 r_0（阀座通孔）')}
              value={vp.r0}
              unit="mm"
              step={0.5}
              onChange={(v) => onGeometry({ poleMode: 'winding', r0Winding: v })}
            />
            <N label={sym('阀座容积折减 K_f')} value={kf} step={0.05} onChange={setKf} />
            {unknown !== 'none' && (
              <div className="field">
                <span className="lbl">反算结果</span>
                <button className="btn sm" onClick={applySolved} disabled={!solved.ok}>
                  采用（写回几何参数）
                </button>
                <span className="unit" />
              </div>
            )}
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
                { frm: '\\alpha_0=\\arcsin\\dfrac{r_0}{R}' },
                { frm: '\\gamma=\\dfrac{l\\,\\tan\\alpha_0}{\\pi D}\\times 360^\\circ', desc: 'D = 2R，R 为筒身段半径；l 为筒身段长度' },
                { frm: '\\beta=2\\left(90+\\arcsin\\dfrac{h\\,\\tan\\alpha_0-r_0}{R}\\right)', desc: 'h 为封头深度，即 R ÷ λ' },
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
          base={{ lambda, r0: result.derived.r0, Kf: kf }}
          volumeL={targetL}
          currentD={2 * R}
          onVolume={(v) => onGeometry({ volumeL: v })}
          onApply={({ R: Rnew, l }) => {
            onGeometry({ R: Number(Rnew.toFixed(2)), cylLength: Number(l.toFixed(1)), headShortAxis: Number((Rnew / lambda).toFixed(1)) })
            mark({ R: '②采用', l: '②采用' })
          }}
        />
      </div>
    </>
  )
}
