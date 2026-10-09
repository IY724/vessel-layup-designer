/** fields.tsx — 无第三方依赖的表单原语（经验值一律"内置默认 + 允许自填"） */
import type { ReactNode } from 'react'

export function Section(props: { title: ReactNode; tail?: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      <h3>
        {props.title}
        {props.tail && <span className="tail">{props.tail}</span>}
      </h3>
      {props.children}
    </div>
  )
}

export function Num(props: {
  label: ReactNode
  value: number | null
  onChange: (v: number | null) => void
  unit?: ReactNode
  step?: number
  hint?: ReactNode
  disabled?: boolean
  /** 未填/不合法时标红（自动生成弹窗用） */
  invalid?: boolean
}) {
  const { label, value, onChange, unit, step = 1, hint, disabled, invalid } = props
  return (
    <>
      <div className="field">
        <span className="lbl">{label}</span>
        <input
          className={invalid ? 'missing' : undefined}
          type="number"
          step={step}
          value={value === null ? '' : value}
          disabled={disabled}
          onChange={(e) => {
            const t = e.target.value
            onChange(t === '' ? null : Number(t))
          }}
        />
        <span className="unit">{unit ?? ''}</span>
      </div>
      {hint && <div className="hint">{hint}</div>}
    </>
  )
}

export function Radio<T extends string>(props: {
  label?: ReactNode
  value: T
  options: Array<{ value: T; text: ReactNode }>
  onChange: (v: T) => void
}) {
  return (
    <>
      <div className="field wide">
        <span className="lbl">{props.label ?? ''}</span>
        <div className="radios">
          {props.options.map((o) => (
            <label key={o.value}>
              <input type="radio" checked={props.value === o.value} onChange={() => props.onChange(o.value)} />
              {o.text}
            </label>
          ))}
        </div>
      </div>
    </>
  )
}

export function Pick(props: { label: ReactNode; value: string; options: Array<{ value: string; text: string }>; onChange: (v: string) => void; unit?: ReactNode }) {
  return (
    <div className="field">
      <span className="lbl">{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </select>
      <span className="unit">{props.unit ?? ''}</span>
    </div>
  )
}

export function Check(props: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="radios" style={{ marginBottom: 7 }}>
      <label>
        <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
        {props.label}
      </label>
    </div>
  )
}

export function Chips(props: { items: number[]; onChange: (items: number[]) => void }) {
  const add = () => {
    const v = window.prompt('新增候选螺旋角（度，1~89）', '50')
    if (v === null) return
    const a = Number(v)
    if (!Number.isFinite(a) || a <= 0 || a >= 90) return
    props.onChange([...new Set([...props.items, a])].sort((x, y) => x - y))
  }
  return (
    <div className="chips" style={{ marginBottom: 8 }}>
      {props.items.map((a) => (
        <span className="chip" key={a}>
          {a}°
          <button title="删除该角度" onClick={() => props.onChange(props.items.filter((x) => x !== a))}>
            x
          </button>
        </span>
      ))}
      <span className="chip" style={{ background: '#fff', borderStyle: 'dashed' }}>
        <button onClick={add} title="新增候选角">
          +
        </button>
      </span>
    </div>
  )
}
