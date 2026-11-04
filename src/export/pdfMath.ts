/** 将现有 MathML 排为 PDF 文本与线条，保留分式、上下标及矢量清晰度。 */
import type { jsPDF } from 'jspdf'
import { renderTex } from '../ui/Tex'

interface Box { w: number; up: number; down: number; draw: (x: number, y: number) => void }

export function pdfMath(doc: jsPDF, tex: string, size = 11): Box {
  const root = new DOMParser().parseFromString(renderTex(tex, true), 'application/xml').documentElement
  const scale = 25.4 / 72
  const text = (s: string, pt: number): Box => {
    doc.setFontSize(pt)
    const w = doc.getTextWidth(s)
    return { w, up: pt * scale * 0.84, down: pt * scale * 0.25,
      draw: (x, y) => { doc.setFontSize(pt); doc.text(s, x, y) } }
  }
  const row = (items: Box[]): Box => ({
    w: items.reduce((s, b) => s + b.w, 0), up: Math.max(0, ...items.map(b => b.up)), down: Math.max(0, ...items.map(b => b.down)),
    draw: (x, y) => { for (const b of items) { b.draw(x, y); x += b.w } },
  })
  const box = (node: Element, pt: number): Box => {
    const children = [...node.children]
    const child = (i: number, s = pt) => box(children[i], s)
    if (['mi', 'mn', 'mtext', 'mo'].includes(node.localName)) {
      const value = node.textContent || ''
      const b = text(value, pt)
      const gap = node.localName === 'mo' && /[=+−≥≤⋅×]/.test(value) ? 0.6 : 0.1
      return { ...b, w: b.w + gap * 2, draw: (x, y) => b.draw(x + gap, y) }
    }
    if (node.localName === 'mspace') return { w: pt * scale, up: 0, down: 0, draw: () => {} }
    if (node.localName === 'mfrac') {
      const a = child(0, pt * 0.9), b = child(1, pt * 0.9), w = Math.max(a.w, b.w) + 1.8
      const axis = pt * scale * 0.28, gap = 0.7
      return { w, up: axis + gap + a.down + a.up, down: Math.max(0, b.up + b.down + gap - axis), draw: (x, y) => {
        const line = y - axis
        doc.setLineWidth(0.18); doc.line(x + 0.3, line, x + w - 0.3, line)
        a.draw(x + (w - a.w) / 2, line - gap - a.down)
        b.draw(x + (w - b.w) / 2, line + gap + b.up)
      } }
    }
    if (['msub', 'msup', 'msubsup'].includes(node.localName)) {
      const a = child(0), sub = node.localName !== 'msup' ? child(1, pt * 0.65) : null
      const sup = node.localName !== 'msub' ? child(node.localName === 'msubsup' ? 2 : 1, pt * 0.65) : null
      const dySub = a.down + pt * scale * 0.23, dySup = a.up * 0.67
      return { w: a.w + Math.max(sub?.w || 0, sup?.w || 0), up: Math.max(a.up, sup ? dySup + sup.up : 0), down: Math.max(a.down, sub ? dySub + sub.down : 0), draw: (x, y) => {
        a.draw(x, y); sub?.draw(x + a.w, y + dySub); sup?.draw(x + a.w, y - dySup)
      } }
    }
    if (node.localName === 'msqrt') {
      const a = child(0), radical = text('√', pt)
      return { w: radical.w + a.w + 0.8, up: a.up + 0.8, down: a.down, draw: (x, y) => {
        radical.draw(x, y); a.draw(x + radical.w, y); doc.setLineWidth(0.18); doc.line(x + radical.w, y - a.up - 0.4, x + radical.w + a.w, y - a.up - 0.4)
      } }
    }
    return row(children.map(c => box(c, pt)))
  }
  return box(root, size)
}
