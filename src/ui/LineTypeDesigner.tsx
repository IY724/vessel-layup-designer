/**
 * LineTypeDesigner.tsx — 线型切点设计（论文设计顺序的可视化）
 *
 * 已知容积 V（硬约束）→ 导出光滑曲线 Φ = f(D)（Φ = 双程转角 θ_n）→ 把线型表允许的
 * 转角画成水平横线切过去 → 交点即候选方案（外径 D 与筒身长 l 同时确定）→ 用户照表
 * 自己挑（**不排序、不推荐**）。选定某档的一刻，内胆几何与数控速比参数一起定型。
 *
 * 纯展示 + 回填回调；计算全在 core/geometry.ts 的纯函数里（designCurve / solveForTheta /
 * intersectLineTypes / allowedLineTypes），与铺层/封头内核同口径。
 */
import { useMemo } from 'react'
import {
  allowedLineTypes,
  designCurve,
  intersectLineTypes,
  solveForTheta,
  type DesignBase,
  type LineTypeCandidate,
} from '../core/geometry'

const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export interface LineTypeDesignerProps {
  base: DesignBase
  /** 目标容积 (L) */
  volumeL: number
  /** 当前锁定的外径 D (mm)，用于高亮；缺省不高亮 */
  currentD?: number
  /** 采用某个候选：把 (D, l) 回填到几何输入 */
  onApply: (p: { D: number; R: number; l: number; theta: number }) => void
  /** 允许转角窗口（默认 450~660°，切点数 ≤ 4） */
  thetaLow?: number
  thetaHigh?: number
  maxN?: number
}

export function LineTypeDesigner(props: LineTypeDesignerProps) {
  const { lambda, r0, Kf } = props.base
  const { volumeL, currentD, onApply } = props
  const thetaLow = props.thetaLow ?? 450
  const thetaHigh = props.thetaHigh ?? 660
  const maxN = props.maxN ?? 4

  const allowed = useMemo(() => allowedLineTypes(thetaLow, thetaHigh, maxN), [thetaLow, thetaHigh, maxN])
  const candidates = useMemo(
    () => intersectLineTypes({ lambda, r0, Kf }, volumeL, allowed),
    [lambda, r0, Kf, volumeL, allowed],
  )

  // 视图窗口：纵轴略大于允许转角范围，横轴取两边界转角反解出的 D
  const win = useMemo(() => {
    const thetas = allowed.map((r) => r.theta)
    const thetaTop = (thetas.length ? Math.max(...thetas) : thetaHigh) * 1.04
    const thetaBot = (thetas.length ? Math.min(...thetas) : thetaLow) * 0.96
    const hi = solveForTheta({ lambda, r0, Kf }, volumeL, thetaTop)
    const lo = solveForTheta({ lambda, r0, Kf }, volumeL, thetaBot)
    let dMin = hi.ok ? hi.D : 0
    let dMax = lo.ok ? lo.D : 0
    if (!(dMax > dMin)) {
      const c = designCurve({ lambda, r0, Kf }, volumeL, { samples: 10 })
      if (c.length) {
        dMin = c[c.length - 1].D
        dMax = c[0].D
      }
    }
    return { thetaTop, thetaBot, dMin, dMax }
  }, [allowed, lambda, r0, Kf, volumeL, thetaLow, thetaHigh])

  const curve = useMemo(
    () => designCurve({ lambda, r0, Kf }, volumeL, { dMin: win.dMin, dMax: win.dMax, samples: 140 }),
    [lambda, r0, Kf, volumeL, win.dMin, win.dMax],
  )

  const W = 560
  const H = 360
  const mt = 16
  const mb = 36
  const ml = 48
  const mr = 104
  const plotW = W - ml - mr
  const plotH = H - mt - mb
  const { thetaTop, thetaBot, dMin, dMax } = win
  const x = (D: number) => ml + ((D - dMin) / Math.max(1e-9, dMax - dMin)) * plotW
  const y = (theta: number) => mt + ((thetaTop - theta) / Math.max(1e-9, thetaTop - thetaBot)) * plotH

  const dTicks = Array.from({ length: 5 }, (_, i) => dMin + ((dMax - dMin) * i) / 4)
  const thetaTicks = Array.from({ length: 5 }, (_, i) => thetaBot + ((thetaTop - thetaBot) * i) / 4)

  const curvePts = curve.map((p) => `${x(p.D).toFixed(1)},${y(p.theta).toFixed(1)}`).join(' ')
  const near = (c: LineTypeCandidate) => currentD !== undefined && Math.abs(c.D - currentD) < 1.5

  return (
    <div className="dome">
      <div className="pane">
        <h4>Φ = f(D) 设计曲线</h4>
        <div className="sub">
          守住容积 V = {f(volumeL, 2)} L：每个外径 D 唯一对应一个筒身长 l，也就唯一对应一个双程转角 Φ（= θ_n）。
        </div>
        <svg className="viz" viewBox={`0 0 ${W} ${H}`}>
          {/* 坐标网格 */}
          {thetaTicks.map((t, i) => (
            <g key={`ty${i}`}>
              <line x1={ml} y1={y(t)} x2={W - mr} y2={y(t)} stroke="#eef2f6" strokeWidth="1" />
              <text x={ml - 5} y={y(t) + 3} fontSize="9" fill="#94a3b8" textAnchor="end">
                {f(t, 0)}°
              </text>
            </g>
          ))}
          {dTicks.map((d, i) => (
            <g key={`dx${i}`}>
              <line x1={x(d)} y1={mt} x2={x(d)} y2={H - mb} stroke="#f1f5f9" strokeWidth="1" />
              <text x={x(d)} y={H - mb + 12} fontSize="9" fill="#94a3b8" textAnchor="middle">
                {f(d, 0)}
              </text>
            </g>
          ))}
          {/* 轴 */}
          <line x1={ml} y1={mt} x2={ml} y2={H - mb} stroke="#cbd5e1" />
          <line x1={ml} y1={H - mb} x2={W - mr} y2={H - mb} stroke="#cbd5e1" />
          <text x={W - mr} y={H - mb + 26} fontSize="9" fill="#64748b" textAnchor="end">
            外径 D (mm)
          </text>
          <text x={ml - 40} y={mt + 2} fontSize="9" fill="#64748b">
            双程转角 Φ
          </text>

          {/* 允许转角水平线 + 标签 */}
          {candidates.map((c) => (
            <g key={`hl${c.theta}`}>
              <line
                x1={ml}
                y1={y(c.theta)}
                x2={W - mr}
                y2={y(c.theta)}
                stroke={near(c) ? '#1f5fa8' : '#b7c6d8'}
                strokeWidth={near(c) ? 1.4 : 1}
                strokeDasharray="6,4"
              />
              <text x={W - mr + 5} y={y(c.theta) + 3} fontSize="9.5" fill={near(c) ? '#1f5fa8' : '#64748b'}>
                θ {f(c.theta, 0)}° · {c.n}切点
              </text>
            </g>
          ))}

          {/* Φ(D) 曲线 */}
          {curvePts && <polyline points={curvePts} fill="none" stroke="#1e3a5f" strokeWidth="2.2" />}

          {/* 交点 = 候选方案 */}
          {candidates.map((c) => (
            <circle
              key={`dot${c.theta}`}
              cx={x(c.D)}
              cy={y(c.theta)}
              r={near(c) ? 4.6 : 3.4}
              fill={near(c) ? '#1f5fa8' : '#fff'}
              stroke="#1f5fa8"
              strokeWidth="1.6"
            />
          ))}

          {/* 当前锁定方案竖线 */}
          {currentD !== undefined && currentD >= dMin && currentD <= dMax && (
            <g>
              <line x1={x(currentD)} y1={mt} x2={x(currentD)} y2={H - mb} stroke="#b45309" strokeWidth="1" strokeDasharray="3,3" />
              <text x={x(currentD)} y={mt + 9} fontSize="9" fill="#b45309" textAnchor="middle">
                当前 D={f(currentD, 0)}
              </text>
            </g>
          )}
          {candidates.length === 0 && (
            <text x={W / 2} y={H / 2} fontSize="11" fill="#b91c1c" textAnchor="middle">
              当前容积下 Φ(D) 曲线与允许转角无交点：请调整容积 / 轴比 / 极孔
            </text>
          )}
        </svg>
        <div className="hint" style={{ marginTop: 6 }}>
          曲线把"几何"和"线型"锁成一体：水平线与曲线的每个交点，就是一套（外径 D + 筒身长 l + 切点数 n）。
        </div>
      </div>

      <div className="pane">
        <h4>候选方案（交点）</h4>
        <div className="sub">软件不裁决：只列各档的 D、l、长径比与切点数，选哪档由你照表自己定。</div>
        <div className="tablewrap" style={{ maxHeight: 250 }}>
          <table className="grid">
            <thead>
              <tr>
                <th>转角 θ</th>
                <th>外径 D</th>
                <th>筒身长 l</th>
                <th>长径比 l/D</th>
                <th>切点数 n</th>
                <th>K,m</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 && (
                <tr>
                  <td colSpan={7} className="bad">
                    无可选方案：把容积、轴比或极孔调进可行域
                  </td>
                </tr>
              )}
              {candidates.map((c) => (
                <tr key={c.theta} className={near(c) ? 'sub' : undefined}>
                  <td className="angle">{f(c.theta, 0)}°</td>
                  <td>{f(c.D, 1)}</td>
                  <td>{f(c.l, 1)}</td>
                  <td>{f(c.ratio, 2)}</td>
                  <td>{c.n}</td>
                  <td>
                    {c.K},{c.m}
                  </td>
                  <td>
                    <button
                      className="btn sm"
                      onClick={() => onApply({ D: c.D, R: c.R, l: c.l, theta: c.theta })}
                      title="把该档的外径与筒身长回填到几何输入"
                    >
                      采用
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          θ = 360°·(m + K/n)；一个交点同时定下内胆几何尺寸（D、l）与数控线型档位（切点数 n）。
        </div>
      </div>
    </div>
  )
}
