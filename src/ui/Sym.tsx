/**
 * Sym.tsx — 量名渲染助手
 *
 * 界面上不出现 r_boss、R_in、σ_NOL 这类"源码写法"：统一转成真正的下标。
 *  - sym('分界半径 r_sp')      → 分界半径 r[sub]sp[/sub]      （HTML 用）
 *  - <SvgSym t="r_sp 90" />                                     （SVG 文字用，tspan + dy）
 */
import type { ReactNode } from 'react'

// 下标内容：字母、数字、希腊字母（p_α、p_θ）、中文（σ_发挥）；下标后紧跟中文时须留空格或标点
const RE = /_([A-Za-z0-9\u0370-\u03ff\u4e00-\u9fa5]+)/g

interface Seg {
  s: string
  sub: boolean
}

function split(t: string): Seg[] {
  if (!t.includes('_')) return [{ s: t, sub: false }]
  const out: Seg[] = []
  let last = 0
  let m: RegExpExecArray | null
  RE.lastIndex = 0
  while ((m = RE.exec(t))) {
    if (m.index > last) out.push({ s: t.slice(last, m.index), sub: false })
    out.push({ s: m[1], sub: true })
    last = m.index + m[0].length
  }
  if (last < t.length) out.push({ s: t.slice(last), sub: false })
  return out
}

/** 把带下划线的量名转成 React 节点（下标用 <sub>）；无下划线时原样返回字符串 */
export function sym(t: string): ReactNode {
  if (!t.includes('_')) return t
  return split(t).map((g, i) => (g.sub ? <sub key={i}>{g.s}</sub> : <span key={i}>{g.s}</span>))
}

/** 一段文字里出现多个量名时，用字符串数组或 sym() 拼接即可；此处提供表格单元格的便捷写法 */
export function Sym(props: { t: string }) {
  return <>{sym(props.t)}</>
}

export function SvgSym(props: {
  x: number
  y: number
  t: string
  fs?: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  weight?: number | string
  /** 白描边：文字压在图线上时保证可读 */
  halo?: boolean
  opacity?: number
}) {
  const { x, y, t, fs = 9, fill = '#475569', anchor = 'start', weight, halo, opacity } = props
  const segs = split(t)
  const d = fs * 0.26
  return (
    <text
      x={x}
      y={y}
      fontSize={fs}
      fill={fill}
      textAnchor={anchor}
      fontWeight={weight}
      opacity={opacity}
      stroke={halo ? '#ffffff' : undefined}
      strokeWidth={halo ? 2.8 : undefined}
      paintOrder={halo ? 'stroke' : undefined}
      strokeLinejoin={halo ? 'round' : undefined}
    >
      {segs.map((g, i) =>
        g.sub ? (
          <tspan key={i} dy={d} fontSize={fs * 0.74}>
            {g.s}
          </tspan>
        ) : (
          <tspan key={i} dy={i > 0 && segs[i - 1].sub ? -d : 0}>
            {g.s}
          </tspan>
        ),
      )}
    </text>
  )
}
