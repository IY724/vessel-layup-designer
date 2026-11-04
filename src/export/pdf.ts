/** 两端共用的独立 PDF 排版，不调用网页截图或系统打印。 */
import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import fontData from '../assets/report-font/ReportSerif.base64?raw'
import type { CheckResult, DesignInput } from '../core/types'
import { buildReportModel, type ReportFigure, type ReportModel } from './reportModel'
import { pdfMath } from './pdfMath'
import { reportFigure, type Figure } from './figures'
import { imprint } from '../core/docStamp'

export interface PdfReport { bytes: Uint8Array<ArrayBuffer>; filename: string; pageCount: number; model: ReportModel }

export async function createPdfReport(input: DesignInput, result: CheckResult): Promise<PdfReport> {
  const model = buildReportModel(input, result)
  const figures = new Map<ReportFigure, Figure>()
  for (const block of model.blocks) {
    if (block.kind === 'figure') figures.set(block.figure, await reportFigure(block.figure, input, result))
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true })
  doc.addFileToVFS('ReportSerif.ttf', fontData.trim())
  doc.addFont('ReportSerif.ttf', 'ReportSerif', 'normal')
  const font = (size = 10.5) => { doc.setFont('ReportSerif', 'normal'); doc.setFontSize(size); doc.setTextColor(28, 31, 36); doc.setDrawColor(40) }
  font()
  doc.setProperties({ title: model.title, creator: '复合材料气瓶缠绕铺层设计软件 V1.0', author: imprint, subject: model.title })
  const left = 23, width = 164, bottom = 275, top = 24
  let y = 32
  const newPage = () => { doc.addPage(); y = top }
  const ensure = (height: number) => { if (y + height > bottom) newPage() }
  const lines = (text: string, maxWidth = width, size = 10.5): string[] => {
    font(size)
    // 中文逐字换行，数字与单位保持完整，避免在15.00°等数值中间断行。
    const out: string[] = []; let current = ''
    const tokens = text.match(/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?: ?(?:MPa|mm[²³]?|g\/m|L|°|%))?|[A-Za-z]+|[\s\S]/g) ?? []
    for (const ch of tokens) {
      if (ch === '\n' || (current && doc.getTextWidth(current + ch) > maxWidth && !/^[，。；：！？、）》】”’.,;:!?%]$/.test(ch))) {
        if (/[（《【“‘(]$/.test(current)) { const last = current.slice(-1); out.push(current.slice(0, -1)); current = last + ch }
        else { out.push(current); current = ch === '\n' ? '' : ch }
      }
      else current += ch
    }
    if (current) out.push(current)
    return out
  }
  font(21); doc.text(model.title, 105, y, { align: 'center' }); y += 12
  font(9); doc.setTextColor(100); doc.text(`计算时间：${model.date}    V1.0`, 105, y, { align: 'center' }); y += 12

  for (const [index, b] of model.blocks.entries()) {
    if (b.kind === 'heading') {
      // 末节较短时把标题、结论和汇总表放在同页，避免只剩一张末页表。
      const tail=model.blocks.slice(index)
      const closingSection=b.level===1 && !tail.slice(1).some(block=>block.kind==='heading')
      const closingHeight=closingSection ? tail.reduce((sum,block)=>sum+(block.kind==='paragraph'
        ? lines(`　　${block.text}`).length*6.1+2 : block.kind==='table'
          ? (block.rows.length+1)*8+13 : block.kind==='heading'?13:300),0) : 0
      ensure(closingSection && closingHeight<bottom-top ? closingHeight : b.level === 1 ? 30 : 23)
      y += b.level === 1 ? 4 : 2
      font(b.level === 1 ? 14 : 12); doc.text(b.text, left, y); y += b.level === 1 ? 9 : 8
    } else if (b.kind === 'paragraph') {
      const wrapped = lines(`　　${b.text}`)
      if (wrapped.length <= 8) ensure(wrapped.length * 6.1 + 2)
      for (const line of wrapped) { ensure(6.1); font(); doc.text(line, left, y); y += 6.1 }
      y += 2
    } else if (b.kind === 'equation') {
      font()
      let pt = 11, math = pdfMath(doc, b.tex, pt)
      if (math.w > width - 19) { pt *= (width - 19) / math.w; math = pdfMath(doc, b.tex, pt) }
      const height = math.up + math.down + 6
      ensure(height)
      font(pt); math.draw(left + (width - math.w) / 2, y + math.up + 1)
      font(10); doc.text(`(${b.number})`, left + width, y + math.up + 1, { align: 'right' })
      y += height
    } else if (b.kind === 'table') {
      const caption = lines(b.caption, width, 10)
      const compactTableHeight = (b.rows.length + 1) * 8 + caption.length * 5 + 5
      const next = model.blocks[index + 1]
      const closingHeight = index === model.blocks.length - 2 && next?.kind === 'paragraph' ? lines(next.text).length * 6.1 + 5 : 0
      ensure(b.rows.length <= 12 ? compactTableHeight + closingHeight : caption.length * 5 + 22)
      font(10); for (const line of caption) { doc.text(line, 105, y, { align: 'center' }); y += 5 }
      autoTable(doc, {
        startY: y, head: [b.head], body: b.rows.length ? b.rows : [b.head.map(() => '-')],
        margin: { left, right: left, top, bottom: 22 }, theme: 'plain', tableWidth: width,
        styles: { font: 'ReportSerif', fontStyle: 'normal', fontSize: 9, textColor: [28, 31, 36], cellPadding: 2, overflow: 'linebreak', valign: 'middle', lineColor: 160, lineWidth: 0 },
        headStyles: { fontStyle: 'normal', fillColor: [245, 246, 247], lineWidth: { top: 0.4, bottom: 0.2 }, halign: 'center' },
        bodyStyles: { lineWidth: { bottom: 0.08 } },
        rowPageBreak: 'avoid', showHead: 'everyPage',
        didParseCell: (data) => {
          const v = String(data.cell.raw ?? '')
          if (data.section === 'body' && (data.column.index > 0 || b.head.length > 5) && v.length < 28) data.cell.styles.halign = 'center'
          if (v === '不满足' || v === '需处理' || v === '计算不完整') data.cell.styles.textColor = [155, 35, 35]
        },
      })
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
      font()
    } else if (b.kind === 'figure') {
      const figure = figures.get(b.figure)!
      // 完整保留原图比例；理论图直接嵌入论文原始像素，结果图按当前数据绘制。
      const figureWidth=Math.min(width,b.height*figure.width/figure.height)
      const figureHeight=figureWidth*figure.height/figure.width
      ensure(figureHeight + 14)
      doc.addImage(figure.base64, 'PNG', left+(width-figureWidth)/2, y, figureWidth, figureHeight, undefined, 'FAST')
      y += figureHeight + 5
      font(10); doc.text(b.caption, 105, y, { align: 'center' }); y += 9
    }
  }
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page); font(8); doc.setTextColor(100)
    doc.text('复合材料气瓶结构设计计算书', 105, 13, { align: 'center' })
    doc.setDrawColor(110); doc.setLineWidth(0.2); doc.line(left, 16, left + width, 16)
    doc.text(`${page} / ${pageCount}`, 105, 287, { align: 'center' })
  }
  const filename = `气瓶结构设计计算书-${input.geometry.volumeL}L-${result.derived.pb}MPa.pdf`
  return { bytes: new Uint8Array(doc.output('arraybuffer')), filename, pageCount, model }
}

export function savePdfReport(report: PdfReport): void {
  const url = URL.createObjectURL(new Blob([report.bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url; a.download = report.filename; document.body.appendChild(a); a.click(); a.remove()
  // 下载完成前保持对象有效，尤其是桌面系统保存对话框打开期间。
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
