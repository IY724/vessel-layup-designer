/**
 * GeometryPanel.tsx — 几何板块（容积↔尺寸互算、内胆轮廓、线型切点校验、Ⅳ型瓶接头尺寸）
 *
 * 初值从当前铺层输入带过来（R、缠绕极孔 r₀、封头短半轴 → λ），之后各填各的：
 * 几何用**内表面半径 R_in**，铺层用**缠绕层受力半径 R**，插件里两者也是分开的。
 */
import { useMemo, useState } from 'react'
import type { CheckResult, DesignInput } from '../core/types'
import {
  PLUGIN_JOINT_DEFAULT,
  bossZoneRadius,
  checkJoint,
  computeVolume,
  deriveJoint,
  geometryChecks,
  headMinorAxis,
  lambdaFromDepth,
  lineTypeTable,
  matchLineType,
  meridianProfile,
  solveGeometry,
  windingTurns,
  type JointParams,
  type UnknownField,
  type VolumeParams,
} from '../core/geometry'
import { effectiveRBoss } from '../core/checker'

const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

function N(props: { label: string; value: number; onChange: (v: number) => void; unit?: string; step?: number }) {
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

/** 内胆内表面纵剖面（半剖）：筒身 + 半椭球封头 + 极孔/接头区半径标记 */
function LinerSection(props: { vp: VolumeParams; joint: JointParams }) {
  const { vp, joint } = props
  const W = 620
  const H = 250
  const prof = useMemo(() => meridianProfile(vp, 90), [vp])
  const R_out = joint.R_in + joint.t1
  const maxR = Math.max(vp.R_in, R_out) + 8
  const span = vp.l / 2 + headMinorAxis(vp) + 40
  const sc = Math.min((W / 2 - 60) / span, (H - 46) / maxR)
  const cx = 30
  const mid = H - 34
  const X = (y: number) => cx + (y + vp.l / 2) * sc
  const Y = (r: number) => mid - r * sc

  const head = prof.map((p) => `${X(vp.l / 2 + p.z).toFixed(1)},${Y(p.r).toFixed(1)}`).join(' L')
  const boss = [
    { r: joint.r0, label: `r₀ ${joint.r0}`, c: '#64748b' },
    { r: joint.r0 + joint.t4, label: `r_n ${joint.r0 + joint.t4}`, c: '#0891b2' },
    { r: joint.r_f, label: `r_f ${joint.r_f}`, c: '#7c3aed' },
    { r: joint.r_c, label: `r_c ${joint.r_c}`, c: '#db2777' },
    { r: joint.r_sp, label: `r_sp ${joint.r_sp}`, c: '#ca8a04' },
  ]
  const rCl = vp.r0 // 铺层模型里的"缠绕极孔半径"就是 Clairaut 常数 R·sinα₀
  return (
    <svg className="viz" viewBox={`0 0 ${W} ${H}`}>
      <line x1={cx} y1={12} x2={W - 10} y2={12} stroke="#cbd5e1" strokeDasharray="5,4" />
      <text x={cx + 2} y={22} fontSize="9" fill="#94a3b8">
        旋转轴
      </text>
      {/* 筒身内壁 */}
      <line x1={X(-vp.l / 2)} y1={Y(vp.R_in)} x2={X(vp.l / 2)} y2={Y(vp.R_in)} stroke="#1e3a5f" strokeWidth="1.6" />
      {/* 封头内表面 */}
      <path d={`M${head}`} fill="none" stroke="#1e3a5f" strokeWidth="1.6" />
      {/* 外表面（壁厚 t1） */}
      <line x1={X(-vp.l / 2)} y1={Y(R_out)} x2={X(vp.l / 2)} y2={Y(R_out)} stroke="#94a3b8" strokeWidth="1.1" />
      {/* 极孔端面 */}
      <line x1={X(vp.l / 2 + headMinorAxis(vp))} y1={Y(joint.r0)} x2={X(vp.l / 2 + headMinorAxis(vp))} y2={Y(R_out)} stroke="#64748b" strokeWidth="1.2" />
      {boss.map((b, i) => (
        <g key={b.r}>
          <line x1={X(-vp.l / 2 - 14)} y1={Y(b.r)} x2={X(vp.l / 2 + 6)} y2={Y(b.r)} stroke={b.c} strokeWidth="0.8" strokeDasharray="3,3" opacity="0.75" />
          <text x={cx + 4} y={20 + i * 11} fontSize="9" fill={b.c}>
            {b.label}
          </text>
        </g>
      ))}
      <line x1={X(vp.l / 2)} y1={Y(0) - 4} x2={X(vp.l / 2)} y2={Y(maxR)} stroke="#cbd5e1" strokeDasharray="4,4" />
      <text x={X(vp.l / 2) + 3} y={Y(maxR) + 8} fontSize="9" fill="#94a3b8">
        赤道
      </text>
      <text x={X(vp.l / 2 + headMinorAxis(vp)) + 4} y={Y(joint.r0) - 4} fontSize="9" fill="#64748b">
        极孔端面
      </text>
      <text x={cx + 4} y={20 + boss.length * 11 + 2} fontSize="9" fill="#b91c1c">
        缠绕极孔 r_cl={f(rCl, 1)}（=R_out·sinα₀）≠ 通孔 r₀={joint.r0}
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
  const boss = bossZoneRadius(jd, joint)

  const set = (patch: Partial<VolumeParams>) => setVp((s) => ({ ...s, ...patch }))
  const setJ = (patch: Partial<JointParams>) => setJoint((s) => ({ ...s, ...patch }))

  return (
    <>
      <div className="card">
        <h3>
          <span className="n">7</span>
          几何板块 — 容积↔尺寸互算与内胆轮廓
          <span className="tail">朱宁式(2.6/2.7) · 半椭球封头 · Ⅳ型瓶（塑料内胆）口径</span>
        </h3>
        <div className="dome">
          <div className="pane">
            <div className="field">
              <span className="lbl">求解目标</span>
              <select value={unknown} onChange={(e) => setUnknown(e.target.value as UnknownField)}>
                <option value="none">正算容积</option>
                <option value="l">已知容积 → 反算筒身长度 l</option>
                <option value="R_in">已知容积 → 反算筒身内半径 R_in</option>
                <option value="lambda">已知容积 → 反算封头轴比 λ</option>
              </select>
              <span className="unit" />
            </div>
            {unknown !== 'none' && <N label="目标容积" value={targetL} unit="L" step={1} onChange={setTargetL} />}
            <N label="筒身内半径 R_in（=D/2−t）" value={vp.R_in} unit="mm" step={0.5} onChange={(v) => set({ R_in: v })} />
            <N label="筒身段长度 l" value={vp.l} unit="mm" step={10} onChange={(v) => set({ l: v })} />
            <N label="封头轴比 λ = a/b" value={Number(vp.lambda.toFixed(3))} step={0.01} onChange={(v) => set({ lambda: v })} />
            <N label="极孔半径 r₀（物理孔径）" value={vp.r0} unit="mm" step={0.5} onChange={(v) => set({ r0: v })} />
            <N label="阀座容积折减 K_f" value={vp.Kf} step={0.05} onChange={(v) => set({ Kf: v })} />
            <div className="hint">
              ↳ 封头深度 b = R_in/λ = <b>{f(headMinorAxis(vp))}</b> mm（Excel 表 C14「封头短半轴」就是这个量）
              <br />
              ↳ R_in 是内胆外表面半径，与铺层设计里的缠绕层受力半径 R（当前 {R} mm）不是同一个量
            </div>
            <div className="derived">
              <div>
                容积 V = 封头 <b>{f(vol.headMm3 / 1e6)}</b> + 筒身 <b>{f(vol.cylMm3 / 1e6)}</b> ={' '}
                <b>{f(computeVolume(solved.params).totalL, 3)} L</b>
              </div>
              {unknown !== 'none' && (
                <div style={{ color: solved.ok ? '#15803d' : '#b91c1c' }}>
                  {solved.ok ? `✓ ${solved.solved}` : `✗ ${solved.solved}`}
                </div>
              )}
            </div>
            {hints.map((c) => (
              <div key={c.text} className={`banner ${c.level === 'ok' ? 'ok' : ''}`} style={{ marginTop: 6 }}>
                <span>{c.level === 'ok' ? '✓' : '⚠'}</span>
                <div>{c.text}</div>
              </div>
            ))}
          </div>
          <div className="pane">
            <LinerSection vp={shown} joint={joint} />
          </div>
        </div>
      </div>

      <div className="card">
        <h3>
          <span className="n">8</span>
          线型缠绕切点校验与Ⅳ型瓶接头尺寸
          <span className="tail">郑强表2-1 · 插件 type4_builder_kernel.py 口径</span>
        </h3>
        <div className="dome">
          <div className="pane">
            <b style={{ color: '#1e3a5f' }}>单程/双程转角（郑强式2-4）</b>
            <div className="derived" style={{ marginTop: 6 }}>
              <div>α₀ = arcsin(r₀/R_in) = <b>{f(turns.alpha0Deg, 3)}°</b></div>
              <div>γ（筒身段）= <b>{f(turns.gamma)}</b>°　β（封头段）= <b>{f(turns.beta)}</b>°</div>
              <div>单程 θ′_t = <b>{f(turns.oneWay)}</b>°　双程 θ′_n = <b>{f(turns.roundTrip)}</b>°</div>
            </div>
            <div className="tablewrap" style={{ maxHeight: 170, marginTop: 8 }}>
              <table className="grid">
                <thead>
                  <tr>
                    <th>θ = 360°(m+K/n)</th>
                    <th>切点数 n</th>
                    <th>K</th>
                    <th>m</th>
                    <th>与 θ′_n 偏差</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.length === 0 && (
                    <tr>
                      <td colSpan={5} className="bad">
                        ±45° 内无线型解：需调整筒身长度或缠绕角（可放宽匹配窗口）
                      </td>
                    </tr>
                  )}
                  {matches.map((m) => (
                    <tr key={`${m.n}-${m.K}-${m.m}`}>
                      <td>{f(m.theta, 1)}°</td>
                      <td className={m.n <= 4 ? 'ok' : ''}>{m.n}</td>
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
              ↳ 选表原则：切点少者优（极孔架空与应力集中小）。表由 θ=360°(m+K/n) 生成，
              与郑强表2-1 逐格核对；朱宁引用的 n=4、θ_n=630° 即 m=1、K=3。
              线型表共 {lineTypeTable().length} 格。
            </div>
          </div>
          <div className="pane">
            <b style={{ color: '#1e3a5f' }}>Ⅳ型瓶接头尺寸（插件默认值可改）</b>
            <div className="kv" style={{ marginTop: 6 }}>
              <N label="分界半径 r_sp" value={joint.r_sp} unit="mm" onChange={(v) => setJ({ r_sp: v })} />
              <N label="粘结界面环 r_f" value={joint.r_f} unit="mm" onChange={(v) => setJ({ r_f: v })} />
              <N label="回折壁半径 r_c" value={joint.r_c} unit="mm" onChange={(v) => setJ({ r_c: v })} />
              <N label="阀座通孔 r₀" value={joint.r0} unit="mm" onChange={(v) => setJ({ r0: v })} />
              <N label="颈壁厚 t₄" value={joint.t4} unit="mm" onChange={(v) => setJ({ t4: v })} />
              <N label="界面圆角 R_if" value={joint.R_if} unit="mm" onChange={(v) => setJ({ R_if: v })} />
              <N label="内肩外圆角 R_so" value={joint.R_so} unit="mm" onChange={(v) => setJ({ R_so: v })} />
              <N label="内肩内圆角 R_si" value={joint.R_si} unit="mm" onChange={(v) => setJ({ R_si: v })} />
              <N label="环端面偏移 l_tip" value={joint.l_tip} unit="mm" onChange={(v) => setJ({ l_tip: v })} />
              <N label="颈圆角 R_nf" value={joint.R_nf} unit="mm" onChange={(v) => setJ({ R_nf: v })} />
              <N label="孔底圆角 R_bf" value={joint.R_bf} unit="mm" onChange={(v) => setJ({ R_bf: v })} />
              <N label="直筒壁厚 t₁" value={joint.t1} unit="mm" onChange={(v) => setJ({ t1: v })} />
              <N label="直筒长 l₁" value={joint.l1} unit="mm" onChange={(v) => setJ({ l1: v })} />
              <N label="端面间距 L" value={joint.L} unit="mm" onChange={(v) => setJ({ L: v })} />
            </div>
            <div className="derived">
              <div>
                R_out=<b>{f(jd.R_out, 1)}</b>　r_n=<b>{f(jd.r_n, 1)}</b>　y_eq=<b>{f(jd.y_eq, 1)}</b>　H=<b>{f(jd.H, 1)}</b>
              </div>
              <div>
                z_28=<b>{f(jd.z_28, 1)}</b>　z_35=<b>{f(jd.z_35, 1)}</b>　封头分界深度 z_sp=<b>{f(jd.z_sp)}</b> mm
              </div>
              <div>
                颈直段=<b>{f(jd.neckStraight)}</b> mm（yc={f(jd.yc)} 由 R_nf 相切数值求解）　内肩直段=<b>{f(jd.shoulderFlat, 1)}</b> mm
              </div>
              <div style={{ color: '#b91c1c' }}>
                缠绕极孔 r_cl=<b>{f(jd.rCl, 2)}</b> mm ≠ 通孔 r₀=<b>{joint.r0}</b> mm；接头覆盖到 r_sp=<b>{joint.r_sp}</b> mm
              </div>
              <div>
                → 封头判定窗口下界建议 r_boss ≈ <b>{f(boss.suggest, 1)}</b> mm（当前生效 {f(effectiveRBoss(input), 1)} mm）
              </div>
            </div>
            <div className="tablewrap" style={{ maxHeight: 200, marginTop: 8 }}>
              <table className="grid">
                <thead>
                  <tr>
                    <th>约束</th>
                    <th>判定</th>
                    <th style={{ textAlign: 'left' }}>数值</th>
                    <th>出处</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={c.name + c.text}>
                      <td>{c.name}</td>
                      <td className={c.ok ? 'ok' : 'bad'}>{c.ok ? '✓' : '✗'}</td>
                      <td style={{ textAlign: 'left', whiteSpace: 'normal', fontSize: 11 }}>{c.text}</td>
                      <td className="tag">{c.src}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hint">
              ↳ 接头段长度不设输入，全部由圆角相切关系定位（kernel:17-19）；R_nf 与封头外曲线的切点为数值求根，
              无闭式解。螺纹/密封面几何插件未建，需要时另行补充。
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
