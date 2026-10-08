/**
 * export.test.ts — Excel 复刻导出的结构与公式校验
 *
 * 导出的是「活公式」，Excel 打开才重算，所以这里校验三件事：
 *   ① sheet 齐、地址与原表语义对齐；② 跨表求和的行偏移正确（最容易错的地方）；
 *   ③ 口径开关确实换公式。数值正确性由 baseline.test.ts 在 core 层保证。
 */
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { buildWorkbook } from '../src/export/excel'
import { runCheck } from '../src/core/checker'
import { courseCase } from '../src/core/presets'

const input = courseCase()
const res = runCheck(input)
const wb = buildWorkbook(input, res)
const g10 = res.dome.groups.find((g) => g.angle === 10)!

describe('工作簿结构', () => {
  it('包含汇总、筒身、6 个角度组、总厚度、总爆破压强、说明', () => {
    expect(wb.SheetNames).toEqual([
      '方案汇总',
      '筒身强度设计与计算',
      '封头-10°',
      '封头-17°',
      '封头-25°',
      '封头-37°',
      '封头-40°',
      '封头-45°',
      '封头总厚度',
      '封头总爆破压强',
      '说明',
    ])
  })
  it('能写出并读回（文件未损坏）', () => {
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const back = XLSX.read(buf, { type: 'array' })
    expect(back.SheetNames.length).toBe(wb.SheetNames.length)
    expect(buf.byteLength).toBeGreaterThan(10000)
  })
})

describe('筒身表：地址与公式与原表一致', () => {
  const ws = wb.Sheets['筒身强度设计与计算']
  it('参数区 C3=R、C8/C9 为派生公式', () => {
    expect(ws['C3'].v).toBe(173.5)
    expect(ws['C8'].f).toBe('C7/C6/C4')
    expect(ws['C9'].f).toBe('C8/C5')
    expect(ws['C10'].v).toBe(90)
    expect(ws['C11'].v).toBe(3385)
    expect(ws['C13'].f).toBe('C4*C12')
    expect(ws['C15'].f).toBe('C11*C5')
  })
  it('角度块 6 行 + 环向行，层数与铺层表一致', () => {
    expect(ws['H3'].v).toBe(10)
    expect(ws['L3'].v).toBe(4)
    expect(ws['H8'].v).toBe(45)
    expect(ws['L8'].v).toBe(2)
    expect(ws['J3'].f).toBe('COS(I3)*COS(I3)')
  })
  it('合计 pα / pθ 用 SUM 公式跨行累加', () => {
    // 与原表同行号：合计在 I26/J26，厚度在 I30/J30/K30
    expect(ws['I26']?.f).toBe('SUM(K12:K17)')
    expect(ws['J26']?.f).toBe('SUM(L12:L17,L22)')
    expect(ws['I30']?.f).toBe('SUM(L3:L8)*C9')
    expect(ws['K30']?.f).toBe('I30+J30')
  })
  it('初估块用 ROUNDUP（软件规则，原表是手工取整）', () => {
    expect(ws['B20']?.f).toBe('(C3*C10)/(2*C11*B17*B17)')
    expect(ws['B24']?.f).toBe('(2-B18*B18)*C3*C10/(2*C11)')
    expect(ws['B27']?.f).toBe('ROUNDUP(B20/C8,0)')
  })
})

describe('封头表：样条、覆盖、口径开关', () => {
  const ws = wb.Sheets['封头-10°']
  it('极孔/带宽/mR 公式与参数区一致', () => {
    expect(ws['I3'].f).toBe('SIN(G3)*$C$3')
    expect(ws['J3'].f).toBe('I3+$C$13*2')
    expect(ws['K3'].f).toBe('I3+$C$13')
    expect(ws['L3'].f).toBe('2*PI()*C3/C13*H3')
    expect(ws['P3'].f).toBe('2*N3*O3')
  })
  it('m1..m4 写的是 core 解出来的数值', () => {
    expect(ws['G22'].v).toBeCloseTo(g10.m[0], 9)
    expect(ws['G23'].v).toBeCloseTo(g10.m[1], 9)
    expect(ws['G24'].v).toBeCloseTo(g10.m[2], 11)
    expect(ws['G25'].v).toBeCloseTo(g10.m[3], 14)
  })
  it('体积守恒 V1/V2 与方程组右端项都在表里', () => {
    expect(ws['N8'].f).toContain('ACOS(I3/K3)')
    expect(ws['P8'].f).toContain('(J3^2-K3^2)')
    expect(ws['L9'].f).toBe('N8+P8')
    expect(ws['H20'].f).toBe('M9+O9')
  })
  it('样条/覆盖/守卫公式逐行带正确行号', () => {
    expect(ws['E28'].v).toBeCloseTo(res.dome.rFirst + 0.072, 1)
    expect(ws['F28'].f).toBe('$G$22+$G$23*E28+$G$24*E28^2+$G$25*E28^3')
    expect(ws['G28'].f).toContain('ACOS($I$3/E28)')
    expect(ws['H28'].f).toBe('IF(E28<$I$3,0,IF(E28<=$J$3,F28,G28))')
    expect(ws['J28'].f).toBe('H28*$I$28')
    expect(ws['I28'].v).toBe(g10.cycles)
    expect(ws['L28'].f).toBe('IF(E28<$I$3,0,2*J28*$C$15/$C$3*COS(K28/180*PI())^2)')
  })
  it('切到「Excel 原样」时 L 列写回笔误式', () => {
    const raw = buildWorkbook({ ...input, refMode: 'excel' }, runCheck({ ...input, refMode: 'excel' }))
    const w2 = raw.Sheets['封头-10°']
    expect(w2['L28'].f).toContain('COS(K28/180*PI()*COS(K28/180*PI()))')
    expect(w2['H28'].f).toContain('MAX(0,')
  })
})

describe('跨表汇总：行偏移必须对齐（最易错处）', () => {
  const t = wb.Sheets['封头总厚度']
  const p = wb.Sheets['封头总爆破压强']
  it('r 取最低角 sheet 的 E 列，首行指向 E28', () => {
    expect(t['A2'].f).toBe(`'封头-10°'!E28`)
    expect(p['A2'].f).toBe(`'封头-10°'!E28`)
  })
  it('总厚度 = 六个 sheet 的 J 列同行相加', () => {
    expect(t['B2'].f).toBe('SUM(D2:I2)')
    expect(t['D2'].f).toBe(`'封头-10°'!J28`)
    expect(t['I2'].f).toBe(`'封头-45°'!J28`)
  })
  it('总爆破压强 = L 列相加，再乘 ks', () => {
    expect(p['D2'].f).toBe(`'封头-10°'!L28`)
    expect(p['B2'].f).toBe('SUM(D2:I2)')
    expect(p['C2'].f).toBe('B2*0.75')
  })
  it('末行落在 r=R（145 点网格：30.2 起步、逐 1 mm、末尾补 R），求和覆盖 D~I 六组', () => {
    const last = Number(t['!ref']!.split(':')[1].replace(/\D/g, ''))
    expect(last).toBe(146)
    expect(t[`A${last}`]).toBeTruthy()
    expect(t[`B${last}`].f).toBe(`SUM(D${last}:I${last})`)
    // 末行 r 必须正好是 R：跨表行号对齐后，最后一行就是各 sheet 共用的 R 行
    const dome = wb.Sheets['封头-10°']
    const domeLast = Number(dome['!ref']!.split(':')[1].replace(/\D/g, ''))
    expect(domeLast).toBe(last + 26)
    expect(dome[`E${domeLast}`].v).toBe(173.5)
  })
})

describe('汇总与说明页', () => {
  it('汇总页写入了判定窗口口径（导出报告可追溯）', () => {
    const s = wb.Sheets['方案汇总']
    const cells = Object.keys(s)
      .filter((k) => k.startsWith('B'))
      .map((k) => String(s[k].v ?? ''))
    expect(cells.some((c) => c.includes('全铺层覆盖起点 max(r0g)'))).toBe(true)
    expect(cells.some((c) => c.includes('修正版 cos²α'))).toBe(true)
    expect(cells.some((c) => c.includes('待调整') || c.includes('满足'))).toBe(true)
  })
  it('说明页列出了与原表的差异', () => {
    const n = wb.Sheets['说明']
    const txt = Object.keys(n)
      .filter((k) => k.startsWith('B'))
      .map((k) => String(n[k].v ?? ''))
      .join(' ')
    expect(txt).toContain('少一个右括号')
    expect(txt).toContain('ROUNDUP')
    expect(txt).toContain('活公式')
  })
})
