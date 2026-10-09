/** App.tsx — 铺层设计工作台：左侧参数输入，右侧结果（筒身铺层 / 封头校核 / 几何） */
import { useEffect, useState } from 'react'
import { useDesign } from './state/store'
import { InputPanel } from './ui/InputPanel'
import { Overview } from './ui/Overview'
import { CylinderPanel } from './ui/CylinderPanel'
import { DomeContour, DomePanel, PressureChart } from './ui/DomePanel'
import { DetailView } from './ui/DetailView'
import { GeometryPanel } from './ui/GeometryPanel'
import { AutoDesignModal } from './ui/AutoDesignModal'
import { Modal } from './ui/Modal'
import { exportWorkbook } from './export/excel'
import { DEFAULT_PRESET } from './core/presets'
import type { RefMode } from './core/types'

/** 封头强度算法的两种取法：corrected = 正确算法（默认）；excel = 复算参考表原写法，只用于逐格对账 */
const ALGO_TEXT: Record<RefMode, string> = { corrected: '正确算法', excel: '参考表原算法（仅对账）' }

function download(name: string, text: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function App() {
  const store = useDesign()
  const { input, result, setInput, reset } = store
  const [expand, setExpand] = useState<'contour' | 'curve' | 'detail' | null>(null)
  const [auto, setAuto] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 8000)
    return () => clearTimeout(t)
  }, [msg])

  const importJson = () => {
    const el = document.createElement('input')
    el.type = 'file'
    el.accept = 'application/json,.json'
    el.onchange = () => {
      const f = el.files?.[0]
      if (!f) return
      const rd = new FileReader()
      rd.onload = () => {
        try {
          const obj = JSON.parse(String(rd.result))
          const inp = obj.input ?? obj
          if (!inp?.geometry || !inp?.plan || !inp?.constraint) throw new Error('缺少 geometry/plan/constraint')
          setInput(inp)
          setMsg(`已载入方案：R=${inp.geometry.R} mm、爆压要求 ${inp.requirement?.pb ?? inp.requirement?.workingPressure} MPa、${inp.plan.spiral.length} 个螺旋角组`)
        } catch (e) {
          setMsg(`导入失败：${(e as Error).message}。需要本软件导出的方案 JSON`)
        }
      }
      rd.readAsText(f)
    }
    el.click()
  }

  const exportExcel = () => {
    try {
      setMsg(`已导出计算书：${exportWorkbook(input, result)}`)
    } catch (e) {
      setMsg(`导出失败：${(e as Error).message}`)
    }
  }

  const exportJson = () =>
    download(
      `铺层方案-R${input.geometry.R}-pb${result.derived.pb.toFixed(0)}.json`,
      JSON.stringify(
        {
          meta: { tool: 'vessel-layup-designer', version: '1.1.0', algorithm: input.refMode, date: new Date().toISOString() },
          input,
          summary: {
            pa: result.cylinder.pa,
            pth: result.cylinder.pth,
            spiralThickness: result.cylinder.spiralThickness,
            hoopThickness: result.cylinder.hoopThickness,
            totalThickness: result.cylinder.totalThickness,
            domeMinP: result.dome.minP,
            domeMinPR: result.dome.minPR,
            domePAtR: result.dome.profile[result.dome.profile.length - 1]?.pTotal ?? 0,
            verdict: result.verdict,
            weightKg: result.weight,
          },
          domeGroups: result.dome.groups,
        },
        null,
        2,
      ),
    )

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="mark">铺</span>
          <span className="bt">
            <b>复合材料气瓶缠绕铺层设计</b>
            <span>筒身网格理论 · 封头缠绕规律校核 · V1.1</span>
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
          <label className="cap">封头算法</label>
          <select value={input.refMode} onChange={(e) => setInput({ ...input, refMode: e.target.value as RefMode })}>
            <option value="corrected">正确算法（推荐）</option>
            <option value="excel">参考表原算法（仅对账）</option>
          </select>
        </div>

        <div className="tgroup">
          <button className="btn" onClick={importJson} title="读回之前导出的方案 JSON">
            导入 JSON
          </button>
          <button className="btn" onClick={exportJson}>
            导出 JSON
          </button>
          <button className="btn" onClick={exportExcel} title="逐格可追溯的计算书，单元格为活公式">
            导出 Excel 计算书
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
          <GeometryPanel input={input} result={result} />
        </div>
      </div>

      <div className="statusbar">
        <span>V1.1</span>
        <span>封头算法：{ALGO_TEXT[input.refMode]}</span>
        <span>判定范围下界：{input.constraint.rBossAuto ? '自动（全部角度铺到处）' : '手动指定'}</span>
        <span>内置自检 99 项</span>
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
        <Modal title="封头沿母线的爆破压强分布" onClose={() => setExpand(null)} wide>
          <PressureChart input={input} result={result} W={1360} H={620} showExcel />
        </Modal>
      )}
      {expand === 'detail' && (
        <Modal title="校核明细（逐格对照参考表）" onClose={() => setExpand(null)} wide>
          <DetailView input={input} result={result} />
        </Modal>
      )}
    </div>
  )
}
