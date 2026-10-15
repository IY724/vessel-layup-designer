/**
 * CylinderPanel.tsx — 筒身铺层表（行数不限、可滚动、改动即时刷新）
 *
 * 交互（内测 #12）：
 *   · 拖动整行改变缠绕先后（HTML5 draggable，无新依赖），行序即缠绕顺序
 *   · 缠绕角就地可改
 *   · 首列是激活开关：显示序号即参与计算，点击出 × 表示不激活，再点恢复
 *   · 右键该行：删除 / 在上面插入 / 在下面插入
 *   · 添加角度组默认落在最后一行，不用 window.prompt
 * 非激活行灰显、不进小计合计、不进封头分组（netting/dome 均已按 active 过滤）。
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { DesignStore } from '../state/store'
import type { CylinderRow, GroupSpec } from '../core/types'
import { angleColor } from './colors'
import { FormulaHelp } from './FormulaHelp'
import { sym } from './Sym'

const n = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')
/** 右键菜单定位与目标行 */
interface Menu {
  x: number
  y: number
  index: number
}

export function CylinderPanel({ store, onAuto }: { store: DesignStore; onAuto: () => void }) {
  const { input, setPlan, result } = store
  const cy = result.cylinder
  const pb = result.derived.pb
  const spiral = input.plan.spiral

  const [menu, setMenu] = useState<Menu | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const dragFrom = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  // 菜单开启时：点菜单外 / Esc / 滚动 即关闭
  useEffect(() => {
    if (!menu) return
    const onDown = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return
      setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onDown, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onDown, true)
    }
  }, [menu])

  const commit = (next: GroupSpec[]) => setPlan({ spiral: next, hoop: input.plan.hoop })

  const setLayers = (idx: number, layers: number) =>
    commit(spiral.map((g, i) => (i === idx ? { ...g, layers: Math.max(0, Math.round(layers)) } : g)))
  const setAngle = (idx: number, angle: number) =>
    commit(spiral.map((g, i) => (i === idx ? { ...g, angle: Math.min(89.9, Math.max(0.1, angle)), splineEndRadius: null } : g)))
  const toggleActive = (idx: number) =>
    commit(spiral.map((g, i) => (i === idx ? { ...g, active: g.active === false } : g)))
  const removeGroup = (idx: number) => commit(spiral.filter((_, i) => i !== idx))
  const insertAt = (idx: number, angle: number, layers: number) => {
    const next = [...spiral]
    next.splice(idx, 0, { angle, layers })
    commit(next)
  }
  const addGroup = () => {
    // 落在最后一行；角度取一个尚未占用的常规值，之后可就地改
    const used = new Set(spiral.map((g) => g.angle))
    const angle = [20, 25, 30, 15, 40, 10].find((a) => !used.has(a)) ?? 20
    insertAt(spiral.length, angle, 2)
  }
  const setHoop = (layers: number) => setPlan({ spiral, hoop: Math.max(0, Math.round(layers)) })

  // 结果行按“激活顺序”对齐：netting 只把激活且 0<α<90 的组写进 cy.rows
  const spiralRows = cy.rows.filter((r) => r.type === 'spiral')
  let ptr = 0
  const rowAt: Array<CylinderRow | undefined> = spiral.map((g) => {
    if (g.active === false || g.layers <= 0 || !(g.angle > 0 && g.angle < 90)) return undefined
    return spiralRows[ptr++]
  })

  const onDragStart = (i: number) => (e: ReactDragEvent<HTMLTableRowElement>) => {
    dragFrom.current = i
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(i))
  }
  const onDragOver = (i: number) => (e: ReactDragEvent<HTMLTableRowElement>) => {
    if (dragFrom.current === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(i)
  }
  const onDrop = (i: number) => (e: ReactDragEvent<HTMLTableRowElement>) => {
    e.preventDefault()
    const from = dragFrom.current
    dragFrom.current = null
    setDragOver(null)
    if (from === null || from === i) return
    const next = [...spiral]
    const [moved] = next.splice(from, 1)
    next.splice(i, 0, moved)
    commit(next)
  }
  const onDragEnd = () => {
    dragFrom.current = null
    setDragOver(null)
  }
  const onContext = (i: number) => (e: ReactMouseEvent<HTMLTableRowElement>) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, index: i })
  }

  const rowClass = (i: number, off: boolean) => {
    const cls = ['draggable']
    if (off) cls.push('off')
    if (dragFrom.current === i) cls.push('dragging')
    if (dragOver === i && dragFrom.current !== null && dragFrom.current !== i) {
      cls.push(dragFrom.current < i ? 'drop-below' : 'drop-above')
    }
    return cls.join(' ')
  }

  return (
    <div className="card">
      <h3>
        筒身铺层方案
        <span className="tail">
          拖动行改缠绕先后 · 角度就地改 · 首列点 × 不激活 · 右键增删
          <FormulaHelp
            title="筒身爆破压强公式"
            items={[
              { frm: 'p_{\\alpha i}=\\dfrac{2\\,t_f\\,\\sigma_{\\text{螺旋}}\\cos^2\\alpha}{R}' },
              { frm: 'p_{\\theta i}=\\dfrac{t_f\\,\\sigma_{\\text{螺旋}}\\sin^2\\alpha}{R}' },
              { frm: 'p_{\\theta 90}=\\dfrac{t_f\\,\\sigma_{\\text{环向}}}{R}', desc: '纵向贡献为零' },
              { frm: 'p_\\alpha=\\sum n\\,p_{\\alpha i}\\ge p_b,\\quad p_\\theta=\\sum n\\,p_{\\theta i}+n_{90}p_{\\theta 90}\\ge p_b', desc: '纵向、环向分别不低于设计爆压；厚度按复材单层厚 t_c 累加' },
            ]}
          />
        </span>
      </h3>
      <div className="tablewrap">
        <table className="grid">
          <thead>
            <tr>
              <th title="点击首列切换是否激活；拖动整行调整缠绕先后">激活</th>
              <th>缠绕角</th>
              <th>类型</th>
              <th>层数</th>
              <th>纵向贡献 /MPa</th>
              <th>环向贡献 /MPa</th>
              <th>厚度 /mm</th>
            </tr>
          </thead>
          <tbody>
            {spiral.map((g, gi) => {
              const off = g.active === false
              const r = rowAt[gi]
              const odd = !off && g.layers % 2 === 1
              return (
                <tr
                  key={gi}
                  className={rowClass(gi, off)}
                  draggable
                  onDragStart={onDragStart(gi)}
                  onDragOver={onDragOver(gi)}
                  onDrop={onDrop(gi)}
                  onDragEnd={onDragEnd}
                  onContextMenu={onContext(gi)}
                >
                  <td className="act">
                    <button
                      className={`act-toggle${off ? ' off' : ''}`}
                      title={off ? '已停用：点击重新激活' : '已激活：点击停用该角度组'}
                      onClick={() => toggleActive(gi)}
                    >
                      {off ? '×' : gi + 1}
                    </button>
                  </td>
                  <td className="angle">
                    <input
                      className="angle-input"
                      type="number"
                      step={1}
                      min={0.1}
                      max={89.9}
                      value={g.angle}
                      title="缠绕角（度），可就地修改"
                      style={{ color: off ? undefined : angleColor(g.angle, gi) } as CSSProperties}
                      onChange={(e) => setAngle(gi, Number(e.target.value) || 0)}
                    />
                    °
                  </td>
                  <td className="tag">螺旋</td>
                  <td>
                    <span className="stepper">
                      <button onClick={() => setLayers(gi, g.layers - 1)}>−</button>
                      <input
                        type="number"
                        value={g.layers}
                        min={0}
                        onChange={(e) => setLayers(gi, Number(e.target.value) || 0)}
                      />
                      <button onClick={() => setLayers(gi, g.layers + 1)}>＋</button>
                    </span>
                    {odd && <span className="tag" style={{ color: '#92400e' }}> 奇数层</span>}
                  </td>
                  <td>{off ? '—' : n(r?.paSum ?? 0)}</td>
                  <td>{off ? '—' : n(r?.pthSum ?? 0)}</td>
                  <td>{off ? '—' : n(g.layers * result.derived.tc)}</td>
                </tr>
              )
            })}
            <tr>
              <td className="act">
                <span className="tag" title="环向层始终参与计算">—</span>
              </td>
              <td className="angle">90°</td>
              <td className="tag">环向</td>
              <td>
                <span className="stepper">
                  <button onClick={() => setHoop(input.plan.hoop - 1)}>−</button>
                  <input
                    type="number"
                    value={input.plan.hoop}
                    min={0}
                    onChange={(e) => setHoop(Number(e.target.value) || 0)}
                  />
                  <button onClick={() => setHoop(input.plan.hoop + 1)}>＋</button>
                </span>
              </td>
              <td className="tag">0.00</td>
              <td className={cy.pthPass ? 'ok' : 'bad'}>{n(cy.rows.find((r) => r.type === 'hoop')?.pthSum ?? 0)}</td>
              <td>{n(cy.hoopThickness)}</td>
            </tr>
            <tr className="sub">
              <td colSpan={3}>小计</td>
              <td>螺旋 {cy.spiralLayers} 层 / 环向 {cy.hoopLayers} 层</td>
              <td />
              <td />
              <td>螺旋 {n(cy.spiralThickness)} + 环向 {n(cy.hoopThickness)}</td>
            </tr>
            <tr className="total">
              <td colSpan={3}>合计</td>
              <td>{cy.spiralLayers + cy.hoopLayers} 层</td>
              <td className={cy.paPass ? 'ok' : 'bad'}>{n(cy.pa)}</td>
              <td className={cy.pthPass ? 'ok' : 'bad'}>{n(cy.pth)}</td>
              <td>{n(cy.totalThickness)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="pane-actions">
        <button className="btn sm" onClick={addGroup}>
          + 添加角度组
        </button>
        <button className="btn sm" onClick={onAuto}>
          自动生成
        </button>
        <span className="tag">
          目标爆压 {sym('p_b')} = {n(pb, 1)} MPa；单层厚 {sym('t_c')} = {n(result.derived.tc, 4)} mm；纤维发挥强度 螺旋 {n(result.derived.sigmaSpiral, 0)} / 环向{' '}
          {n(result.derived.sigmaHoop, 0)} MPa
        </span>
      </div>
      <details style={{ marginTop: 10 }}>
        <summary>分段取值</summary>
        <div className="tablewrap">
          <table className="grid">
            <thead><tr><th>螺旋角度 / °</th><th>2倍带宽边界 / mm</th><th>样条选取上限 / mm</th></tr></thead>
            <tbody>{spiral.map((g,i) => <tr key={i}>
              <td>{g.angle}</td>
              <td>{n(input.geometry.R*Math.sin(g.angle*Math.PI/180)+result.derived.bandTotal*2,4)}</td>
              <td><input type="number" aria-label={`${g.angle}°样条选取上限`} value={g.splineEndRadius??''} placeholder="按2倍带宽边界" step="0.1" onChange={e=>commit(spiral.map((item,j)=>j===i?{...item,splineEndRadius:e.target.value===''?null:Number(e.target.value)}:item))}/></td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
      {result.advice.kind !== 'none' && (
        <div className={`banner ${result.verdict === 'fail' ? 'err' : ''}`} style={{ marginTop: 10 }}>
          <div>
            <b>薄弱处诊断：</b>
            {sym(result.advice.text)}
            {result.advice.variants.length > 0 && (
              <div style={{ marginTop: 4 }}>
                试算：
                {result.advice.variants.map((v) => (
                  <span key={v.transfer} className="tag" style={{ marginRight: 10 }}>
                    置换 {v.transfer} 层 → 封头初估 {v.headPressure.toFixed(1)}、筒身环向 {v.pth.toFixed(1)} MPa
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {result.diagnoses
        .filter((d) => d.level !== 'ok')
        .slice(0, 4)
        .map((d, i) => (
          <div key={i} className={`banner ${d.level === 'error' ? 'err' : ''}`} style={{ marginTop: 6 }}>
            <div>{d.level === 'error' ? '错误：' : '提示：'}{sym(d.text)}</div>
          </div>
        ))}
      {menu && (
        <div ref={menuRef} className="ctxmenu" style={{ left: menu.x, top: menu.y }}>
          <button
            className="danger"
            onClick={() => {
              removeGroup(menu.index)
              setMenu(null)
            }}
          >
            删除该层
          </button>
          <button
            onClick={() => {
              insertAt(menu.index, 20, 2)
              setMenu(null)
            }}
          >
            在上面插入
          </button>
          <button
            onClick={() => {
              insertAt(menu.index + 1, 20, 2)
              setMenu(null)
            }}
          >
            在下面插入
          </button>
        </div>
      )}
    </div>
  )
}
