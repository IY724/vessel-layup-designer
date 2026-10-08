/**
 * excel.ts — 复刻两张课程 Excel 的导出（SheetJS，写「活公式」）
 *
 * 导出的 .xlsx 打开后是一份可追溯、可改的模型：单元格地址与公式语义与原表一致，
 * 数值由 Excel 自己重算，而不是把软件算好的死数贴进去。这样做的目的：
 *   ① 可以直接和原表并排对账；② 改了参数会跟着变；③ 评审时能看清每一步来源。
 *
 * 与原表的差异（导出文件的「说明」页里也写明了）：
 *   - 封头 L 列默认用修正口径 cos²K；切到「Excel 原样复算」时写回原表的 cos(u·cos u)。
 *   - 原表 H 列（厚度）靠作者手工在 r≤r2b 用样条、r>r2b 用覆盖公式，这里写成 IF 公式。
 *   - 原表 r<r0 处靠手工留空/置 0，这里用 IF 守卫，两种口径都不再产生 #NUM!。
 *   - m1..m4 写数值（原表 G17 是矩阵求逆的数组公式），并附方程组系数块供复核。
 */
import * as XLSX from 'xlsx'
import type { CheckResult, DesignInput, DomeGroup } from '../core/types'
import { effectiveRBoss } from '../core/checker'

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

/** 与原表一致的参数区（A1:D15） */
function paramBlock(ws: WS, input: DesignInput, res: CheckResult, sigmaLabel: string) {
  const { geometry: g, material: m } = input
  const d = res.derived
  put(ws, 'A1', '参数设置')
  put(ws, 'A2', '序号')
  put(ws, 'B2', '名称')
  put(ws, 'C2', '数值')
  put(ws, 'D2', '单位')
  const rows: Array<[number, string, number | string | { f: string }, string]> = [
    [1, '气瓶筒身段半径R', g.R, 'mm'],
    [2, '缠绕带宽（单束纱）', m.bandWidth, 'mm'],
    [3, '纤维体积含量', m.vf, ''],
    [5, '碳纤维密度', m.fiberDensity, 'g/cm3'],
    [6, '碳纤维线密度', m.tex, 'g/m'],
    [7, '纤维单层厚度', { f: 'C7/C6/C4' }, 'mm'],
    [8, '复合材料单层厚度', { f: 'C8/C5' }, 'mm'],
    [9, '设计爆破压强', d.pb, 'MPa'],
    [10, sigmaLabel, d.sigmaSpiral, 'MPa'],
    [11, '缠绕纤维根数', m.strandCount, ''],
    [12, '缠绕总带宽', { f: 'C4*C12' }, 'mm'],
    [13, '气瓶封头短半轴对应长度（椭圆封头）', g.headShortAxis, 'mm'],
    [14, '复合材料层强度', { f: 'C11*C5' }, 'MPa'],
  ]
  rows.forEach(([n, name, val, unit], i) => {
    const r = i + 3
    put(ws, `A${r}`, n)
    put(ws, `B${r}`, name)
    put(ws, `C${r}`, val)
    put(ws, `D${r}`, unit)
  })
}

// ── 筒身表 ───────────────────────────────────────────────────────────────────

function cylinderSheet(input: DesignInput, res: CheckResult): WS {
  const ws: WS = {}
  const spiral = input.plan.spiral.filter((g) => g.layers > 0 && g.angle < 90)
  const n = spiral.length
  paramBlock(ws, input, res, '碳纤维发挥强度')
  put(ws, 'F1', '缠绕层设计与强度校核')
  put(ws, 'F2', '缠绕角参数计算')
  ;['缠绕角度', '缠绕角弧度', 'cosα平方', 'sinα平方', '层数'].forEach((h, i) =>
    put(ws, `${col(7 + i)}2`, h),
  )
  spiral.forEach((g, i) => {
    const r = 3 + i
    put(ws, `H${r}`, g.angle)
    put(ws, `I${r}`, { f: `H${r}/180*PI()` })
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
  put(ws, `H${h90 + 1}`, 90)
  put(ws, `I${h90 + 1}`, 0)
  put(ws, `J${h90 + 1}`, { f: 'C11*C8/C3' })
  put(ws, `K${h90 + 1}`, input.plan.hoop)
  put(ws, `L${h90 + 1}`, { f: `J${h90 + 1}*K${h90 + 1}` })

  put(ws, `I${h90 + 4}`, '气瓶纵向爆破压强/MPa')
  put(ws, `J${h90 + 4}`, '气瓶环向爆破压强/MPa')
  put(ws, `I${h90 + 5}`, { f: `SUM(K${hh + 1}:K${lastS})` })
  put(ws, `J${h90 + 5}`, { f: `SUM(L${hh + 1}:L${lastS},L${h90 + 1})` })
  put(ws, `I${h90 + 8}`, '筒身段螺旋缠绕厚度/mm')
  put(ws, `J${h90 + 8}`, '筒身段环向缠绕厚度/mm')
  put(ws, `K${h90 + 8}`, '总厚度/mm')
  put(ws, `I${h90 + 9}`, { f: `SUM(L3:L${lastAng})*C9` })
  put(ws, `J${h90 + 9}`, { f: `K${h90 + 1}*C9` })
  put(ws, `K${h90 + 9}`, { f: `I${h90 + 9}+J${h90 + 9}` })

  // 厚度估算块（复刻原表 A15:C33）
  const a = input.constraint.alphaRef
  put(ws, 'A15', '缠绕层厚度估算')
  put(ws, 'A16', '缠绕角度α')
  put(ws, 'B16', a)
  put(ws, 'A17', 'cosα')
  put(ws, 'B17', { f: 'COS(B16/180*PI())' })
  put(ws, 'A18', 'tanα')
  put(ws, 'B18', { f: 'TAN(B16/180*PI())' })
  put(ws, 'A20', '螺旋向厚度估算')
  put(ws, 'B20', { f: '(C3*C10)/(2*C11*B17*B17)' })
  put(ws, 'C20', 'mm')
  put(ws, 'A24', '环向厚度估算')
  put(ws, 'B24', { f: '(2-B18*B18)*C3*C10/(2*C11)' })
  put(ws, 'C24', 'mm')
  put(ws, 'A27', '螺旋向层数估算（软件规则：向上取整）')
  put(ws, 'B27', { f: 'ROUNDUP(B20/C8,0)' })
  put(ws, 'A29', '环向层数估算（软件规则：向上取整）')
  put(ws, 'B29', { f: 'ROUNDUP(B24/C8,0)' })
  put(ws, 'A31', '估算纤维总厚度')
  put(ws, 'B31', { f: 'B20+B24' })
  put(ws, 'C31', 'mm')
  put(ws, 'A33', '估算复材总厚度')
  put(ws, 'B33', { f: 'B31/C5' })
  put(ws, 'C33', 'mm')

  ref(ws, h90 + 9, 13)
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
  const start = Math.ceil((rFirst + 0.05) * 10) / 10
  const out: number[] = []
  for (let r = start; r < R - 1e-9; r += 1) out.push(Number(r.toFixed(4)))
  out.push(R)
  return out
}

function domeSheet(input: DesignInput, res: CheckResult, g: DomeGroup, grid: number[]): WS {
  const ws: WS = {}
  const corrected = input.refMode === 'corrected'
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
  put(ws, 'L3', { f: '2*PI()*C3/C13*H3' })
  put(ws, 'M3', { f: 'L3' })
  put(ws, 'N3', 1)
  put(ws, 'O3', { f: '=C9' })
  put(ws, 'P3', { f: '2*N3*O3' })

  // 样条方程组：系数矩阵 + 右端项 + 解（便于复核 m1..m4）
  put(ws, 'E16', '三次样条 t(r)=m1+m2·r+m3·r²+m4·r³ 的四条件方程组')
  const rhs = ['t(r0)=nR·tp', 't(r2b)=覆盖公式', "t'(r2b)=覆盖公式导数", '∫2πr·t dr = V1+V2']
  const coef = [
    [1, 'I3', 'I3^2', 'I3^3'],
    [1, 'J3', 'J3^2', 'J3^3'],
    [0, 1, '2*J3', '3*J3^2'],
    ['PI()*(J3^2-I3^2)', '2/3*PI()*(J3^3-I3^3)', 'PI()/2*(J3^4-I3^4)', '2/5*PI()*(J3^5-I3^5)'],
  ]
  const rhsF = [
    'O3*N3',
    'L3*N3*(ACOS(I3/J3)-ACOS(K3/J3))*O3/PI()',
    'L3*N3/PI()*(I3/(J3*SQRT(J3^2-I3^2))-K3/J3/SQRT(J3^2-K3^2))',
    'M9+O9',
  ]
  coef.forEach((row, i) => {
    const r = 17 + i
    put(ws, `B${r}`, rhs[i])
    row.forEach((c, j) => put(ws, `${col(4 + j)}${r}`, typeof c === 'number' ? c : { f: c }))
    put(ws, `H${r}`, { f: rhsF[i] })
  })
  put(ws, 'M8', 'V1')
  put(ws, 'N8', { f: 'L3*N3*O3*(K3^2*ACOS(I3/K3)-I3*SQRT(K3^2-I3^2))' })
  put(ws, 'O8', 'V2')
  put(ws, 'P8', { f: '(J3^2-K3^2)*L3*N3*O3*(ACOS(I3/J3)-ACOS(K3/J3))' })
  put(ws, 'K9', '(Vconst)')
  put(ws, 'L9', { f: 'N8+P8' })
  ;['m1', 'm2', 'm3', 'm4'].forEach((k, i) => {
    put(ws, `F${22 + i}`, k)
    put(ws, `G${22 + i}`, g.m[i])
  })

  const head = 27
  put(ws, `E${head}`, '平行圆半径 r')
  put(ws, `F${head}`, '2倍带宽内厚度/mm')
  put(ws, `G${head}`, '2倍带宽外厚度')
  put(ws, `H${head}`, '厚度')
  put(ws, `I${head}`, '循环数 I23')
  put(ws, `J${head}`, '组厚度')
  put(ws, `K${head}`, '封头缠绕角度')
  put(ws, `L${head}`, corrected ? '爆破压强（修正 cos²K）' : '爆破压强（Excel 原样）')
  grid.forEach((r, i) => {
    const row = head + 1 + i
    put(ws, `E${row}`, r)
    put(ws, `F${row}`, { f: `$G$22+$G$23*E${row}+$G$24*E${row}^2+$G$25*E${row}^3` })
    put(ws, `G${row}`, { f: `$L$3*$N$3*(ACOS($I$3/E${row})-ACOS(($I$3+$C$13)/E${row}))*$O$3/PI()` })
    put(ws, `I${row}`, g.cycles)
    const hExpr = `IF(E${row}<=$J$3,F${row},G${row})`
    put(ws, `H${row}`, {
      f: corrected ? `IF(E${row}<$I$3,0,${hExpr})` : `IF(E${row}<$I$3,0,MAX(0,${hExpr}))`,
    })
    put(ws, `J${row}`, { f: `H${row}*$I$${row}` })
    put(ws, `K${row}`, { f: `IF(E${row}<$I$3,0,ASIN($I$3/E${row})/PI()*180)` })
    const Lf = corrected
      ? `2*J${row}*$C$15/$C$3*COS(K${row}/180*PI())^2`
      : `2*J${row}*$C$15/$C$3*COS(K${row}/180*PI()*COS(K${row}/180*PI()))`
    put(ws, `L${row}`, { f: `IF(E${row}<$I$3,0,${Lf})` })
  })
  ref(ws, head + grid.length, 16)
  widths(ws, [6, 34, 16, 8, 2, 14, 14, 14, 12, 14, 16, 22, 12, 10, 12, 12])
  return ws
}

function sheetName(g: DomeGroup) {
  return `封头-${g.angle}°`
}

function totalsSheet(input: DesignInput, res: CheckResult, kind: 't' | 'p'): WS {
  const ws: WS = {}
  const groups = res.dome.groups
  const rows = res.dome.profile.length
  const grid = headGrid(res.dome.rFirst, input.geometry.R)
  put(ws, 'A1', '平行圆半径 r')
  put(ws, 'B1', kind === 't' ? '总厚度' : '总爆破压强')
  if (kind === 'p') put(ws, 'C1', `Ks=${input.requirement.ks}`)
  groups.forEach((g, i) => {
    const src = kind === 't' ? 'J' : 'L'
    put(ws, `${col(3 + i)}1`, `${g.angle}° 组`)
    for (let r = 0; r < grid.length; r++) {
    const row = 2 + r
    put(ws, `${col(3 + i)}${row}`, { f: `'${sheetName(g)}'!${src}${row + 26}` })
  }
  })
  const first = col(3) // 各组占 D 起
  const last = col(3 + groups.length - 1)
  for (let r = 0; r < grid.length; r++) {
    const row = 2 + r
    put(ws, `A${row}`, { f: `'${sheetName(groups[0])}'!E${row + 26}` })
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
  line('复合材料气瓶缠绕铺层设计系统 — 设计方案汇总', '')
  line('导出时间', new Date().toLocaleString('zh-CN'))
  line('计算口径', input.refMode === 'corrected' ? '修正版 cos²α' : 'Excel 原样复算 cos(u·cos u)')
  line('')
  line('【设计条件】')
  line('筒身段半径 R (mm)', input.geometry.R)
  line('缠绕极孔半径 r₀ (mm)', d.r0)
  line('设计爆破压强 pb (MPa)', d.pb)
  line('应力平衡系数 ks', input.requirement.ks)
  line('判定窗口 r ∈ [r_boss, R] (mm)', `${effectiveRBoss(input).toFixed(2)} ~ ${input.geometry.R}`)
  line('  r_boss 取法', input.constraint.rBossAuto ? 'auto = 全铺层覆盖起点 max(r0g)' : '手动指定')
  line('')
  line('【材料 / 工艺】')
  line('纤维单层厚 tf (mm)', d.tf)
  line('复材单层厚 tc (mm)', d.tc)
  line('总带宽 b_tot (mm)', d.bandTotal)
  line('σ发挥 螺旋 / 环向 (MPa)', `${d.sigmaSpiral.toFixed(1)} / ${d.sigmaHoop.toFixed(1)}`)
  line('σc 复材层强度 (MPa)', d.sigmaComposite.toFixed(1))
  line('')
  line('【铺层方案（表序 = 缠绕先后）】')
  input.plan.spiral.forEach((g, i) => line(`  第${i + 1}组 ${g.angle}°`, `${g.layers} 层（±成对）`))
  line('  环向 90°', `${input.plan.hoop} 层`)
  line('')
  line('【筒身校核】')
  line('纵向爆压 pα (MPa)', Number(c.pa.toFixed(4)))
  line('环向爆压 pθ (MPa)', Number(c.pth.toFixed(4)))
  line('判定', `${c.paPass ? 'pα ✓' : 'pα ✗'}　${c.pthPass ? 'pθ ✓' : 'pθ ✗'}`)
  line('螺旋层厚 / 环向层厚 / 总厚 (mm)', `${c.spiralThickness.toFixed(4)} / ${c.hoopThickness.toFixed(4)} / ${c.totalThickness.toFixed(4)}`)
  line('')
  line('【封头校核】')
  line('判定窗口内最小 ks·Σp (MPa)', Number(dm.minP.toFixed(4)))
  line('  位置 r (mm)', Number(dm.minPR.toFixed(2)))
  line('r=R 处 ks·Σp (MPa)', Number((dm.profile[dm.profile.length - 1]?.pTotal ?? 0).toFixed(4)))
  line('极孔侧参考最小值（判据奇异区，不计入）', Number(dm.minPAll.toFixed(4)))
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

function notesSheet(input: DesignInput): WS {
  const ws: WS = {}
  const notes = [
    ['本文件与原课程 Excel 的差异', ''],
    ['1', '封头 L 列（局部爆破压强）：原表公式 COS(K*PI()/180*COS(K*PI()/180)) 少一个右括号，应为 cos²K。'],
    ['', `当前导出文件使用：${input.refMode === 'corrected' ? '修正版 cos²K' : 'Excel 原样 cos(u·cos u)（仅用于对账）'}`],
    ['', '原表笔误使封头中段爆压系统性虚高（课程案例最大 +86 MPa @ r≈81）。'],
    ['2', '封头 H 列（厚度）：原表由作者手工在 r≤r2b 用样条、r>r2b 用覆盖公式；本文件写成 IF(E<=r2b, 样条, 覆盖) 公式。'],
    ['3', 'r<r0 区段：原表靠手工留空/置 0（样条外插会出负值）；本文件用 IF 守卫，不再产生 #NUM!。'],
    ['4', 'm1..m4：原表 G17 为矩阵求逆数组公式；本文件写数值，并在 B16:H21 给出四条件方程组系数与右端项供复核。'],
    ['5', '层数初估取整：原表手工写"14层/24层"（一个舍一个入）；本文件统一 ROUNDUP 向上取整。'],
    ['6', 'π：原表多处用 3.1415926 硬编码，本文件用 PI()，相对差 8.4e-8。'],
    ['7', '发挥强度：模式 A 自算 2390/0.6×0.85=3385.83；原表 C11 取整为 3385，差 0.025%。'],
    ['8', '判定窗口：封头最小爆压只在 [r_boss, R] 内取，r_boss 默认 = 全铺层覆盖起点 max(r0g)，只用铺层自身的量。'],
    ['', '窗口以下的极孔区段只有部分角度组铺到、局部角趋于 90°，cos²α 判据在该处趋于 0，属判据奇异区，只列示不判定。'],
    ['9', '环向层（90°）不参与封头校核：环向纤维上不了封头。'],
    ['10', '本文件所有结果单元格均为活公式，改参数区（A1:D15）会自动重算。'],
  ]
  notes.forEach(([a, b], i) => {
    put(ws, `A${i + 1}`, a)
    put(ws, `B${i + 1}`, b)
  })
  ref(ws, notes.length, 2)
  widths(ws, [8, 110])
  return ws
}

// ── 入口 ────────────────────────────────────────────────────────────────────

export function exportWorkbook(input: DesignInput, res: CheckResult) {
  if (!res.dome.groups.length) throw new Error('没有可用的螺旋角度组，无法导出封头表')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, summarySheet(input, res), '方案汇总')
  XLSX.utils.book_append_sheet(wb, cylinderSheet(input, res), '筒身强度设计与计算')
  const grid = headGrid(res.dome.rFirst, input.geometry.R)
  res.dome.groups.forEach((g) => XLSX.utils.book_append_sheet(wb, domeSheet(input, res, g, grid), sheetName(g)))
  XLSX.utils.book_append_sheet(wb, totalsSheet(input, res, 't'), '封头总厚度')
  XLSX.utils.book_append_sheet(wb, totalsSheet(input, res, 'p'), '封头总爆破压强')
  XLSX.utils.book_append_sheet(wb, notesSheet(input), '说明')
  const name = `铺层校核报告-R${input.geometry.R}-pb${res.derived.pb.toFixed(0)}-${input.refMode === 'corrected' ? '修正cos2' : 'Excel原样'}.xlsx`
  XLSX.writeFile(wb, name)
  return name
}

/** 供测试：只生成 workbook 不下载 */
export function buildWorkbook(input: DesignInput, res: CheckResult) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, summarySheet(input, res), '方案汇总')
  XLSX.utils.book_append_sheet(wb, cylinderSheet(input, res), '筒身强度设计与计算')
  const grid = headGrid(res.dome.rFirst, input.geometry.R)
  res.dome.groups.forEach((g) => XLSX.utils.book_append_sheet(wb, domeSheet(input, res, g, grid), sheetName(g)))
  XLSX.utils.book_append_sheet(wb, totalsSheet(input, res, 't'), '封头总厚度')
  XLSX.utils.book_append_sheet(wb, totalsSheet(input, res, 'p'), '封头总爆破压强')
  XLSX.utils.book_append_sheet(wb, notesSheet(input), '说明')
  return wb
}
