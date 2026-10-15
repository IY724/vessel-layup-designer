/**
 * DomePanel.tsx — 封头校核面板（规划 §6.3 定稿）
 *  左：椭球截面"一层层"厚度轮廓线（平躺：旋转轴水平置底、极孔在左、赤道在右、轮廓向上拱）
 *  右：p总(r)×ks 曲线（pb 水平线、薄弱区红色着色、接嘴补强区灰化、hover 读数）
 * 两图与铺层表实时联动（改层数即重绘），均可 放大。
 */
import { useMemo, useState } from 'react'
import type { CheckResult, DesignInput } from '../core/types'
import { domeAt } from '../core/dome'
import { effectiveRBoss } from '../core/checker'
import { angleColor } from './colors'
import { FormulaHelp } from './FormulaHelp'
import { sym } from './Sym'

const n = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

interface Geom {
  sc: number
  /** 极孔端 x（左） */
  x0: number
  /** 赤道（封头与筒身交界）x（右） */
  xEq: number
  /** 筒身段末端 x */
  xCylEnd: number
  /** 旋转轴（水平置底）y */
  axisY: number
  /** 参考面（缠绕层内表面）轮廓 */
  outer: string
  /** 内衬内表面 */
  inner: string
  layers: Array<{ angle: number; color: string; d: string }>
  boss: { x: number; y: number; w: number; h: number }
  /** 筒身段三条壁厚线（参考面 / 螺旋层外 / 总厚外）的 y */
  wallYs: number[]
  peakTotal: { t: number; r: number; x: number; y: number }
  /** 每组的 r0g（该组开始铺到的平行圆）与 r2b（样条→覆盖切换点）在图上的位置 */
  marks: Array<{ angle: number; color: string; r0: [number, number]; r2b: [number, number] | null }>
  rStart: number
  /** 按实际内容定的画布宽高（避免图形周围留大片空白） */
  usedH: number
  usedW: number
  /** 图例换行：每行条目数、总行数 */
  perRow: number
  legendRows: number
}

function buildGeom(input: DesignInput, result: CheckResult, W: number, H: number): Geom {
  const R = input.geometry.R
  const hAxis = input.geometry.headShortAxis || R
  const groups = result.dome.groups
  const wall = result.cylinder.totalThickness
  const spiralThk = result.cylinder.spiralThickness
  const liner = input.geometry.linerThickness || 3
  const prof = result.dome.profile
  const rStart = prof.length ? prof[0].r : R * 0.2
  const maxT = Math.max(1, ...prof.map((p) => p.tTotal))

  // 平躺：极孔在左、赤道在右、轮廓向上拱（横轴=轴向，纵轴=半径）；固定画布尺寸，与右图等大
  const pad = 16
  const perRow = Math.max(3, Math.floor((W - 40) / 62))
  const legendRows = Math.ceil((groups.length + 1) / perRow)
  const top = pad + 6
  const bottom = pad + 6 + legendRows * 13
  const sc = Math.min((W - 2 * pad) / hAxis, (H - top - bottom) / (R + maxT + 4))
  const x0 = Math.max(pad, (W - hAxis * sc) / 2)
  const axisY = top + (R + maxT + 4) * sc
  const xEq = x0 + hAxis * sc
  const xCylEnd = xEq
  const usedW = W
  const usedH = H

  // 椭圆子午线：轴向距离（从极孔顶点起算）a(r) = h·(1−√(1−(r/R)²))
  const aOf = (r: number) => hAxis * (1 - Math.sqrt(Math.max(0, 1 - (r / R) ** 2)))
  const N = 64
  const rs = Array.from({ length: N }, (_, i) => rStart + ((R - rStart) * i) / (N - 1))
  const Ps: Array<[number, number]> = rs.map((r) => [x0 + aOf(r) * sc, axisY - r * sc])
  const normals = Ps.map((_, i) => {
    const a = Ps[Math.max(0, i - 1)]
    const b = Ps[Math.min(N - 1, i + 1)]
    const tx = b[0] - a[0]
    const ty = b[1] - a[1]
    const L = Math.hypot(tx, ty) || 1
    return [ty / L, -tx / L] as const
  })
  const path = (pts: Array<[number, number]>) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')
  const off = (d: number) =>
    Ps.map(([x, y], i) => [x + normals[i][0] * d * sc, y + normals[i][1] * d * sc] as [number, number])

  // 逐组累加外表面：顺序 = 用户给定的缠绕先后，最后一组即最外层
  const cum: number[][] = []
  let acc: number[] = new Array(N).fill(0)
  groups.forEach((g) => {
    acc = acc.map((v, i) => v + domeAt([g], rs[i], R, result.derived.sigmaComposite, 1).tGroups[0])
    cum.push([...acc])
  })
  const layers = groups.map((g, gi) => {
    const pts = Ps.map(([x, y], i) => {
      const d = cum[gi][i]
      return [x + normals[i][0] * d * sc, y + normals[i][1] * d * sc] as [number, number]
    })
    return { angle: g.angle, color: angleColor(g.angle, gi), d: path(pts) }
  })

  const peakIdx = prof.reduce((b, p, i) => (p.tTotal > prof[b].tTotal ? i : b), 0)
  const pk = prof[peakIdx] ?? { r: rStart, tTotal: 0 }
  const px = x0 + aOf(pk.r) * sc
  const py = axisY - pk.r * sc

  // 标记点：取最近格点位置 + 该处累计厚度沿法向偏移
  const markAt = (r: number, gi: number): [number, number] => {
    const i = Math.max(0, Math.min(N - 1, Math.round(((r - rStart) / Math.max(1e-9, R - rStart)) * (N - 1))))
    const d = r <= rs[i] ? cum[gi][i] : 0
    return [Ps[i][0] + normals[i][0] * d * sc, Ps[i][1] + normals[i][1] * d * sc]
  }
  const marks = groups.map((g, gi) => ({
    angle: g.angle,
    color: angleColor(g.angle, gi),
    r0: markAt(g.r0, gi),
    r2b: g.r2b <= R ? markAt(g.r2b, gi) : null,
  }))

  return {
    sc,
    x0,
    xEq,
    xCylEnd,
    axisY,
    outer: path(Ps),
    inner: path(off(-liner)),
    layers,
    boss: { x: x0 - 7, y: axisY - rStart * sc, w: 7, h: rStart * sc },
    wallYs: [axisY - R * sc, axisY - (R + spiralThk) * sc, axisY - (R + wall) * sc],
    peakTotal: { t: pk.tTotal, r: pk.r, x: px, y: py },
    marks,
    rStart,
    usedH,
    usedW,
    perRow,
    legendRows,
  }
}

export interface ContourOpts {
  layers?: boolean
  r0Marks?: boolean
  r2bMarks?: boolean
}

export function DomeContour(props: { input: DesignInput; result: CheckResult; W?: number; H?: number; opts?: ContourOpts }) {
  const W = props.W ?? 560
  const H = props.H ?? 380
  const g = useMemo(() => buildGeom(props.input, props.result, W, H), [props.input, props.result, W, H])
  const VH = g.usedH
  const VW = g.usedW
  const groups = props.result.dome.groups
  const o = { layers: true, r0Marks: true, r2bMarks: true, ...props.opts }

  /** 图例条目：内衬 + 各角度组，按画布宽换行，最后一行贴着画布底边 */
  const legend: Array<{ label: string; color: string }> = [
    { label: '内衬', color: '#94a3b8' },
    ...groups.map((gr, i) => ({ label: `${gr.angle}°×${gr.layers} 层`, color: angleColor(gr.angle, i) })),
  ]
  const legendTop = VH - 10 - (g.legendRows - 1) * 13

  return (
    <svg className="viz" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label="封头厚度几何轮廓">
      {/* 内衬内表面 */}
      <path d={g.inner} fill="none" stroke="#94a3b8" strokeWidth="1.2" />
      {/* 各角度组外表面轮廓线（按缠绕先后堆叠，最后一组为最外层） */}
      {o.layers &&
        g.layers.map((l) => <path key={l.angle} d={l.d} fill="none" stroke={l.color} strokeWidth="1.3" />)}
      {/* 起铺点：该组开始铺到的平行圆 */}
      {o.r0Marks &&
        g.marks.map((mk) => (
          <circle key={`r0-${mk.angle}`} cx={mk.r0[0]} cy={mk.r0[1]} r="2.8" fill="#fff" stroke={mk.color} strokeWidth="1.4" />
        ))}
      {/* 样条 → 覆盖公式的衔接点 */}
      {o.r2bMarks &&
        g.marks.filter((mk) => mk.r2b).map((mk) => (
          <g key={`r2b-${mk.angle}`}>
            <rect x={mk.r2b![0] - 2.2} y={mk.r2b![1] - 2.2} width="4.4" height="4.4" fill="#fff" stroke={mk.color} strokeWidth="1.3" />
          </g>
        ))}
      {/* 封头外表面加粗 */}
      <path d={g.outer} fill="none" stroke="#1e3a5f" strokeWidth="1.7" />
      {/* 峰值标注 */}
      <text x={Math.min(VW - 156, g.peakTotal.x + 10)} y={Math.max(24, g.peakTotal.y - 6)} fontSize="10" fontWeight="bold" fill="#1e3a5f">
        最厚 {n(g.peakTotal.t)} mm @ r≈{n(g.peakTotal.r, 0)}
      </text>
      {/* 图例 */}
      <g fontSize="9.5" fill="#475569">
        {legend.map((it, i) => {
          const x = 16 + (i % g.perRow) * 62
          const y = legendTop + Math.floor(i / g.perRow) * 13
          return (
            <g key={it.label}>
              <line x1={x} y1={y} x2={x + 14} y2={y} stroke={it.color} strokeWidth="2" />
              <text x={x + 18} y={y + 3}>
                {it.label}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}

export function PressureChart(props: {
  input: DesignInput
  result: CheckResult
  W?: number
  H?: number
}) {
  const W = props.W ?? 560
  const H = props.H ?? 380
  const [hover, setHover] = useState<number | null>(null)
  const { input, result } = props
  const R = input.geometry.R
  const { dome, derived } = result
  const pb = derived.pb
  const prof = dome.profile
  const rStart = prof.length ? prof[0].r : 0
  const rBoss = effectiveRBoss(input)

  const pad = { l: 46, r: 18, t: 18, b: 36 }
  const pMax = Math.max(pb * 1.3, ...prof.map((p) => p.pTotal)) * 1.08
  const X = (r: number) => pad.l + ((r - rStart) / Math.max(1e-6, R - rStart)) * (W - pad.l - pad.r)
  const Y = (p: number) => H - pad.b - (p / pMax) * (H - pad.t - pad.b)

  const curve = 'M' + prof.map((p) => `${X(p.r).toFixed(1)},${Y(p.pTotal).toFixed(1)}`).join(' L')

  const rTicks = [0, 0.25, 0.5, 0.75].map((t) => rStart + t * (R - rStart))
  const pTicks = [0, 0.25, 0.5, 0.75].map((t) => t * pMax)
  const hp = hover === null ? null : domeAt(dome.groups, hover, R, derived.sigmaComposite, input.requirement.ks)

  return (
    <svg
      className="viz"
      viewBox={`0 0 ${W} ${H}`}
      onMouseMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect()
        const x = ((e.clientX - box.left) / box.width) * W
        const t = (x - pad.l) / (W - pad.l - pad.r)
        setHover(rStart + Math.max(0, Math.min(1, t)) * (R - rStart))
      }}
      onMouseLeave={() => setHover(null)}
    >
      <rect
        x={X(rStart)}
        y={pad.t}
        width={Math.max(0, X(Math.min(rBoss, R)) - X(rStart))}
        height={H - pad.t - pad.b}
        fill="#94a3b8"
        opacity="0.13"
      />
      <text x={(X(rStart) + X(Math.min(rBoss, R))) / 2} y={pad.t + 12} fontSize="9" fill="#64748b" textAnchor="middle">
        极孔侧
      </text>
      <text x={(X(rStart) + X(Math.min(rBoss, R))) / 2} y={pad.t + 24} fontSize="9" fill="#64748b" textAnchor="middle">
        部分角度铺到
      </text>
      {dome.weakZones.map((z, i) => (
        <rect key={i} x={X(z.from)} y={Y(pb)} width={Math.max(1.5, X(z.to) - X(z.from))} height={Y(0) - Y(pb)} fill="#dc2626" opacity="0.16" />
      ))}
      {pTicks.map((p, i) => (
        <g key={i}>
          <line x1={pad.l} y1={Y(p)} x2={W - pad.r} y2={Y(p)} stroke="#eef2f7" />
          <text x={pad.l - 6} y={Y(p) + 3} fontSize="10" fill="#94a3b8" textAnchor="end">
            {p.toFixed(0)}
          </text>
        </g>
      ))}
      {rTicks.map((r, i) => (
        <text key={i} x={X(r)} y={H - pad.b + 14} fontSize="10" fill="#94a3b8" textAnchor="middle">
          {r.toFixed(0)}
        </text>
      ))}
      <text x={X(R)} y={H - pad.b + 14} fontSize="10" fill="#1e3a5f" fontWeight="bold" textAnchor="middle">
        R
      </text>
      <text x={W / 2} y={H - 4} fontSize="10.5" fill="#64748b" textAnchor="middle">
        平行圆半径 r (mm)
      </text>
      <text x={12} y={(pad.t + H - pad.b) / 2} fontSize="10" fill="#94a3b8" textAnchor="middle" transform={`rotate(-90 12 ${(pad.t + H - pad.b) / 2})`}>
        爆破压强 (MPa)
      </text>
      <line x1={pad.l} y1={Y(pb)} x2={W - pad.r} y2={Y(pb)} stroke="#dc2626" strokeWidth="1.5" strokeDasharray="6,4" />
      <text x={W - pad.r - 2} y={Y(pb) - 5} fontSize="10" fill="#dc2626" fontWeight="bold" textAnchor="end">
        目标爆压 {n(pb, 1)}
      </text>
      <path d={curve} fill="none" stroke="#b91c1c" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx={X(dome.minPR)} cy={Y(dome.minP)} r="4" fill="#fff" stroke="#b91c1c" strokeWidth="2" />
      <text x={X(dome.minPR)} y={Y(dome.minP) - 10} fontSize="10" fill="#b91c1c" textAnchor="middle">
        最低 {n(dome.minP, 1)} @ r≈{n(dome.minPR, 0)}
      </text>
      <circle cx={X(R)} cy={Y(prof.length ? prof[prof.length - 1].pTotal : 0)} r="3" fill="#b91c1c" />
      {hp && (
        <g>
          <line x1={X(hp.r)} y1={pad.t} x2={X(hp.r)} y2={H - pad.b} stroke="#475569" strokeWidth="0.8" strokeDasharray="3,3" />
          <circle cx={X(hp.r)} cy={Y(hp.pTotal)} r="3.5" fill="#1e3a5f" />
          <g transform={`translate(${Math.min(W - 180, Math.max(pad.l, X(hp.r) + 10))},${pad.t + 6})`}>
            <rect width="170" height={50 + hp.pGroups.length * 11} rx="5" fill="#0f172a" opacity="0.9" />
            <text x="8" y="15" fontSize="10.5" fill="#fff">
              r = {n(hp.r, 1)} mm　总厚 = {n(hp.tTotal)} mm
            </text>
            <text x="8" y="29" fontSize="10.5" fill="#fca5a5">
              此处爆压 = {n(hp.pTotal)} MPa（乘系数前 {n(hp.pSum)}）
            </text>
            <text x="8" y="42" fontSize="9.5" fill="#cbd5e1">
              参考范围 {n(rBoss, 1)} ≤ r ≤ {n(R, 1)}
            </text>
            {hp.pGroups.map((p, i) => (
              <text key={i} x="8" y={54 + i * 11} fontSize="9.5" fill={angleColor(dome.groups[i].angle, i)}>
                {dome.groups[i].angle}°：厚 {n(hp.tGroups[i], 3)} mm、爆压 {n(p, 1)} MPa
              </text>
            ))}
          </g>
        </g>
      )}
    </svg>
  )
}

export function DomePanel(props: { input: DesignInput; result: CheckResult; onExpand: (which: 'contour' | 'curve') => void }) {
  const { input, result } = props
  const [opts, setOpts] = useState<ContourOpts>({ layers: true, r0Marks: true, r2bMarks: true })
  return (
    <div className="card">
      <h3>
        封头厚度与局部参考曲线
        <span className="tail">{sym(`平衡系数 k_s = ${input.requirement.ks}`)}</span>
      </h3>
      <div className="dome">
        <div className="pane">
          <h4>封头厚度轮廓（半剖）</h4>
          <div className="sub">
            各角度组累计厚度
            <FormulaHelp
              title="封头厚度公式"
              items={[
                { frm: 't(r)=m_1+m_2 r+m_3 r^2+m_4 r^3\\quad(r_0\\le r\\le r_{2b})', desc: 'm_1…m_4 由 4 个条件定出：t(r_0) = t_p；在 r_2b 处与覆盖公式连续且斜率连续；∫2πr·t dr = V_1 + V_2（纤维体积守恒）' },
                { frm: 't(r)=\\dfrac{m_R n_R t_p}{\\pi}\\left[\\arccos\\dfrac{r_0}{r}-\\arccos\\dfrac{r_b}{r}\\right]\\quad(r>r_{2b})' },
                { frm: 'cycles=\\dfrac{n}{2}', desc: '该组缠绕循环数 = 层数 ÷ 2' },
                { frm: 't_g(r)=cycles\\cdot t(r)' },
              ]}
            />
          </div>
          <DomeContour input={input} result={result} opts={opts} />
          <div className="pane-actions">
            <button className="btn sm" onClick={() => props.onExpand('contour')}>
              放大
            </button>
            {(
              [
                ['layers', '各层轮廓线'],
                ['r0Marks', '起铺点标记'],
                ['r2bMarks', '样条衔接点'],
              ] as Array<[keyof ContourOpts, string]>
            ).map(([k, label]) => (
              <label key={k} className="radios" style={{ fontSize: 11.5 }}>
                <input type="checkbox" checked={!!opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="pane">
          <h4>局部参考爆压分布</h4>
          <div className="sub">
            局部角 K；经验初估另用筒身角 α₀
            <FormulaHelp
              title="封头爆破压强公式"
              items={[
                { frm: '\\alpha(r)=\\arcsin\\dfrac{r_0}{r}', desc: 'r 为该处平行圆半径，r_0 为该角度组的起铺圆' },
                { frm: 'u=K\\pi/180,\\quad p_g(r)=\\dfrac{2\\,t_g(r)\\,\\sigma_c}{R}\\cos^2 u' },
                { frm: 'p_{\\text{总}}(r)=k_s\\sum p_g(r)', desc: 'k_s 为应力平衡系数；图中曲线已乘 k_s' },
              ]}
            />
          </div>
          <PressureChart input={input} result={result} />
          <div className="pane-actions">
            <button className="btn sm" onClick={() => props.onExpand('curve')}>
              放大
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
