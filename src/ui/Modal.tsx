/** Modal.tsx — 弹出大图 / 明细窗口 */
import type { ReactNode } from 'react'

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal" onClick={props.onClose}>
      <div
        className="box"
        onClick={(e) => e.stopPropagation()}
        style={props.wide ? { width: 'min(1500px, 98%)' } : undefined}
      >
        <header>
          <b>{props.title}</b>
          <button className="btn sm" onClick={props.onClose}>
            关闭 ✕
          </button>
        </header>
        {props.children}
      </div>
    </div>
  )
}
