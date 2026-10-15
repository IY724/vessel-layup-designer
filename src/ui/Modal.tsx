/** Modal.tsx — 弹出大图 / 明细窗口 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'

// 弹窗打开期间给 body 加 modal-open：临时关掉表头 sticky，
// 避免 Chromium 里 sticky 表头越过 position:fixed 弹窗重绘（会“透出来”盖住弹窗内容）。
let openCount = 0

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; narrow?: boolean }) {
  useEffect(() => {
    openCount += 1
    document.body.classList.add('modal-open')
    return () => {
      openCount -= 1
      if (openCount <= 0) {
        openCount = 0
        document.body.classList.remove('modal-open')
      }
    }
  }, [])
  return (
    <div className="modal" onClick={props.onClose}>
      <div
        className={`box${props.narrow ? ' narrow' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={props.wide ? { width: 'min(1500px, 98%)' } : undefined}
      >
        <header>
          <b>{props.title}</b>
          <button className="btn sm" onClick={props.onClose}>
            关闭
          </button>
        </header>
        {props.children}
      </div>
    </div>
  )
}
