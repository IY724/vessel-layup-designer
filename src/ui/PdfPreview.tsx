import { useEffect, useRef, useState } from 'react'
import { getDocument, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import * as pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs'
import { savePdfReport, type PdfReport } from '../export/pdf'
import { Modal } from './Modal'

// 将预览器一起内嵌，file:// 与桌面沙箱均不需要外部网站或浏览器 PDF 插件。
function prepareWorker() {
  // PDF.js 的本线程适配器避免 file:// 下 module Worker 的源限制。
  // 实际解析器静态打包进单文件，不通过 URL 动态加载代码。
  ;(globalThis as typeof globalThis & { pdfjsWorker: typeof pdfWorker }).pdfjsWorker = pdfWorker
}

export function PdfPreview({ report, error, onClose }: { report: PdfReport | null; error: string; onClose: () => void }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [previewError, setPreviewError] = useState('')
  const [rendering, setRendering] = useState(true)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!report) return
    prepareWorker()
    // 复制数据，避免 worker 的 transferable 将保存用的原始字节转移清空。
    const task = getDocument({ data: report.bytes.slice(), useWasm: false, useSystemFonts: false, disableFontFace: true })
    let disposed = false
    task.promise.then(doc => { if (!disposed) setPdf(doc) }).catch(e => { if (!disposed) setPreviewError(`预览加载失败：${e.message}`) })
    return () => { disposed = true; void task.destroy() }
  }, [report])
  useEffect(() => {
    if (!pdf || !canvas.current) return
    let disposed = false
    let render: RenderTask | undefined
    setRendering(true)
    setPreviewError('')
    void (async () => {
      try {
        const current = await pdf.getPage(page)
        if (disposed || !canvas.current) return
        const viewport = current.getViewport({ scale: zoom / 100 * 1.25 })
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        const el = canvas.current
        el.width = Math.floor(viewport.width * ratio); el.height = Math.floor(viewport.height * ratio)
        el.style.width = `${viewport.width}px`; el.style.height = `${viewport.height}px`
        render = current.render({ canvas: el, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] })
        await render.promise
        if (!disposed) setRendering(false)
      } catch (e) {
        if (!disposed) { setPreviewError(`预览渲染失败：${(e as Error).message}`); setRendering(false) }
      }
    })()
    return () => { disposed = true; render?.cancel() }
  }, [pdf, page, zoom])
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', keyboard)
    return () => document.removeEventListener('keydown', keyboard)
  }, [onClose])

  return <Modal title="PDF 计算书预览" onClose={onClose} className="pdf-preview" wide>
    <div className="pdf-toolbar">
      <button className="btn primary" disabled={!report} onClick={() => report && savePdfReport(report)}>保存 PDF</button>
      <button className="btn" disabled={!pdf || page <= 1} onClick={() => setPage(v => v - 1)}>上一页</button>
      <label>第 <input aria-label="PDF 页码" type="number" min={1} max={pdf?.numPages || 1} value={page} onChange={e => setPage(Math.max(1, Math.min(pdf?.numPages || 1, Math.trunc(Number(e.target.value)) || 1)))} /> / {report?.pageCount || '-'} 页</label>
      <button className="btn" disabled={!pdf || page >= pdf.numPages} onClick={() => setPage(v => v + 1)}>下一页</button>
      <label>缩放 <select aria-label="PDF 缩放" value={zoom} onChange={e => setZoom(Number(e.target.value))}>
        {[60, 80, 100, 125, 150].map(n => <option key={n} value={n}>{n}%</option>)}
      </select></label>
      {report && <span className="pdf-file">{report.filename}</span>}
    </div>
    <div className="pdf-view" aria-busy={!report || rendering}>
      {(error || previewError) && <p role="alert" className="pdf-error">{error || previewError}</p>}
      {!error && !report && <p role="status">正在编排正文、公式、表格和计算图…</p>}
      {report && !pdf && !previewError && <p role="status">正在加载 PDF…</p>}
      {report && <canvas ref={canvas} aria-label={`PDF 计算书第 ${page} 页`} style={{ visibility: pdf ? 'visible' : 'hidden' }} />}
    </div>
  </Modal>
}
