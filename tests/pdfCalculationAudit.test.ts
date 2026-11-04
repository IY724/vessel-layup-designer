/** 独立代入公式、积分和四项边界条件，防止计算书与实际计算脱节。 */
import { describe, expect, it } from 'vitest'
import { defaultInput, excelBaselineInput } from '../src/core/presets'
import { runCheck } from '../src/core/checker'
import { initialDesign } from '../src/core/initialDesign'
import { buildReportModel } from '../src/export/reportModel'
import { CYLINDER_RAD, COURSE_PI } from '../src/core/course'
import ExcelJS from 'exceljs'
import { workbookBytes } from '../src/export/excel'

describe('计算书公式独立复算', () => {
  it('层厚推导同时满足轴向及环向薄膜力平衡，允许两类发挥强度不同', () => {
    for (const angle of [15,35,50]) for (const hoopStrength of [3000,2080/0.6]) {
      const input=defaultInput()
      input.constraint.alphaRef=angle
      input.strength.sigmaHoopDirect=hoopStrength
      const d=runCheck(input).derived, est=initialDesign(input).estimate
      const a=angle*CYLINDER_RAD, R=input.geometry.R
      const nz=d.sigmaSpiral*est.hSpiral*Math.cos(a)**2
      const nth=d.sigmaSpiral*est.hSpiral*Math.sin(a)**2+d.sigmaHoop*est.hHoop
      expect(nz).toBeCloseTo(d.pb*R/2,9)
      expect(nth).toBeCloseTo(d.pb*R,9)
      expect(nth/nz).toBeCloseTo(2,12)
    }
  })
  it('新增体积表达式与几何覆盖积分、所采用的体积约束一致', () => {
    const result=runCheck(defaultInput())
    for (const g of result.dome.groups) {
      const steps=2000, du=1/steps, band=g.rb-g.r0
      let integral=0
      for(let i=0;i<=steps;i++) {
        const u=i*du, r=g.r0+band*u*u
        const thickness=g.mR*g.nR*g.tp/COURSE_PI*Math.acos(Math.min(1,g.r0/r))
        const value=2*COURSE_PI*r*thickness*2*band*u
        integral+=(i===0||i===steps?1:i%2?4:2)*value
      }
      integral*=du/3
      expect(Math.abs(integral-g.V1)/g.V1).toBeLessThan(1e-9)
      const endpoint=g.mR*g.nR*g.tp/COURSE_PI*(Math.acos(g.r0/g.r2b)-Math.acos(g.rb/g.r2b))
      expect(g.V2).toBeCloseTo(COURSE_PI*(g.r2b**2-g.rb**2)*endpoint,7)
      const delta=(j:number)=>g.r2b**j-g.r0**j
      const [a,b,c,d]=g.m
      const volume=COURSE_PI*a*delta(2)+2*COURSE_PI/3*b*delta(3)+COURSE_PI/2*c*delta(4)+2*COURSE_PI/5*d*delta(5)
      expect(Math.abs(volume-g.Vconst)/g.Vconst).toBeLessThan(1e-8)
    }
  })
  it('Excel初算保留原式，环向用对应强度，扩孔递增使用总带宽', async () => {
    const input = defaultInput()
    input.strength.sigmaHoopDirect = 3000
    const result = runCheck(input), initial = initialDesign(input)
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await workbookBytes(input, result) as never)
    const sheet = book.getWorksheet('铺层角度计算')!
    expect(sheet.getCell('C20').formula).toBe('B6*B8/(2*B9*C18^2)')
    expect(sheet.getCell('C21').formula).toBe('(2-C19^2)*B6*B8/(2*F6)')
    expect(sheet.getCell('F6').value).toBe(3000)
    expect(sheet.getCell('C20').result).toBeCloseTo(initial.estimate.hSpiral, 12)
    expect(sheet.getCell('C21').result).toBeCloseTo(initial.estimate.hHoop, 12)
    expect(sheet.getCell('C24').result).toBe(20)
    expect(sheet.getCell('C25').result).toBe(40)
    expect(sheet.getCell('B32').formula).toBe('2*$B$7+1*$B$13')
    expect(sheet.getCell('B32').result).toBe(92)
  })
  it('NOL换算的损失系数作用于发挥强度及全部校核，没有单独叠加初算折减', () => {
    const input = defaultInput()
    input.strength.mode = 'A'
    input.strength.sigmaNOL = 2080
    input.strength.kLoss = 1
    const before = runCheck(input), initial = initialDesign(input)
    for (const coefficient of [0.85, 0.7]) {
      input.strength.kLoss = coefficient
      const after = runCheck(input), reduced = initialDesign(input)
      expect(after.derived.sigmaSpiral).toBeCloseTo(before.derived.sigmaSpiral * coefficient, 10)
      expect(after.derived.sigmaHoop).toBeCloseTo(before.derived.sigmaHoop * coefficient, 10)
      expect(after.derived.sigmaComposite).toBeCloseTo(before.derived.sigmaComposite * coefficient, 10)
      expect(after.cylinder.pa).toBeCloseTo(before.cylinder.pa * coefficient, 10)
      expect(after.cylinder.pth).toBeCloseTo(before.cylinder.pth * coefficient, 10)
      expect(after.head.pressure).toBeCloseTo(before.head.pressure * coefficient, 10)
      expect(reduced.estimate.hSpiral).toBeCloseTo(initial.estimate.hSpiral / coefficient, 10)
      expect(reduced.estimate.hHoop).toBeCloseTo(initial.estimate.hHoop / coefficient, 10)
    }
  })
  it('修改几何折减系数后，Excel 也保留实际系数且候选尺寸满足目标容积', async () => {
    const input = defaultInput()
    input.geometry.headVolumeFactor = 0.65
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await workbookBytes(input, runCheck(input)) as never)
    const sheet = book.getWorksheet('线型切点设计')!
    expect(sheet.getCell('B11').value).toBe(0.65)
    expect(sheet.getCell('B7').value).toBe(140)
    expect(sheet.getCell('F6').value).toBe(5)
    expect(sheet.getCell('F7').result).toBe(135)
    expect(sheet.getCell('F8').result).toBe(65)
    expect(sheet.getCell('F9').result).toBeCloseTo((Math.PI*135**2*1282+4*Math.PI/3*.65*135**2*65)/1e6,12)
    const radius = Number(sheet.getCell('B23').value) / 2
    const length = Number(sheet.getCell('C23').value)
    const volume = (Math.PI*(radius-5)**2*length + 4*Math.PI/3*0.65*(radius-5)**2*(radius/2-5))/1e6
    // 候选表已按0.01 mm直径与0.1 mm长度显示，允许显示取整的容积差。
    expect(Math.abs(volume-input.geometry.volumeL)).toBeLessThan(0.02)
  })
  for (const [name, preset] of [['朱宁基础默认', defaultInput], ['课程基准', excelBaselineInput]] as const) {
    it(`${name}：材料链、初算层数、逐组双向承载与经验封头承载`, () => {
      const input = preset(), result = runCheck(input), initial = initialDesign(input)
      const { geometry: g, material: m, strength: s } = input
      const tf = m.tex / (m.fiberDensity * m.bandWidth), tc = tf / m.vf
      const sigmaSp = s.mode === 'A' ? s.sigmaNOL / m.vf * s.kLoss : s.sigmaSpiralDirect
      const sigmaHp = s.mode === 'A' ? sigmaSp : s.sigmaHoopDirect
      expect(result.derived.tf).toBeCloseTo(tf, 12)
      expect(result.derived.tc).toBeCloseTo(tc, 12)
      const angle = input.constraint.alphaRef * CYLINDER_RAD
      const hs = g.R * result.derived.pb / (2 * sigmaSp * Math.cos(angle) ** 2)
      const hh = (2 - Math.tan(angle) ** 2) * g.R * result.derived.pb / (2 * sigmaHp)
      expect(initial.spiral).toBe(2 * Math.ceil(hs / tf / 2))
      expect(initial.hoop).toBe(Math.ceil(hh / tf))
      let pa = 0, pth = 0, ps = 0, thickness = 0
      for (const row of result.cylinder.rows) {
        const a = row.angle * CYLINDER_RAD, sigma = row.type === 'spiral' ? sigmaSp : sigmaHp
        const pz = row.angle === 90 ? 0 : 2 * row.layers * tf * sigma * Math.cos(a) ** 2 / g.R
        const pt = row.angle === 90 ? row.layers * tf * sigma / g.R : row.layers * tf * sigma * Math.sin(a) ** 2 / g.R
        expect(row.paSum).toBeCloseTo(pz, 10)
        expect(row.pthSum).toBeCloseTo(pt, 10)
        pa += pz; pth += pt; thickness += row.layers * tc
        if (row.type === 'spiral') ps += pz
      }
      expect(result.cylinder.pa).toBeCloseTo(pa, 10)
      expect(result.cylinder.pth).toBeCloseTo(pth, 10)
      expect(result.cylinder.totalThickness).toBeCloseTo(thickness, 12)
      expect(result.head.pressure).toBeCloseTo(input.requirement.ks * ps, 10)
    })

    it(`${name}：每个角度的样条四个约束、系数精度、逐半径厚度和局部爆压`, () => {
      const input = preset(), result = runCheck(input)
      const model = buildReportModel(input, result)
      const table = model.blocks.find(b => b.kind === 'table' && b.caption.startsWith('表 11 '))
      expect(table?.kind).toBe('table')
      result.dome.groups.forEach((g, index) => {
        const [a,b,c,d] = g.m
        const poly = (r: number) => a+b*r+c*r*r+d*r**3
        const derivative = (r: number) => b+2*c*r+3*d*r*r
        const factor = g.mR * g.nR * g.tp / COURSE_PI
        const coverage = (r: number) => factor * (Math.acos(g.r0/r)-Math.acos(g.rb/r))
        const slope = factor * (g.r0/(g.r2b*Math.sqrt(g.r2b**2-g.r0**2))-g.rb/(g.r2b*Math.sqrt(g.r2b**2-g.rb**2)))
        expect(poly(g.r0)).toBeCloseTo(g.tp*g.nR, 7)
        expect(poly(g.r2b)).toBeCloseTo(coverage(g.r2b), 7)
        expect(derivative(g.r2b)).toBeCloseTo(slope, 8)
        // Simpson 数值积分与直接多项式线性方程求解相互独立。
        const steps = 100, dx = (g.r2b-g.r0)/steps
        let integral = 0
        for (let i=0;i<=steps;i++) {
          const r=g.r0+i*dx, weight=i===0||i===steps?1:i%2?4:2
          integral += weight*2*COURSE_PI*r*poly(r)
        }
        integral *= dx/3
        expect(Math.abs(integral-g.Vconst)/g.Vconst).toBeLessThan(1e-8)
        const printed = table?.kind === 'table' ? table.rows[index].slice(1).map(Number) : []
        for (const point of result.dome.profile) {
          const r=point.r
          const raw = r<=g.splineEndRadius ? poly(r) : coverage(r)
          const thickness = Math.max(0, raw)*g.layers/2
          expect(point.tGroups[index]).toBeCloseTo(thickness, 8)
          // 计算书显示的系数应足以重算到三位小数厚度，不受多项式消减影响。
          if (r<=g.splineEndRadius) {
            const t=(printed[0]+printed[1]*r+printed[2]*r*r+printed[3]*r**3)*g.layers/2
            expect(Math.abs(Math.max(0,t)-thickness)).toBeLessThan(0.0001)
          }
          const local = r<g.r0 ? 0 : 2*thickness*result.derived.sigmaComposite/input.geometry.R*Math.cos(Math.asin(Math.min(1,g.r0/r))/COURSE_PI*Math.PI)**2
          expect(point.pGroups[index]).toBeCloseTo(local, 8)
        }
      })
      for (const point of result.dome.profile) {
        expect(point.tTotal).toBeCloseTo(point.tGroups.reduce((s,v)=>s+v,0), 10)
        expect(point.pTotal).toBeCloseTo(input.requirement.ks*point.pGroups.reduce((s,v)=>s+v,0), 9)
      }
    })
  }
})
