/**
 * DomePanel.tsx — 封头校核面板（规划 §6.3 定稿）
 *  左：椭球截面"一层层"厚度轮廓线（不填充：内衬灰线 + 各角度组外表面彩色轮廓 + 与筒身段衔接）
 *  右：p总(r)×ks 曲线（pb 水平线、薄弱区红色着色、接嘴补强区灰化、hover 读数、可叠加 Excel 原样口径对比）
 * 两图与铺层表实时联动（改层数即重绘），均可 ⤢ 弹出大图。
 */
import { useMemo, useState } from 'react'
import type { CheckResult, DesignInput } from '../core/types'
import { domeAt } from '../core/dome'
import { angleColor } from './colors'

const n = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

interface Geom {
  axisX: number
  top: number
  sc: number
  /** 封头外表面（最外层）与内衬内表面：半剖，只画旋转轴右侧 */
  outer: string
  inner: string
  layers: Array<{ angle: number; color: string; d: string }>
  boss: { x: number; y: number; w: number; h: number }
  equatorY: number
  cylBottom: number
  /** 筒身段壁厚线（右侧 x） */
  wallXs: number[]
  peakTotal: { t: number; r: number; x: number; y: number }
  rStart: number
  /** 按实际内容定的画布宽高（避免图形周围留大片空白） */
  usedH: number
  usedW: number
}

function buildGeom(input: DesignInput, result: CheckResult, W: number, H: number): Geom {
  const R = input.geometry.R
  const hAxis = input.geometry.headShortAxis || R
  const groups = result.dome.groups
  const tc = result.derived.tc
  const wall = result.cylinder.totalThickness
  const spiralThk = result.cylinder.spiralThickness
  const prof = result.dome.profile
  const rStart = prof.length ? prof[0].r : R * 0.2
  const maxT = Math.max(1, ...prof.map((p) => p.tTotal))

  // 半剖：旋转轴在左，右侧留标注位；比例先按宽度定，再按 H 上限回缩
  const pad = 16
  const axisX = pad + 10
  const labelW = 170
  let sc = (W - axisX - pad - labelW) / (R + maxT + 6)
  const needH = (v: number) => pad * 2 + 34 + (hAxis + maxT + v) * sc
  if (needH(wall) > H) sc = ((H - pad * 2 - 34) / (hAxis + maxT + wall)) * 0.999
  const usedW = axisX + (R + maxT + 6) * sc + labelW
  // 图例按画布宽换行，行数计入用高
  const perRow = Math.max(3, Math.floor((usedW - 90) / 54))
  const legendRows = Math.ceil(groups.length / perRow)
  const usedH = Math.min(H, needH(wall) + 24 + Math.max(0, legendRows - 1) * 13)
  const top = pad + 16
  const eqY = top + hAxis * sc

  const N = 64
  const rs = Array.from({ length: N }, (_, i) => rStart + ((R - rStart) * i) / (N - 1))
  const Ps: Array<[number, number]> = rs.map((r) => {
    const z = hAxis * Math.sqrt(Math.max(0, 1 - (r / R) ** 2))
    return [axisX + r * sc, top + (hAxis - z) * sc]
  })
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
    acc = acc.map((v, i) => v + domeAt([g], rs[i], R, result.derived.sigmaComposite, 1, input.refMode).tGroups[0])
    cum.push([...acc])
  })
  const layers = groups.map((g, gi) => {
    const pts = off(0).map(([x, y], i) => {
      const d = cum[gi][i]
      return [x + normals[i][0] * d * sc, y + normals[i][1] * d * sc] as [number, number]
    })
    return { angle: g.angle, color: angleColor(g.angle, gi), d: path(pts) }
  })

  const peakIdx = prof.reduce((b, p, i) => (p.tTotal > prof[b].tTotal ? i : b), 0)
  const pk = prof[peakIdx] ?? { r: rStart, tTotal: 0 }
  const px = axisX + pk.r * sc
  const py = top + (hAxis - hAxis * Math.sqrt(Math.max(0, 1 - (pk.r / R) ** 2))) * sc
  const bossH = Math.max(10, (tc * 2 + 6) * sc)

  return {
    axisX,
    top,
    sc,
    outer: path(Ps),
    inner: path(off(-(input.geometry.linerThickness || 3))),
    layers,
    boss: { x: axisX - 3, y: top - bossH / 2, w: rStart * sc + 8, h: bossH },
    equatorY: eqY,
    cylBottom: eqY + Math.max(38, wall * sc * 1.15),
    wallXs: [axisX + R * sc, axisX + (R + spiralThk) * sc, axisX + (R + wall) * sc],
    peakTotal: { t: pk.tTotal, r: pk.r, x: px, y: py },
    rStart,
    usedH,
    usedW,
  }
}

export function DomeContour(props: { input: DesignInput; result: CheckResult; W?: number; H?: number }) {
  const W = props.W ?? 620
  const H = props.H ?? 420
  const g = useMemo(() => buildGeom(props.input, props.result, W, H), [props.input, props.result, W, H])
  const VH = g.usedH
  const VW = g.usedW
  const groups = props.result.dome.groups
  const cy = props.result.cylinder
  const perRow = Math.max(3, Math.floor((VW - 90) / 54))

  return (
    <svg className="viz" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label="封头厚度几何轮廓">
      {/* 旋转轴 */}
      <line x1={g.axisX} y1={g.cylBottom} x2={g.axisX} y2={8} stroke="#cbd5e1" strokeDasharray="5,4" />
      <text x={g.axisX - 4} y={g.cylBottom + 12} fontSize="9" fill="#94a3b8" textAnchor="end">
        旋转轴
      </text>
      {/* 金属接嘴 / 极孔 */}
      <rect x={g.boss.x} y={g.boss.y} width={g.boss.w} height={g.boss.h} fill="#cbd5e1" stroke="#94a3b8" />
      <text x={g.boss.x + g.boss.w + 6} y={g.boss.y + 10} fontSize="10" fill="#64748b">
        极孔 r₀={n(g.rStart, 1)}
      </text>
      {/* 内衬内表面 */}
      <path d={g.inner} fill="none" stroke="#94a3b8" strokeWidth="1.2" />
      {/* 各角度组外表面轮廓线（按缠绕先后堆叠，最后一组为最外层） */}
      {g.layers.map((l) => (
        <path key={l.angle} d={l.d} fill="none" stroke={l.color} strokeWidth="1.3" />
      ))}
      {/* 封头外表面加粗 */}
      <path d={g.outer} fill="none" stroke="#1e3a5f" strokeWidth="1.7" />
      {/* 筒身段壁厚 */}
      {g.wallXs.map((x, i) => (
        <line key={i} x1={x} y1={g.equatorY} x2={x} y2={g.cylBottom} stroke={i === 1 ? '#94a3b8' : '#1e3a5f'} strokeWidth={i === 1 ? 1 : 1.5} />
      ))}
      <line x1={g.axisX} y1={g.equatorY} x2={g.wallXs[2]} y2={g.equatorY} stroke="#cbd5e1" strokeDasharray="4,4" />
      <text x={g.wallXs[2] + 5} y={g.equatorY + 3} fontSize="9" fill="#94a3b8">
        赤道 r=R
      </text>
      <text x={g.axisX + 6} y={g.cylBottom - 5} fontSize="9.5" fill="#475569">
        筒身段续 → 螺旋 {n(cy.spiralThickness)}＋环向 {n(cy.hoopThickness)} mm
      </text>
      <text x={g.axisX + 6} y={g.top + 14} fontSize="9.5" fill="#475569">
        封头（半剖）
      </text>
      {/* 峰值标注 */}
      <text x={Math.min(VW - 176, g.peakTotal.x + 12)} y={Math.max(14, g.peakTotal.y - 3)} fontSize="10" fontWeight="bold" fill="#1e3a5f">
        厚度峰值 {n(g.peakTotal.t)} mm @ r≈{n(g.peakTotal.r, 0)}
      </text>
      {/* 图例：按画布宽自动换行 */}
      <g fontSize="9.5" fill="#475569">
        <line x1={16} y1={VH - 10} x2={32} y2={VH - 10} stroke="#94a3b8" strokeWidth="2" />
        <text x={36} y={VH - 7}>
          内衬
        </text>
        {groups.map((gr, i) => (
          <g key={gr.angle} transform={`translate(${64 + (i % perRow) * 54},${Math.floor(i / perRow) * 13})`}>
            <line x1={0} y1={VH - 10} x2={16} y2={VH - 10} stroke={angleColor(gr.angle, i)} strokeWidth="2" />
            <text x={20} y={VH - 7}>
              {gr.angle}°×{gr.layers}
            </text>
          </g>
        ))}
        <text x={64 + (groups.length % perRow) * 54 + 4} y={VH - 7 + Math.floor(groups.length / perRow) * 13} fill="#94a3b8">
          轮廓线=各层外表面（按缠绕先后）
        </text>
      </g>
    </svg>
  )
}

export function PressureChart(props: {
  input: DesignInput
  result: CheckResult
  W?: number
  H?: number
  showExcel?: boolean
}) {
  const W = props.W ?? 620
  const H = props.H ?? 360
  const [hover, setHover] = useState<number | null>(null)
  const { input, result } = props
  const R = input.geometry.R
  const { dome, derived } = result
  const pb = derived.pb
  const prof = dome.profile
  const rStart = prof.length ? prof[0].r : 0
  const rBoss = Math.max(
    input.constraint.rBossAuto ? rStart + result.derived.bandTotal : input.constraint.rBoss,
    rStart,
  )

  const pad = { l: 46, r: 18, t: 18, b: 36 }
  const pMax = Math.max(pb * 1.3, ...prof.map((p) => p.pTotal)) * 1.08
  const X = (r: number) => pad.l + ((r - rStart) / Math.max(1e-6, R - rStart)) * (W - pad.l - pad.r)
  const Y = (p: number) => H - pad.b - (p / pMax) * (H - pad.t - pad.b)

  const curve = 'M' + prof.map((p) => `${X(p.r).toFixed(1)},${Y(p.pTotal).toFixed(1)}`).join(' L')
  const excelCurve = useMemo(() => {
    if (!props.showExcel) return ''
    return (
      'M' +
      prof
        .map((p) => domeAt(dome.groups, p.r, R, derived.sigmaComposite, input.requirement.ks, 'excel'))
        .map((p) => `${X(p.r).toFixed(1)},${Y(p.pTotal).toFixed(1)}`)
        .join(' L')
    )
  }, [props.showExcel, prof, pMax, W, H])

  const rTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => rStart + t * (R - rStart))
  const pTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * pMax)
  const hp = hover === null ? null : domeAt(dome.groups, hover, R, derived.sigmaComposite, input.requirement.ks, input.refMode)

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
      <text x={(X(rStart) + X(Math.min(rBoss, R))) / 2} y={H - pad.b - 10} fontSize="9" fill="#64748b" textAnchor="middle">
        金属接嘴
      </text>
      <text x={(X(rStart) + X(Math.min(rBoss, R))) / 2} y={H - pad.b + 1} fontSize="9" fill="#64748b" textAnchor="middle">
        补强区(不计入)
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
      <text x={6} y={pad.t - 5} fontSize="10" fill="#94a3b8">
        MPa
      </text>
      <line x1={pad.l} y1={Y(pb)} x2={W - pad.r} y2={Y(pb)} stroke="#dc2626" strokeWidth="1.5" strokeDasharray="6,4" />
      <text x={W - pad.r - 2} y={Y(pb) - 5} fontSize="10" fill="#dc2626" fontWeight="bold" textAnchor="end">
        设计爆压 {n(pb, 1)}
      </text>
      {props.showExcel && <path d={excelCurve} fill="none" stroke="#64748b" strokeWidth="1.6" strokeDasharray="5,3" />}
      <path d={curve} fill="none" stroke="#b91c1c" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx={X(dome.minPR)} cy={Y(dome.minP)} r="4" fill="#fff" stroke="#b91c1c" strokeWidth="2" />
      <text x={X(dome.minPR)} y={Y(dome.minP) - 10} fontSize="10" fill="#b91c1c" textAnchor="middle">
        min {n(dome.minP, 1)} @ r≈{n(dome.minPR, 0)}
      </text>
      <circle cx={X(R)} cy={Y(prof.length ? prof[prof.length - 1].pTotal : 0)} r="3" fill="#b91c1c" />
      {hp && (
        <g>
          <line x1={X(hp.r)} y1={pad.t} x2={X(hp.r)} y2={H - pad.b} stroke="#475569" strokeWidth="0.8" strokeDasharray="3,3" />
          <circle cx={X(hp.r)} cy={Y(hp.pTotal)} r="3.5" fill="#1e3a5f" />
          <g transform={`translate(${Math.min(W - 180, Math.max(pad.l, X(hp.r) + 10))},${pad.t + 6})`}>
            <rect width="170" height={50 + hp.pGroups.length * 11} rx="5" fill="#0f172a" opacity="0.9" />
            <text x="8" y="15" fontSize="10.5" fill="#fff">
              r = {n(hp.r, 1)} mm　t总 = {n(hp.tTotal)} mm
            </text>
            <text x="8" y="29" fontSize="10.5" fill="#fca5a5">
              p总×ks = {n(hp.pTotal)} MPa（未乘 {n(hp.pSum)}）
            </text>
            <text x="8" y="42" fontSize="9.5" fill="#cbd5e1">
              判定窗口 {n(rBoss, 1)} ≤ r ≤ {n(R, 1)}
            </text>
            {hp.pGroups.map((p, i) => (
              <text key={i} x="8" y={54 + i * 11} fontSize="9.5" fill={angleColor(dome.groups[i].angle, i)}>
                {dome.groups[i].angle}°: t={n(hp.tGroups[i], 3)} p={n(p, 1)}
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
  const [showExcel, setShowExcel] = useState(false)
  return (
    <div className="card">
      <h3>
        封头校核 — 缠绕规律厚度与承载（逐角度组）
        <span className="tail">
          口径：{input.refMode === 'corrected' ? '修正版 cos²α' : 'Excel 原样 cos(u·cos u)'} · ks={input.requirement.ks}
        </span>
      </h3>
      <div className="dome">
        <div className="pane">
          <h4>封头厚度几何轮廓</h4>
          <div className="sub">半剖 · 一层层轮廓线，与右图同源</div>
          <DomeContour input={input} result={result} />
          <div style={{ marginTop: 6 }}>
            <button className="btn sm" onClick={() => props.onExpand('contour')}>
              ⤢ 弹出大图
            </button>
          </div>
        </div>
        <div className="pane">
          <h4>封头爆破压强 p总(r) × ks = {input.requirement.ks}</h4>
          <div className="sub">灰=接嘴区不计入判定 · 悬停看逐组分解</div>
          <PressureChart input={input} result={result} showExcel={showExcel} />
          <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={() => props.onExpand('curve')}>
              ⤢ 弹出大图
            </button>
            <label className="radios" style={{ fontSize: 11.5 }}>
              <input type="checkbox" checked={showExcel} onChange={(e) => setShowExcel(e.target.checked)} />
              叠加 Excel 原样口径（灰虚线）
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
