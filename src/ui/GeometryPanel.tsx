/**
 * GeometryPanel.tsx — 几何板块（容积↔尺寸互算、内胆轮廓、缠绕线型切点、瓶口/接头尺寸）
 *
 * 初值从当前铺层输入带过来（R、缠绕极孔 r₀、封头深度 → 轴比 λ），之后各填各的：
 * 几何用**内胆外表面半径 R_in**，铺层用**缠绕层受力半径 R**，两者是不同的量。
 * 公式与取值来源写在 docs/DESIGN.md，界面只讲怎么用。
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { CheckResult, DesignInput } from '../core/types'
import {
  PLUGIN_JOINT_DEFAULT,
  checkJoint,
  computeVolume,
  deriveJoint,
  geometryChecks,
  headMinorAxis,
  lambdaFromDepth,
  matchLineType,
  meridianProfile,
  solveGeometry,
  windingTurns,
  type JointParams,
  type UnknownField,
  type VolumeParams,
} from '../core/geometry'
import { effectiveRBoss } from '../core/checker'
import { SvgSym, sym } from './Sym'

const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

function N(props: { label: ReactNode; value: number; onChange: (v: number) => void; unit?: ReactNode; step?: number }) {
  return (
    <div className="field">
      <span className="lbl">{props.label}</span>
      <input
        type="number"
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="unit">{props.unit ?? ''}</span>
    </div>
  )
}

/** 内胆纵剖面（半剖）：筒身 + 半椭球封头 + 瓶口区各半径的位置。标签放在左侧留出的空栏里，避免压图 */
function LinerSection(props: { vp: VolumeParams; joint: JointParams }) {
  const { vp, joint } = props
  const W = 620
  const H = 250
  const prof = useMemo(() => meridianProfile(vp, 90), [vp])
  const R_out = joint.R_in + joint.t1
  const maxR = Math.max(vp.R_in, R_out) + 8
  const span = vp.l / 2 + headMinorAxis(vp) + 40
  const gutter = 100
  const sc = Math.min((W - gutter - 78) / span, (H - 46) / maxR)
  const cx = gutter
  const mid = H - 30
  const X = (y: number) => cx + (y + vp.l / 2) * sc
  const Y = (r: number) => mid - r * sc

  const head = prof.map((p) => `${X(vp.l / 2 + p.z).toFixed(1)},${Y(p.r).toFixed(1)}`).join(' L')
  const xEnd = X(vp.l / 2 + headMinorAxis(vp))
  const marks = [
    { r: joint.r0, label: `通孔 r₀ ${joint.r0}`, c: '#475569' },
    { r: joint.r0 + joint.t4, label: `颈根 r_n ${joint.r0 + joint.t4}`, c: '#0891b2' },
    { r: joint.r_f, label: `粘结环 r_f ${joint.r_f}`, c: '#7c3aed' },
    { r: joint.r_c, label: `回折壁 r_c ${joint.r_c}`, c: '#db2777' },
    { r: joint.r_sp, label: `分界 r_sp ${joint.r_sp}`, c: '#ca8a04' },
  ]
  // 半径挨得近时标签会叠字：自下而上强制 11 px 最小间距，虚线仍画在真实高度
  const gap = 13
  const fromBottom = marks.map((_, i) => i).sort((a, b) => Y(marks[a].r) - Y(marks[b].r)).reverse()
  const labelY: number[] = new Array(marks.length)
  fromBottom.forEach((m, k) => {
    const real = Y(marks[m].r) - 2
    labelY[m] = k === 0 ? real : Math.min(real, labelY[fromBottom[k - 1]] - gap)
  })
  return (
    <svg className="viz" viewBox={`0 0 ${W} ${H}`}>
      {/* 旋转轴 */}
      <line x1={6} y1={14} x2={W - 8} y2={14} stroke="#cbd5e1" strokeDasharray="5,4" />
      <text x={W - 10} y={11} fontSize="9" fill="#94a3b8" textAnchor="end">
        旋转轴
      </text>
      {/* 瓶口区各半径：水平虚线 + 左侧标签 */}
      {marks.map((b, i) => (
        <g key={b.label}>
          <line x1={gutter - 4} y1={Y(b.r)} x2={xEnd} y2={Y(b.r)} stroke={b.c} strokeWidth="0.8" strokeDasharray="3,3" opacity="0.7" />
          {Math.abs(labelY[i] - (Y(b.r) - 2)) > 1 && (
            <line x1={gutter - 4} y1={Y(b.r)} x2={gutter - 10} y2={labelY[i] + 2} stroke={b.c} strokeWidth="0.6" opacity="0.5" />
          )}
          <SvgSym x={6} y={labelY[i]} t={b.label} fs={9} fill={b.c} halo />
        </g>
      ))}
      {/* 筒身内壁 / 外壁 */}
      <line x1={X(-vp.l / 2)} y1={Y(vp.R_in)} x2={X(vp.l / 2)} y2={Y(vp.R_in)} stroke="#1e3a5f" strokeWidth="1.6" />
      <line x1={X(-vp.l / 2)} y1={Y(R_out)} x2={X(vp.l / 2)} y2={Y(R_out)} stroke="#94a3b8" strokeWidth="1.1" />
      {/* 封头内表面 */}
      <path d={`M${head}`} fill="none" stroke="#1e3a5f" strokeWidth="1.6" />
      {/* 极孔端面 */}
      <line x1={xEnd} y1={Y(joint.r0)} x2={xEnd} y2={Y(R_out)} stroke="#475569" strokeWidth="1.2" />
      <line x1={X(vp.l / 2)} y1={mid} x2={X(vp.l / 2)} y2={Y(maxR)} stroke="#cbd5e1" strokeDasharray="4,4" />
      <text x={X(vp.l / 2) + 3} y={Y(maxR) + 8} fontSize="9" fill="#94a3b8">
        赤道
      </text>
      <text x={xEnd + 4} y={Y(joint.r0) + 3} fontSize="9" fill="#475569">
        极孔端面
      </text>
      <text x={gutter} y={H - 10} fontSize="9" fill="#94a3b8">
        筒身段（内壁与外壁）
      </text>
    </svg>
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
  const [joint, setJoint] = useState<JointParams>({ ...PLUGIN_JOINT_DEFAULT, R_in: R })

  const solved = useMemo(() => solveGeometry(vp, unknown, targetL), [vp, unknown, targetL])
  const shown = solved.params
  const vol = computeVolume(vp)
  const turns = useMemo(() => windingTurns(vp), [vp])
  const matches = useMemo(() => matchLineType(turns.roundTrip), [turns.roundTrip])
  const jd = useMemo(() => deriveJoint(joint, turns.alpha0Deg), [joint, turns.alpha0Deg])
  const checks = useMemo(() => checkJoint(joint, jd, turns.alpha0Deg), [joint, jd, turns.alpha0Deg])
  const hints = useMemo(() => geometryChecks(vp), [vp])

  const set = (patch: Partial<VolumeParams>) => setVp((s) => ({ ...s, ...patch }))
  const setJ = (patch: Partial<JointParams>) => setJoint((s) => ({ ...s, ...patch }))

  return (
    <>
      <div className="card">
        <h3>
          几何板块 — 容积与尺寸互算
          <span className="tail">半椭球封头 · 填三个量解第四个</span>
        </h3>
        <div className="dome">
          <div className="pane">
            <div className="field">
              <span className="lbl">要求</span>
              <select value={unknown} onChange={(e) => setUnknown(e.target.value as UnknownField)}>
                <option value="none">按尺寸算容积</option>
                <option value="l">已知容积，反算筒身长度</option>
                <option value="R_in">已知容积，反算筒身内半径</option>
                <option value="lambda">已知容积，反算封头轴比</option>
              </select>
              <span className="unit" />
            </div>
            {unknown !== 'none' && <N label="目标容积" value={targetL} unit="L" step={1} onChange={setTargetL} />}
            <N label={sym('筒身内半径 R_in（=D/2−t）')} value={vp.R_in} unit="mm" step={0.5} onChange={(v) => set({ R_in: v })} />
            <N label="筒身段长度 l" value={vp.l} unit="mm" step={10} onChange={(v) => set({ l: v })} />
            <N label={sym('封头轴比 λ = a/b')} value={Number(vp.lambda.toFixed(3))} step={0.01} onChange={(v) => set({ lambda: v })} />
            <N label="极孔半径 r₀（阀座通孔）" value={vp.r0} unit="mm" step={0.5} onChange={(v) => set({ r0: v })} />
            <N label={sym('阀座容积折减 K_f')} value={vp.Kf} step={0.05} onChange={(v) => set({ Kf: v })} />
            <div className="hint">
              {sym('封头深度 b = R_in / λ = ')}
              <b>{f(headMinorAxis(vp))}</b>
              {sym(' mm。这里的 R_in 是内胆外表面半径，与铺层设计里的缠绕层受力半径 R（当前 ')}
              {R}
              {sym(' mm）不是同一个量。')}
            </div>
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
                  <span>{c.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="pane">
            <h4>内胆纵剖面（半剖）</h4>
            <div className="sub">左侧标出瓶口区各半径的高度位置</div>
            <LinerSection vp={shown} joint={joint} />
            <div className="hint warn" style={{ marginTop: 6 }}>
              {sym('缠绕极孔 r_cl = R_out·sinα₀ = ')}
              <b>{f(jd.rCl, 1)}</b>
              {sym(' mm，与阀座通孔 r₀ = ')}
              <b>{joint.r0}</b>
              {sym(' mm 是两个不同的量：前者决定纤维铺到哪里，后者是瓶口的物理孔径。')}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>
          缠绕线型与瓶口尺寸
          <span className="tail">切点校验 · Ⅳ型瓶瓶口区</span>
        </h3>
        <div className="dome">
          <div className="pane">
            <h4>单程 / 双程缠绕转角</h4>
            <div className="sub">按筒身长度与极孔半径算出转角，再与线型表比对</div>
            <div className="derived">
              <div>
                {sym('α₀ = arcsin(r₀/R_in)')} = <b>{f(turns.alpha0Deg, 3)}°</b>
              </div>
              <div>
                筒身段转角 γ = <b>{f(turns.gamma)}</b>°　封头段转角 β = <b>{f(turns.beta)}</b>°
              </div>
              <div>
                {sym('单程 θ_t')} = <b>{f(turns.oneWay)}</b>°　{sym('双程 θ_n')} = <b>{f(turns.roundTrip)}</b>°
              </div>
            </div>
            <div className="tablewrap" style={{ maxHeight: 170, marginTop: 8 }}>
              <table className="grid">
                <thead>
                  <tr>
                    <th>线型转角 θ</th>
                    <th>切点数 n</th>
                    <th>K</th>
                    <th>m</th>
                    <th>与双程转角差</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.length === 0 && (
                    <tr>
                      <td colSpan={5} className="bad">
                        ±45° 内没有可用的线型解：需调整筒身长度或缠绕角
                      </td>
                    </tr>
                  )}
                  {matches.map((m) => (
                    <tr key={`${m.n}-${m.K}-${m.m}`}>
                      <td>{f(m.theta, 1)}°</td>
                      <td>{m.n}</td>
                      <td>{m.K}</td>
                      <td>{m.m}</td>
                      <td className={Math.abs(m.dev) < 10 ? 'ok' : 'bad'}>
                        {m.dev >= 0 ? '+' : ''}
                        {f(m.dev, 2)}°
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hint">
              选表原则：切点数少者优先（极孔处不易架空、应力集中小）。θ = 360°(m + K/n)。
            </div>
          </div>
          <div className="pane">
            <h4>瓶口区尺寸</h4>
            <div className="sub">常用取值已预填，全部可改</div>
            <div className="fields2">
              <N label={sym('分界半径 r_sp')} value={joint.r_sp} unit="mm" onChange={(v) => setJ({ r_sp: v })} />
              <N label={sym('粘结界面环 r_f')} value={joint.r_f} unit="mm" onChange={(v) => setJ({ r_f: v })} />
              <N label={sym('回折壁半径 r_c')} value={joint.r_c} unit="mm" onChange={(v) => setJ({ r_c: v })} />
              <N label="阀座通孔 r₀" value={joint.r0} unit="mm" onChange={(v) => setJ({ r0: v })} />
              <N label={sym('颈壁厚 t_4')} value={joint.t4} unit="mm" onChange={(v) => setJ({ t4: v })} />
              <N label={sym('界面圆角 R_if')} value={joint.R_if} unit="mm" onChange={(v) => setJ({ R_if: v })} />
              <N label={sym('内肩外圆角 R_so')} value={joint.R_so} unit="mm" onChange={(v) => setJ({ R_so: v })} />
              <N label={sym('内肩内圆角 R_si')} value={joint.R_si} unit="mm" onChange={(v) => setJ({ R_si: v })} />
              <N label={sym('环端面偏移 l_tip')} value={joint.l_tip} unit="mm" onChange={(v) => setJ({ l_tip: v })} />
              <N label={sym('颈圆角 R_nf')} value={joint.R_nf} unit="mm" onChange={(v) => setJ({ R_nf: v })} />
              <N label={sym('孔底圆角 R_bf')} value={joint.R_bf} unit="mm" onChange={(v) => setJ({ R_bf: v })} />
              <N label={sym('直筒壁厚 t_1')} value={joint.t1} unit="mm" onChange={(v) => setJ({ t1: v })} />
              <N label={sym('直筒长 l_1')} value={joint.l1} unit="mm" onChange={(v) => setJ({ l1: v })} />
              <N label="端面间距 L" value={joint.L} unit="mm" onChange={(v) => setJ({ L: v })} />
            </div>
            <div className="derived">
              <div>
                {sym('外半径 R_out')} = <b>{f(jd.R_out, 1)}</b>　{sym('颈根半径 r_n')} = <b>{f(jd.r_n, 1)}</b>　接头高度 H ={' '}
                <b>{f(jd.H, 1)}</b> mm
              </div>
              <div>
                颈直段 = <b>{f(jd.neckStraight)}</b> mm　内肩直段 = <b>{f(jd.shoulderFlat, 1)}</b> mm　封头分界深度{' '}
                {sym('z_sp')} = <b>{f(jd.z_sp)}</b> mm
              </div>
              <div>
                {sym('缠绕极孔 r_cl')} = <b>{f(jd.rCl, 2)}</b> mm　阀座通孔 r₀ = <b>{joint.r0}</b> mm　接头覆盖到{' '}
                {sym('r_sp')} = <b>{joint.r_sp}</b> mm
              </div>
              <div>
                封头参与判定的范围取铺层自身的量：所有角度都铺到的最小平行圆 = <b>{f(result.dome.rFull, 1)}</b> mm（当前生效{' '}
                {f(effectiveRBoss(input), 1)} mm）
              </div>
            </div>
            <div className="tablewrap" style={{ maxHeight: 200, marginTop: 8 }}>
              <table className="grid">
                <thead>
                  <tr>
                    <th>检查项</th>
                    <th>结果</th>
                    <th style={{ textAlign: 'left' }}>数值</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={c.name + c.text}>
                      <td>{sym(c.name)}</td>
                      <td className={c.ok ? 'ok' : 'bad'}>{c.ok ? '通过' : '不通过'}</td>
                      <td style={{ textAlign: 'left', whiteSpace: 'normal', fontSize: 11 }}>{sym(c.text)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hint">
              接头段长度不设输入，全部由圆角相切关系定位；颈圆角与封头外曲线的切点用数值求根，没有闭式解。
              螺纹与密封面几何不在本软件范围内。
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
