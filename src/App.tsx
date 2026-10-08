/** App.tsx — 铺层设计工作台（第一期 V0.1：筒身设计 + 封头校核 + 可视化 + 方案导出） */
import { useState } from 'react'
import { useDesign } from './state/store'
import { InputPanel } from './ui/InputPanel'
import { Overview } from './ui/Overview'
import { CylinderPanel } from './ui/CylinderPanel'
import { DomeContour, DomePanel, PressureChart } from './ui/DomePanel'
import { DetailView } from './ui/DetailView'
import { GeometryPanel } from './ui/GeometryPanel'
import { Modal } from './ui/Modal'
import { PRESETS } from './core/presets'
import { autoDesign } from './core/designer'
import { exportWorkbook } from './export/excel'
import { MP70_STRENGTH_B, COURSE_STRENGTH_B } from './core/presets'
import type { RefMode } from './core/types'

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
  const { input, result, setInput, setPreset, presetId, reset } = store
  const [expand, setExpand] = useState<'contour' | 'curve' | 'detail' | null>(null)
  const [autoMsg, setAutoMsg] = useState<string>('')

  const [mode, setMode] = useState<'auto' | 'manual'>('manual')

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
          setAutoMsg(`已载入方案：R=${inp.geometry.R} mm、pb=${inp.requirement?.pb ?? inp.requirement?.workingPressure} MPa、${inp.plan.spiral.length} 个螺旋角组`)
        } catch (e) {
          setAutoMsg(`导入失败：${(e as Error).message}。需要本软件导出的方案 JSON（含 input.geometry / plan / constraint）`)
        }
      }
      rd.readAsText(f)
    }
    el.click()
  }

  const exportExcel = () => {
    try {
      setAutoMsg(`已导出 Excel：${exportWorkbook(input, result)}`)
    } catch (e) {
      setAutoMsg(`导出失败：${(e as Error).message}`)
    }
  }

  const runAuto = () => {
    const out = autoDesign(input)
    if (!out.ok) {
      setAutoMsg(`自动生成失败：${out.reason}`)
      return
    }
    setAutoMsg(out.trace.join('　·　'))
    setInput({ ...input, plan: out.plan })
  }

  const exportJson = () =>
    download(
      `铺层方案-R${input.geometry.R}-pb${result.derived.pb.toFixed(0)}.json`,
      JSON.stringify(
        {
          meta: { tool: 'vessel-layup-designer', version: '0.1.0', caliber: input.refMode, date: new Date().toISOString() },
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
          <b>复合材料气瓶缠绕铺层设计系统</b>
          <span>铺层设计工作台 · 第一期 V0.1 · 网格理论 + 封头缠绕规律校核</span>
        </div>
        <label className="cap">预设模板</label>
        <select value={presetId} onChange={(e) => setPreset(e.target.value)}>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="seg">
          <button
            className={mode === 'auto' ? 'on' : ''}
            onClick={() => {
              setMode('auto')
              runAuto()
            }}
            title="按候选角集与约束自动生成铺层方案"
          >
            ⚡ 自动生成
          </button>
          <button
            className={mode === 'manual' ? 'on' : ''}
            onClick={() => {
              setMode('manual')
              setAutoMsg('')
            }}
            title="直接在铺层表里改层数/角度，即时重算"
          >
            手动调整
          </button>
        </div>
        <button className="btn" onClick={reset}>
          ↺ 重置
        </button>
        <label className="cap">口径</label>
        <select value={input.refMode} onChange={(e) => setInput({ ...input, refMode: e.target.value as RefMode })}>
          <option value="corrected">修正版 cos²α</option>
          <option value="excel">Excel 原样复算</option>
        </select>
        <button className="btn" onClick={importJson} title="读回之前导出的方案 JSON">
          ⇪ 导入 JSON
        </button>
        <button className="btn" onClick={exportJson}>
          导出方案 JSON
        </button>
        <button className="btn primary" onClick={exportExcel} title="复刻两张 Excel + 方案汇总 + 口径说明，单元格为活公式">
          导出 Excel 报告
        </button>
        <button className="btn" onClick={() => window.print()} title="打印或另存为 PDF">
          🖨 打印/PDF
        </button>
        <label className="cap">强度预设</label>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value === 'mp70') setInput({ ...input, strength: { ...MP70_STRENGTH_B } })
            else if (e.target.value === 'course') setInput({ ...input, strength: { ...COURSE_STRENGTH_B } })
          }}
        >
          <option value="" disabled>
            载入…
          </option>
          <option value="course">课程案例 3385 / 3385 · σc 2031</option>
          <option value="mp70">70MPa 案例 螺旋3859/环向4342</option>
        </select>
        <button className="btn" onClick={() => setExpand('detail')}>
          校核明细（对表 Excel）
        </button>
      </div>

      <div className="layout">
        <InputPanel store={store} />
        <div className="panel">
          <Overview result={result} input={input} />
          {autoMsg && (
            <div className="banner ok">
              <span>⚡</span>
              <div>{autoMsg}</div>
            </div>
          )}
          <CylinderPanel store={store} />
          <DomePanel input={input} result={result} onExpand={(w) => setExpand(w)} />
          <GeometryPanel input={input} result={result} />
        </div>
      </div>

      <div className="footer">
        <b>交互设计要点</b>
        <div className="pts" style={{ marginTop: 6 }}>
          <div>① 极孔口径二选一，与 α_min 一致性校验</div>
          <div>② 角度 chips 增删；分配规则"隔一取一"可选</div>
          <div>③ 层数步进、行数不限、三视图即时刷新</div>
          <div>④ 强度模式 A 自算 / B 直填（螺旋环向可分）</div>
          <div>⑤ 封头薄弱区自动着色 + 等厚置换建议</div>
          <div>⑥ 导出方案 JSON（供二期几何/Abaqus 插件消费）</div>
          <div>⑦ 曲线图 ⤢ 弹出独立大图窗口</div>
          <div>⑧ 封头厚度：椭球截面一层层几何轮廓</div>
        </div>
        <div style={{ marginTop: 8, color: '#94a3b8' }}>
          计算核心已与两张 Excel 逐点对账（144 格点，厚度 ≤1e-3 mm / 爆压 ≤1e-2 MPa），基准测试见仓库 tests/。
          Excel 导出（复刻两张表）与几何板块（容积驱动外形）为下一里程碑。
        </div>
      </div>

      {expand === 'contour' && (
        <Modal title="封头厚度几何轮廓" onClose={() => setExpand(null)} wide>
          <div style={{ maxWidth: 1150 }}>
            <DomeContour input={input} result={result} W={1150} H={620} />
          </div>
        </Modal>
      )}
      {expand === 'curve' && (
        <Modal title="封头爆破压强 p总(r) × ks" onClose={() => setExpand(null)} wide>
          <PressureChart input={input} result={result} W={1360} H={620} showExcel />
        </Modal>
      )}
      {expand === 'detail' && (
        <Modal title="校核明细（逐格对照两张 Excel）" onClose={() => setExpand(null)} wide>
          <DetailView input={input} result={result} />
        </Modal>
      )}
    </div>
  )
}
