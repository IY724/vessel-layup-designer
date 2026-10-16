/** App.tsx — 铺层设计工作台：左侧参数输入，右侧结果（筒身铺层 / 封头校核 / 几何） */
import { useEffect, useState } from 'react'
import { useDesign } from './state/store'
import { InputPanel } from './ui/InputPanel'
import { Overview } from './ui/Overview'
import { CylinderPanel } from './ui/CylinderPanel'
import { DomeContour, DomePanel, PressureChart, ThicknessChart } from './ui/DomePanel'
import { DetailView } from './ui/DetailView'
import { GeometryPanel } from './ui/GeometryPanel'
import { AutoDesignModal } from './ui/AutoDesignModal'
import { Modal } from './ui/Modal'
import { exportWorkbook } from './export/excel'
import { DEFAULT_PRESET } from './core/presets'
import { version as packageVersion } from '../package.json'

/** 对外版本标识：package.json 存 semver（1.0.0），界面与文档一律只显示主.次 → V1.0 */
export const releaseLabel = `V${packageVersion.split('.').slice(0, 2).join('.')}`

export default function App() {
  const store = useDesign()
  const { input, result, setInput, reset } = store
  const [expand, setExpand] = useState<'contour' | 'curve' | 'thickness' | 'detail' | null>(null)
  const [auto, setAuto] = useState(false)
  const [msg, setMsg] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 8000)
    return () => clearTimeout(t)
  }, [msg])

  const exportExcel = async () => {
    if (exporting) return
    setExporting(true)
    try {
      setMsg(`已导出计算书：${await exportWorkbook(input, result)}`)
    } catch (e) {
      setMsg(`导出失败：${(e as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="mark">铺</span>
          <span className="bt">
            <b>复合材料气瓶缠绕铺层设计</b>
            <span>筒身网格理论 · 封头缠绕规律校核 · {releaseLabel}</span>
          </span>
        </div>

        <div className="tgroup">
          <button className="btn primary" onClick={() => setAuto(true)} title="给齐目标与工艺参数，自动算出铺层并填入">
            自动生成铺层
          </button>
          <button className="btn" onClick={reset} title={`恢复默认参数（${DEFAULT_PRESET.label}）`}>
            恢复默认
          </button>
        </div>

        <div className="tgroup">
          <button className="btn" onClick={exportExcel} disabled={exporting} title="导出计算书">
            {exporting ? '正在生成计算书…' : '导出 Excel 计算书'}
          </button>
          <button className="btn" onClick={() => window.print()} title="打印或另存为 PDF">
            打印 / PDF
          </button>
        </div>

        <div className="tgroup">
          <button className="btn" onClick={() => setExpand('detail')}>
            校核明细
          </button>
        </div>
      </div>

      <div className="layout">
        <InputPanel store={store} />
        <div className="panel">
          <Overview result={result} input={input} />
          <CylinderPanel store={store} onAuto={() => setAuto(true)} />
          <DomePanel input={input} result={result} onExpand={(w) => setExpand(w)} />
          <GeometryPanel input={input} result={result} onGeometry={store.setGeometry} />
        </div>
      </div>

      <div className="statusbar">
        <span>{releaseLabel}</span>
        <span>铺层设计计算</span>
        <span>本机离线运行，数据不上传</span>
        {msg && <span className="msg">{msg}</span>}
      </div>

      {auto && <AutoDesignModal input={input} onApply={(next) => setInput(next)} onClose={() => setAuto(false)} />}
      {expand === 'contour' && (
        <Modal title="封头厚度几何轮廓" onClose={() => setExpand(null)} wide>
          <div style={{ maxWidth: 1150 }}>
            <DomeContour input={input} result={result} W={1150} H={620} />
          </div>
        </Modal>
      )}
      {expand === 'curve' && (
        <Modal title="封头爆破压强分布" onClose={() => setExpand(null)} wide>
          <PressureChart input={input} result={result} W={1360} H={620} />
        </Modal>
      )}
      {expand === 'thickness' && (
        <Modal title="封头厚度分布" onClose={() => setExpand(null)} wide>
          <ThicknessChart input={input} result={result} W={1360} H={620} />
        </Modal>
      )}
      {expand === 'detail' && (
        <Modal title="校核明细" onClose={() => setExpand(null)} wide>
          <DetailView input={input} result={result} />
        </Modal>
      )}
    </div>
  )
}
