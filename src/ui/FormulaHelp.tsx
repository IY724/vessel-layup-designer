/** FormulaHelp.tsx — 公式问号：点击弹出渲染好的公式（只给公式与一句"算什么"，不给长文字解释） */
import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { sym } from './Sym'
import { Tex } from './Tex'

export interface FormulaItem {
  /** 公式本体（LaTeX 子集，界面用 Tex 渲染）；与 note 二选一 */
  frm?: string
  /** 纯文字行：长中文不要塞进公式（MathML 的 mtext 不换行会把弹窗撑宽） */
  note?: string
  /** 可选：一句"算什么"（文中变量用 `_` 写下标，如 R_in、σ_c） */
  desc?: string
  /** 自定义内容（如线型表原表插图），出现时弹窗自动加宽 */
  custom?: ReactNode
}

export function FormulaHelp(props: { title: string; items: FormulaItem[] }) {
  const [open, setOpen] = useState(false)
  const wide = props.items.some((it) => it.custom)
  return (
    <>
      <button className="help-dot" title={props.title} onClick={() => setOpen(true)}>
        ?
      </button>
      {open && (
        <Modal title={props.title} narrow={!wide} wide={wide} onClose={() => setOpen(false)}>
          <div className="formula-list">
            {props.items.map((it, i) => (
              <div key={i}>
                {it.frm && (
                  <div className="frm">
                    <Tex src={it.frm} block />
                  </div>
                )}
                {it.note && <div className="note">{sym(it.note)}</div>}
                {it.desc && <div className="desc">{sym(it.desc)}</div>}
                {it.custom}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}
