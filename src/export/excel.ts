/** 两份课件原表的计算单元格。coursePresentation.ts 负责重排及引用映射。
 * 保留原表常数、封头爆压表达式、手选层数及分段。样条系数保留矩阵求逆公式。
 */
import * as XLSX from 'xlsx'
import type { CheckResult, DesignInput, DomeGroup } from '../core/types'
import { coverageAt, domeAt, groupPressure, layerThickness, solve4, splineAt } from '../core/dome'
import { COURSE_PI, courseGrid } from '../core/course'
import { layupGroups, spiralGroups } from '../core/layup'
import { initialDesign } from '../core/initialDesign'
import { imprint } from '../core/docStamp'

type WS = XLSX.WorkSheet

const put = (ws: WS, addr: string, v: number | string | boolean | { f: string; v?: number }, t?: string) => {
  if (typeof v === 'object' && v !== null && 'f' in v) {
    ws[addr] = { t: (t as never) ?? 'n', f: v.f, v: v.v ?? 0 }
  } else if (typeof v === 'number') {
    ws[addr] = { t: 'n', v }
  } else if (typeof v === 'boolean') {
    ws[addr] = { t: 'b', v }
  } else {
    ws[addr] = { t: 's', v }
  }
}

const col = (n: number) => XLSX.utils.encode_col(n)
const ref = (ws: WS, rows: number, cols: number) => {
  ws['!ref'] = `A1:${col(cols - 1)}${rows}`
}
const widths = (ws: WS, w: number[]) => {
  ws['!cols'] = w.map((wpx) => ({ wch: wpx }))
}

/** 与原表一致的参数区（A1:D15；筒身表只到第 11 行，与原表同址，避免压到 A15 起的估算块） */
function paramBlock(ws: WS, input: DesignInput, res: CheckResult, sigmaLabel: string, maxRow = 15) {
  const { geometry: g, material: m } = input
  const d = res.derived
  // 复材层强度：与「发挥强度×Vf」一致时写公式，直接给定且不同时写数值（否则导出与界面判定不一致）
  const sigmaC = Math.abs(d.sigmaComposite - d.sigmaSpiral * m.vf) < 1e-9 ? { f: 'C11*C5' } : d.sigmaComposite
  put(ws, 'A1', '参数设置')
  put(ws, 'A2', '序号')
  put(ws, 'B2', '名称')
  put(ws, 'C2', '数值')
  put(ws, 'D2', '单位')
  const rows: Array<[number, string, number | string | { f: string }, string]> = [
    [1, '气瓶筒身段半径R', g.R, 'mm'],
    [2, '缠绕带宽（T700-24K碳纤维，单束纱）', m.bandWidth, 'mm'],
    [3, '纤维体积含量', m.vf, ''],
    [5, 'T700碳纤维密度', m.fiberDensity, 'g/cm3'],
    [6, 'T700碳纤维线密度', m.tex, 'g/m'],
    [7, '纤维单层厚度', { f: 'C7/C6/C4' }, 'mm'],
    [8, '复合材料单层厚度', { f: 'C8/C5' }, 'mm'],
    [9, '设计爆破压强', d.pb, 'MPa'],
    [10, sigmaLabel, d.sigmaSpiral, 'MPa'],
    [11, '缠绕纤维根数', m.strandCount, ''],
    [12, '缠绕总带宽', { f: 'C4*C12' }, 'mm'],
    [13, '气瓶封头短半轴对应长度（椭圆封头）', g.headShortAxis, 'mm'],
    [14, '复合材料层强度', sigmaC, 'MPa'],
  ]
  rows.forEach(([n, name, val, unit], i) => {
    const r = i + 3
    if (r > maxRow) return
    put(ws, `A${r}`, n)
    put(ws, `B${r}`, name)
    put(ws, `C${r}`, val)
    put(ws, `D${r}`, unit)
  })
}

// ── 筒身表 ───────────────────────────────────────────────────────────────────

function cylinderSheet(input: DesignInput, res: CheckResult): WS {
  const ws: WS = {}
  const spiral = spiralGroups(input.plan).filter((g) => g.active !== false && g.layers > 0 && g.angle > 0 && g.angle < 90)
  const n = spiral.length
  const hoops = res.cylinder.rows.filter(g => g.type === 'hoop')
  const m = Math.max(1, hoops.length)
  const d = res.derived
  paramBlock(ws, input, res, '碳纤维发挥强度', 11)
  put(ws, 'F1', '缠绕层设计与强度校核')
  put(ws, 'F2', '缠绕角参数计算')
  ;['缠绕角度', '缠绕角弧度', 'cosα平方', 'sinα平方', '层数'].forEach((h, i) =>
    put(ws, `${col(7 + i)}2`, h),
  )
  spiral.forEach((g, i) => {
    const r = 3 + i
    put(ws, `H${r}`, g.angle)
    put(ws, `I${r}`, { f: `H${r}/180*3.1415926` })
    put(ws, `J${r}`, { f: `COS(I${r})*COS(I${r})` })
    put(ws, `K${r}`, { f: `SIN(I${r})*SIN(I${r})` })
    put(ws, `L${r}`, g.layers)
  })
  const lastAng = 2 + n // 角度块最后一行

  put(ws, `F${lastAng + 2}`, '螺旋缠绕强度计算')
  const hh = lastAng + 3
  ;['缠绕角度', '纵向爆破压强值（单层）/MPa', '环向爆破压强值（单层）/MPa', '纵向爆破压强值（多层）/MPa', '环向爆破压强值（多层）/MPa'].forEach(
    (h, i) => put(ws, `${col(7 + i)}${hh}`, h),
  )
  spiral.forEach((_g, i) => {
    const r = hh + 1 + i
    const src = 3 + i
    put(ws, `H${r}`, { f: `H${src}` })
    put(ws, `I${r}`, { f: `2*$C$8*$C$11*J${src}/$C$3` })
    put(ws, `J${r}`, { f: `$C$11*$C$8*K${src}/$C$3` })
    put(ws, `K${r}`, { f: `I${r}*L${src}` })
    put(ws, `L${r}`, { f: `J${r}*L${src}` })
  })
  const lastS = hh + n

  put(ws, `F${lastS + 3}`, '环向缠绕强度计算')
  const h90 = lastS + 4
  ;['缠绕角度', '纵向（单层）', '环向（单层）', '层数', '环向（多层）'].forEach((h, i) => put(ws, `${col(7 + i)}${h90}`, h))
  const hoopSigma = Math.abs(d.sigmaHoop - d.sigmaSpiral) < 1e-9 ? '$C$11' : String(d.sigmaHoop)
  put(ws, `M${h90}`, '纵向（多层）')
  for (let i = 0; i < m; i++) {
    const g = hoops[i] ?? { angle: 90, layers: 0 }
    const row = h90 + 1 + i
    put(ws, `H${row}`, g.angle)
    put(ws, `I${row}`, { f: `IF(H${row}=90,0,2*${hoopSigma}*$C$8*COS(H${row}/180*3.1415926)^2/$C$3)` })
    put(ws, `J${row}`, { f: `IF(H${row}=90,${hoopSigma}*$C$8/$C$3,${hoopSigma}*$C$8*SIN(H${row}/180*3.1415926)^2/$C$3)` })
    put(ws, `K${row}`, g.layers)
    put(ws, `L${row}`, { f: `J${row}*K${row}` })
    put(ws, `M${row}`, { f: `I${row}*K${row}` })
  }
  const total = h90 + m + 4, thick = h90 + m + 8
  put(ws, `I${total - 1}`, '气瓶纵向爆破压强/MPa')
  put(ws, `J${total - 1}`, '气瓶环向爆破压强/MPa')
  put(ws, `I${total}`, { f: `SUM(K${hh + 1}:K${lastS},M${h90 + 1}:M${h90 + m})` })
  put(ws, `J${total}`, { f: `SUM(L${hh + 1}:L${lastS},L${h90 + 1}:L${h90 + m})` })
  put(ws, `I${thick - 1}`, '筒身段螺旋缠绕厚度/mm')
  put(ws, `J${thick - 1}`, '筒身段环向缠绕厚度/mm')
  put(ws, `K${thick - 1}`, '总厚度/mm')
  put(ws, `I${thick}`, { f: `SUM(L3:L${lastAng})*C9` })
  put(ws, `J${thick}`, { f: `SUM(K${h90 + 1}:K${h90 + m})*C9` })
  put(ws, `K${thick}`, { f: `I${thick}+J${thick}` })

  // 厚度估算块（复刻原表 A15:C33）
  const a = input.constraint.alphaRef
  put(ws, 'A15', '缠绕层厚度估算')
  put(ws, 'A16', '缠绕角度α')
  put(ws, 'B16', a)
  put(ws, 'A17', 'cosα')
  put(ws, 'B17', { f: 'COS(B16/180*3.1415926)' })
  put(ws, 'A18', 'tanα')
  put(ws, 'B18', { f: 'TAN(B16/180*3.1415926)' })
  put(ws, 'A20', '螺旋向厚度估算')
  put(ws, 'B20', { f: '(C3*C10)/(2*C11*B17*B17)' })
  put(ws, 'C20', 'mm')
  put(ws, 'A24', '环向厚度估算')
  put(ws, 'B24', { f: `(2-B18*B18)*C3*C10/(2*${Math.abs(d.sigmaHoop-d.sigmaSpiral)<1e-9 ? 'C11' : d.sigmaHoop})` })
  put(ws, 'C24', 'mm')
  put(ws, 'A27', '螺旋向层数估算')
  put(ws, 'B27', { f: 'B20/C8' })
  put(ws, 'A29', '环向层数估算')
  put(ws, 'B29', { f: 'B24/C8' })
  const preserve = input.constraint.preserveCourseSelections
  put(ws, 'C27', preserve && input.constraint.manualSpiralEstimate != null
    ? input.constraint.manualSpiralEstimate : { f: 'MAX(0,2*ROUNDUP(B27/2,0))' })
  put(ws, 'C29', preserve && input.constraint.manualHoopEstimate != null
    ? input.constraint.manualHoopEstimate : { f: 'MAX(0,ROUNDUP(B29,0))' })
  put(ws, 'A31', '估算纤维总厚度')
  put(ws, 'B31', { f: 'B20+B24' })
  put(ws, 'C31', 'mm')
  put(ws, 'A33', '估算复材总厚度')
  put(ws, 'B33', { f: 'B31/C5' })
  put(ws, 'C33', 'mm')

  // 范围必须盖住 A15:C33 估算块：SheetJS 只写 !ref 内的单元格，角度组少时 h90+9 < 33 会把 B31/B33 丢掉
  ref(ws, Math.max(thick, 33), 13)
  widths(ws, [6, 34, 16, 8, 2, 22, 2, 12, 16, 16, 18, 18, 12])
  return ws
}

// ── 封头逐角度组表 ───────────────────────────────────────────────────────────

/**
 * 封头各 sheet 共用的 r 网格：从最低角组 r0 起、逐 1 mm 到 R。
 * 必须共用——「封头总厚度/总爆破压强」表是按行跨表求和的，
 * 各 sheet 行号不对齐就没法加（原表也是从 10° sheet 的 30.2 起同一套网格）。
 */
function headGrid(rFirst: number, R: number): number[] {
  return courseGrid(rFirst, R)
}

function domeSheet(input: DesignInput, res: CheckResult, g: DomeGroup, grid: number[]): WS {
  const ws: WS = {}
  paramBlock(ws, input, res, '碳纤维发挥强度')
  put(ws, 'G1', '缠绕角度及极孔直径')
  ;['缠绕角度', '缠绕角弧度', 'cosα', '极孔半径/r0', '2倍带宽对应极孔半径/r2b', '1倍带宽对应极孔半径/rb', 'mR', 'm0=mR', 'nR', 'tp', 'tR'].forEach(
    (h, i) => put(ws, `${col(5 + i)}2`, h),
  )
  put(ws, 'F3', g.angle)
  put(ws, 'G3', { f: 'F3/180*PI()' })
  put(ws, 'H3', { f: 'COS(G3)' })
  put(ws, 'I3', { f: 'SIN(G3)*$C$3' })
  put(ws, 'J3', { f: 'I3+$C$13*2' })
  put(ws, 'K3', { f: 'I3+$C$13' })
  put(ws, 'L3', { f: '2*3.1415926*C3/C13*H3' })
  put(ws, 'M3', { f: 'L3' })
  put(ws, 'N3', 1)
  put(ws, 'O3', { f: 'C9' })
  put(ws, 'P3', { f: '2*N3*O3' })
  put(ws, 'M17', '厚度公式切换半径')
  put(ws, 'N17', g.manualSplineEndRadius == null ? {f:'J3'} : g.manualSplineEndRadius)

  // 与原表同址：F5:I8 条件矩阵，K5:K8 右端项，F11:I14 逆矩阵，G17:G20 系数。
  const coef = [
    [1, 'I3', 'I3^2', 'I3^3'],
    [1, 'J3', 'J3^2', 'J3^3'],
    [0, 1, '2*J3', '3*J3^2'],
    ['3.1415926*(J3^2-I3^2)', '2/3*3.1415926*(J3^3-I3^3)', '3.1415926/2*(J3^4-I3^4)', '2/5*3.1415926*(J3^5-I3^5)'],
  ]
  const rhsF = [
    'P3*3.1415926*C3*H3/L3/C13',
    'L3*N3*(ACOS(I3/J3)-ACOS(K3/J3))*O3/3.1415926',
    'L3*N3*O3/3.1415926*(I3/(J3*SQRT(J3^2-I3^2))-K3/J3/SQRT(J3^2-K3^2))',
    'M9+O9',
  ]
  coef.forEach((row, i) => {
    const r = 5 + i
    row.forEach((c, j) => put(ws, `${col(5 + j)}${r}`, typeof c === 'number' ? c : { f: c }))
    put(ws, `K${r}`, { f: rhsF[i] })
  })
  put(ws, 'M8', 'V1')
  put(ws, 'M9', { f: 'L3*N3*O3*(K3^2*ACOS(I3/K3)-I3*SQRT(K3^2-I3^2))' })
  put(ws, 'O8', 'V2')
  put(ws, 'O9', { f: '(J3^2-K3^2)*L3*N3*O3*(ACOS(I3/J3)-ACOS(K3/J3))' })
  put(ws, 'K9', '(Vconst)')
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    put(ws, `${col(5 + j)}${11 + i}`, { f: `INDEX(MINVERSE($F$5:$I$8),${i + 1},${j + 1})` })
  }
  ;['m1', 'm2', 'm3', 'm4'].forEach((k, i) => {
    put(ws, `F${17 + i}`, k)
    const r = 11 + i
    put(ws, `G${17 + i}`, { f: `SUM(F${r}*K5,G${r}*K6,H${r}*K7,I${r}*K8)` })
  })

  const head = 22
  put(ws, `E${head}`, '平行圆半径/mm')
  put(ws, `F${head}`, '2倍带宽内厚度/mm')
  put(ws, `G${head}`, '2倍带宽外厚度')
  put(ws, `H${head}`, '厚度')
  put(ws, `I${head}`, '层数（原表 I23）')
  put(ws, `J${head}`, '组厚度')
  put(ws, `K${head}`, '封头缠绕角度')
  put(ws, `L${head}`, '爆破压强')
  grid.forEach((r, i) => {
    const row = head + 1 + i
    put(ws, `E${row}`, r)
    put(ws, `F${row}`, { f: `IF(E${row}>$N$17,0,MAX(0,$G$17+$G$18*E${row}+$G$19*E${row}^2+$G$20*E${row}^3))` })
    put(ws, `G${row}`, { f: `IF(E${row}<$K$3,0,$L$3*$N$3*(ACOS($I$3/E${row})-ACOS(($I$3+$C$13)/E${row}))*$O$3/3.1415926)` })
    if (i === 0) put(ws, 'I23', g.cycles)
    const hExpr = `IF(E${row}<=$N$17,F${row},G${row})`
    put(ws, `H${row}`, {
      f: hExpr,
    })
    put(ws, `J${row}`, { f: `H${row}*$I$23` })
    put(ws, `K${row}`, { f: `IF(E${row}<$I$3,0,ASIN($I$3/E${row})/3.1415926*180)` })
    put(ws, `L${row}`, { f: `IF(E${row}<$I$3,0,2*J${row}*$C$15/$C$3*COS(K${row}/180*PI())^2)` })
  })
  ref(ws, head + grid.length, 16)
  widths(ws, [6, 34, 16, 8, 2, 14, 14, 14, 12, 14, 16, 22, 12, 10, 12, 12])
  return ws
}

/** 封头各组 sheet 名；同一角度出现多行时加序号（sheet 名不能重复） */
function sheetNames(groups: DomeGroup[]): string[] {
  const seen = new Map<number, number>()
  return groups.map((g) => {
    const k = (seen.get(g.angle) ?? 0) + 1
    seen.set(g.angle, k)
    return k === 1 ? `封头-${g.angle}°` : `封头-${g.angle}°(${k})`
  })
}

function totalsSheet(input: DesignInput, res: CheckResult, kind: 't' | 'p'): WS {
  const ws: WS = {}
  const groups = res.dome.groups
  const rows = res.dome.profile.length
  const grid = headGrid(res.dome.rFirst, input.geometry.R)
  const names = sheetNames(groups)
  put(ws, 'A1', '平行圆半径 r')
  put(ws, 'B1', kind === 't' ? '总厚度' : '总爆破压强')
  if (kind === 'p') put(ws, 'C1', `Ks=${input.requirement.ks}`)
  groups.forEach((g, i) => {
    const src = kind === 't' ? 'J' : 'L'
    put(ws, `${col(3 + i)}1`, `${g.angle}° 组`)
    for (let r = 0; r < grid.length; r++) {
    const row = 2 + r
    put(ws, `${col(3 + i)}${row}`, { f: `'${names[i]}'!${src}${row + 21}` })
  }
  })
  const first = col(3) // 各组占 D 起
  const last = col(3 + groups.length - 1)
  for (let r = 0; r < grid.length; r++) {
    const row = 2 + r
    put(ws, `A${row}`, { f: `'${names[0]}'!E${row + 21}` })
    put(ws, `B${row}`, { f: `SUM(${first}${row}:${last}${row})` })
    if (kind === 'p') put(ws, `C${row}`, { f: `B${row}*${input.requirement.ks}` })
  }
  ref(ws, 1 + grid.length, 4 + groups.length)
  widths(ws, [14, 14, 12, ...groups.map(() => 12)])
  void rows
  return ws
}

// ── 汇总与说明页 ─────────────────────────────────────────────────────────────

function summarySheet(input: DesignInput, res: CheckResult): WS {
  const ws: WS = {}
  const d = res.derived
  const c = res.cylinder
  const dm = res.dome
  let r = 1
  const line = (a: string, b?: string | number) => {
    put(ws, `A${r}`, a)
    if (b !== undefined) put(ws, `B${r}`, b)
    r++
  }
  line('复合材料气瓶缠绕铺层设计软件 — 设计方案汇总', '')
  line('导出时间', new Date().toLocaleString('zh-CN'))
  line('')
  line('【设计条件】')
  line('筒身段半径 R (mm)', input.geometry.R)
  line('缠绕极孔半径 r₀ (mm)', d.r0)
  line('设计爆破压强 pb (MPa)', d.pb)
  line('应力平衡系数 ks', input.requirement.ks)
  line('校核窗口 r (mm)', `${res.dome.rBoss.toFixed(2)} ~ ${input.geometry.R}`)
  line('')
  line('【材料 / 工艺】')
  line('纤维单层厚 tf (mm)', d.tf)
  line('复材单层厚 tc (mm)', d.tc)
  line('总带宽 b_tot (mm)', d.bandTotal)
  line('σ发挥 螺旋 / 环向 (MPa)', `${d.sigmaSpiral.toFixed(1)} / ${d.sigmaHoop.toFixed(1)}`)
  line('σc 复材层强度 (MPa)', d.sigmaComposite)
  line('')
  line('【铺层方案（表序 = 缠绕先后）】')
  layupGroups(input.plan).forEach((g, i) =>
    line(`  第${i + 1}组 ${g.type === 'hoop' ? '环向' : '螺旋'} ${g.angle}°`, `${g.layers} 层${g.active === false ? '（未激活，不参与计算）' : ''}`),
  )
  line('')
  line('【筒身校核】')
  line('纵向爆压 pα (MPa)', Number(c.pa.toFixed(4)))
  line('环向爆压 pθ (MPa)', Number(c.pth.toFixed(4)))
  line('判定', `${c.paPass ? 'pα ✓' : 'pα ✗'}　${c.pthPass ? 'pθ ✓' : 'pθ ✗'}`)
  line('螺旋层厚 / 环向层厚 / 总厚 (mm)', `${c.spiralThickness.toFixed(4)} / ${c.hoopThickness.toFixed(4)} / ${c.totalThickness.toFixed(4)}`)
  line('')
  line('【封头校核】')
  line('封头经验初估 (MPa)', Number(res.head.pressure.toFixed(4)))
  line('局部参考曲线最小 ks·Σp (MPa)', Number(dm.minP.toFixed(4)))
  line('  位置 r (mm)', Number(dm.minPR.toFixed(2)))
  line('r=R 处 ks·Σp (MPa)', Number((dm.profile[dm.profile.length - 1]?.pTotal ?? 0).toFixed(4)))
  line('完整半径列最小值', Number(dm.minPAll.toFixed(4)))
  line('封头 t总(R) vs 筒身螺旋层厚 (mm)', `${dm.tAtR.toFixed(4)} vs ${c.spiralThickness.toFixed(4)}`)
  line('薄弱区', dm.weakZones.length ? dm.weakZones.map((z) => `r≈${z.from.toFixed(1)}~${z.to.toFixed(1)}`).join('；') : '无')
  line('综合判定', res.verdict === 'pass' ? '满足' : res.verdict === 'adjust' ? '待调整（封头薄弱）' : '不满足（筒身不足）')
  line('')
  line('【建议】')
  line(res.advice.text)
  res.advice.variants.forEach((v) =>
    line(`  置换 ${v.transfer} 层`, `min ${v.minP.toFixed(1)} MPa @ r≈${v.minPR.toFixed(0)}；r=R ${v.pAtR.toFixed(1)}；pθ ${v.pth.toFixed(1)}`),
  )
  ref(ws, r, 2)
  widths(ws, [44, 60])
  return ws
}

function notesSheet(): WS {
  const ws: WS = {}
  const rows = [
    ['计算依据', ''],
    ['筒身', '强度设计与计算.xls'],
    ['封头', '封头厚度计算公式最终 - 演示版.xls'],
    ['常数', 'π₀=3.1415926；π=PI()。'],
    ['封头局部参考值', 'COS(K/180*PI())^2。'],
    ['封头经验初估', '筒身角 α₀、纯纤维厚度与纤维强度。'],
    ['厚度计算', '极孔两倍总带宽内取三次样条，外侧取覆盖公式；原参考方案保留其逐点选值。'],
    ['层数初估', '保留小数估算及独立手选层数。'],
    ['矩阵与系数', '矩阵求逆和系数保留活公式。'],
  ]
  rows.forEach(([a,b],i)=>{put(ws,`A${i+1}`,a);put(ws,`B${i+1}`,b)})
  ref(ws,rows.length,2)
  return ws
}

// ── 入口 ────────────────────────────────────────────────────────────────────

export function exportFileName(input: DesignInput, res: CheckResult) {
  return `铺层校核报告-R${input.geometry.R}-pb${res.derived.pb.toFixed(0)}.xlsx`
}

/**
 * 生成 .xlsx 字节：在 workbook.xml 末尾补 <calcPr fullCalcOnLoad="1"/>。
 * SheetJS 只写公式不写计算结果（缓存值为 0），不加这一句时部分查看器打开会全是 0。
 */
export async function workbookBytes(input: DesignInput, res: CheckResult): Promise<Uint8Array> {
  if (!res.dome.groups.length) throw new Error('没有可用的螺旋角度组，无法导出封头表')
  const { writePresentation } = await import('./coursePresentation')
  return writePresentation(buildWorkbook(input, res), input, res)
}

export async function exportWorkbook(input: DesignInput, res: CheckResult) {
  const bytes = await workbookBytes(input, res)
  const name = exportFileName(input, res)
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}

/** 为公式附带与当前输入一致的数值缓存；不重算的查看器也能显示真实结果。 */
function cacheResults(wb: XLSX.WorkBook, input: DesignInput, res: CheckResult, grid: number[]) {
  const set = (ws: WS, address: string, value: number) => {
    if (ws[address]?.f) {
      if (!Number.isFinite(value)) throw new Error(`导出数值无效：${address}`)
      ws[address].v = value
    }
  }
  const d = res.derived, c = res.cylinder, R = input.geometry.R
  const cy = wb.Sheets['筒身强度设计与计算']
  const groups = c.rows.filter((r) => r.type === 'spiral')
  const n = groups.length, hh = n + 5, last = hh + n, h90 = last + 4
  const paramSheets = [cy, ...sheetNames(res.dome.groups).map((name) => wb.Sheets[name])]
  for (const ws of paramSheets) {
    for (const [address, value] of Object.entries({ C8: d.tf, C9: d.tc, C13: d.bandTotal, C15: d.sigmaComposite })) set(ws, address, value)
  }
  groups.forEach((g, i) => {
    const row = i + 3, sr = hh + 1 + i, a = g.angle * COURSE_PI / 180
    for (const [address, value] of Object.entries({
      [`I${row}`]: a, [`J${row}`]: Math.cos(a) ** 2, [`K${row}`]: Math.sin(a) ** 2,
      [`H${sr}`]: g.angle, [`I${sr}`]: g.paUnit, [`J${sr}`]: g.pthUnit, [`K${sr}`]: g.paSum, [`L${sr}`]: g.pthSum,
    })) set(cy, address, value)
  })
  const estimate = c.estimate
  const initial = initialDesign(input)
  const hoops = c.rows.filter(r => r.type === 'hoop'), m = Math.max(1, hoops.length)
  hoops.forEach((g, i) => { const row = h90 + 1 + i
    for (const [address, value] of Object.entries({ [`I${row}`]: g.paUnit, [`J${row}`]: g.pthUnit, [`L${row}`]: g.pthSum, [`M${row}`]: g.paSum })) set(cy, address, value)
  })
  for (const [address, value] of Object.entries({
    [`I${h90 + m + 4}`]: c.pa, [`J${h90 + m + 4}`]: c.pth,
    [`I${h90 + m + 8}`]: c.spiralThickness, [`J${h90 + m + 8}`]: c.hoopThickness, [`K${h90 + m + 8}`]: c.totalThickness,
    B17: estimate.cosRef, B18: estimate.tanRef, B20: estimate.hSpiral, B24: estimate.hHoop,
    B27: estimate.nSpiral, B29: estimate.nHoop, B31: estimate.hTotal, B33: estimate.tComposite,
    C27: input.constraint.preserveCourseSelections ? input.constraint.manualSpiralEstimate ?? initial.spiral : initial.spiral,
    C29: input.constraint.preserveCourseSelections ? input.constraint.manualHoopEstimate ?? initial.hoop : initial.hoop,
  })) set(cy, address, value)
  sheetNames(res.dome.groups).forEach((name, index) => {
    const ws = wb.Sheets[name], g = res.dome.groups[index]
    for (const [address, value] of Object.entries({
      G3: g.angle * Math.PI / 180, H3: Math.cos(g.angle * Math.PI / 180), I3: g.r0, J3: g.r2b, K3: g.rb,
      L3: g.mR, M3: g.mR, O3: g.tp, P3: g.tR, M9: g.V1, O9: g.V2, N17: g.splineEndRadius,
    })) set(ws, address, value)
    const r0 = g.r0, rb = g.rb, r2 = g.r2b
    const matrix = [
      [1, r0, r0 ** 2, r0 ** 3, g.tp * g.nR],
      [1, r2, r2 ** 2, r2 ** 3, coverageAt(g, r2)],
      [0, 1, 2 * r2, 3 * r2 ** 2, g.mR * g.nR * g.tp / COURSE_PI * (r0 / (r2 * Math.sqrt(r2 ** 2 - r0 ** 2)) - rb / (r2 * Math.sqrt(r2 ** 2 - rb ** 2)))],
      [COURSE_PI * (r2 ** 2 - r0 ** 2), 2 / 3 * COURSE_PI * (r2 ** 3 - r0 ** 3), COURSE_PI / 2 * (r2 ** 4 - r0 ** 4), 2 / 5 * COURSE_PI * (r2 ** 5 - r0 ** 5), g.Vconst],
    ]
    matrix.forEach((row, i) => row.forEach((value, j) => set(ws, j === 4 ? `K${5 + i}` : `${col(5 + j)}${5 + i}`, value)))
    for (let j = 0; j < 4; j++) {
      const solution = solve4(matrix.map((row, i) => [...row.slice(0, 4), Number(i === j)]))!
      solution.forEach((v, i) => set(ws, `${col(5 + j)}${11 + i}`, v))
    }
    g.m.forEach((v, i) => set(ws, `G${17 + i}`, v))
    grid.forEach((r, i) => {
      const row = 23 + i, t = layerThickness(g, r), tg = t * g.cycles
      const a = r < g.r0 ? 0 : Math.asin(g.r0 / r)
      for (const [address, value] of Object.entries({
        [`F${row}`]: r > g.splineEndRadius ? 0 : Math.max(0, splineAt(g, r)), [`G${row}`]: coverageAt(g, r), [`H${row}`]: t,
        [`J${row}`]: tg, [`K${row}`]: a * 180 / COURSE_PI,
        [`L${row}`]: groupPressure(g, r, R, d.sigmaComposite),
      })) set(ws, address, value)
    })
  })
  grid.forEach((r, i) => {
    const row = i + 2, point = domeAt(res.dome.groups, r, R, d.sigmaComposite, input.requirement.ks)
    const t = wb.Sheets['封头总厚度'], p = wb.Sheets['封头总爆破压强']
    set(t, `A${row}`, r); set(p, `A${row}`, r)
    set(t, `B${row}`, point.tTotal); set(p, `B${row}`, point.pSum); set(p, `C${row}`, point.pTotal)
    point.tGroups.forEach((v, j) => set(t, `${col(3 + j)}${row}`, v))
    point.pGroups.forEach((v, j) => set(p, `${col(3 + j)}${row}`, v))
  })
}

/** 供测试：只生成 workbook 不下载 */
export function buildWorkbook(input: DesignInput, res: CheckResult) {
  const wb = XLSX.utils.book_new()
  wb.Props = { Title: '气瓶铺层计算书', Subject: '复合材料气瓶缠绕铺层设计软件', Author: imprint, LastAuthor: imprint, Company: imprint }
  XLSX.utils.book_append_sheet(wb, summarySheet(input, res), '工况与气瓶参数')
  XLSX.utils.book_append_sheet(wb, cylinderSheet(input, res), '筒身强度设计与计算')
  const grid = headGrid(res.dome.rFirst, input.geometry.R)
  const names = sheetNames(res.dome.groups)
  res.dome.groups.forEach((g, i) => XLSX.utils.book_append_sheet(wb, domeSheet(input, res, g, grid), names[i]))
  XLSX.utils.book_append_sheet(wb, totalsSheet(input, res, 't'), '封头总厚度')
  XLSX.utils.book_append_sheet(wb, totalsSheet(input, res, 'p'), '封头总爆破压强')
  XLSX.utils.book_append_sheet(wb, notesSheet(), '说明')
  cacheResults(wb, input, res, grid)
  return wb
}
