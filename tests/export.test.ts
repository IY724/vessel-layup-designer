import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { buildWorkbook, workbookBytes } from '../src/export/excel'
import { compareCourse, courseReference } from '../src/export/courseComparison'
import { FORMULAS } from '../src/core/excelRef'
import images from '../src/export/formulaImages.json'
import { runCheck } from '../src/core/checker'
import { courseInput } from '../src/core/presets'
import { initialDesign } from '../src/core/initialDesign'
import { expansionAngles } from '../src/core/expansion'
import { lambdaFromDepth, windingTurns } from '../src/core/geometry'

const input=courseInput(),res=runCheck(input),raw=buildWorkbook(input,res)

describe('课件原表逐格核对',()=>{
  it('5990 个基准值保留，平方项与独立修正基准一致',()=>{
    const cells=compareCourse(raw)
    expect(cells).toHaveLength(5990)
    expect(cells.filter(c=>!c.pass)).toEqual([])
    expect(cells.every(c=>c.actual!==null)).toBe(true)
    expect(cells.filter(c=>c.corrected).length).toBeGreaterThan(0)
    expect(cells.filter(c=>!c.corrected).every(c=>Math.abs(c.actual!-c.reference)<=1e-8*Math.max(1,Math.abs(c.reference)))).toBe(true)
  })
  it('参考数据包含原始文件身份和六个完整角度组',()=>{
    expect(courseReference.map(b=>b.sha256)).toEqual(['da3fd24dda889d8392c314d6e382cfb91761f86cde1694f214ca582517ecf1bf','196a4c488dbb7992469c9179922e64e45e33002b029e9012b490524a80414218'])
    expect(courseReference[1].sheets.map(s=>s.name)).toEqual(['10','17','25','37','40','45','总厚度','总爆破压强'])
  })
  it('原表手选层数与小数估算分别保留',()=>{
    const s=raw.Sheets['筒身强度设计与计算']
    expect(s.B27.f).toBe('B20/C8');expect(s.B29.f).toBe('B24/C8')
    expect(s.B27.v).toBeCloseTo(14.247551987639529,10)
    expect(s.C27.v).toBe(14);expect(s.C29.v).toBe(24)
  })
  it('保留两种 π 写法，局部余弦项采用平方',()=>{
    expect(raw.Sheets['筒身强度设计与计算'].I3.f).toBe('H3/180*3.1415926')
    const g=raw.Sheets['封头-10°']
    expect(g.G3.f).toBe('F3/180*PI()');expect(g.L3.f).toBe('2*3.1415926*C3/C13*H3')
    expect(g.L23.f).toContain('COS(K23/180*PI())^2')
    expect(g.L23.v).toBeCloseTo(.055914150152195294/.75,9)
  })
  it('恢复矩阵、逆矩阵和活系数，未用快照代替求解',()=>{
    const s=raw.Sheets['封头-10°']
    expect(s.F5.v).toBe(1);expect(s.I8.f).toContain('2/5*3.1415926')
    expect(s.K7.f).toContain('L3*N3*O3/3.1415926')
    expect(s.F11.f).toBe('INDEX(MINVERSE($F$5:$I$8),1,1)')
    expect(s.G17.f).toBe('SUM(F11*K5,G11*K6,H11*K7,I11*K8)')
    expect(s.G17.v).toBeCloseTo(-30.982067890136932,9)
    expect(s.K8.v).toBeCloseTo(32264.720667658996,7)
  })
  it('原表 144 点完整保留，包括 45° 在 163 mm 处的人工分段',()=>{
    expect(res.dome.profile).toHaveLength(144)
    expect(res.dome.profile.slice(0,3).map(p=>p.r)).toEqual([30.2,32,33])
    const g=raw.Sheets['封头-45°']
    expect(g.N17.v).toBe(163);expect(g.E155.v).toBe(163)
    expect(g.J155.v).toBeCloseTo(.8026657566009021,9)
    expect(raw.Sheets['封头总厚度'].B134.v).toBeCloseTo(6.327747184325943,9)
    expect(raw.Sheets['封头总爆破压强'].C134.v).toBeCloseTo(83.69683882583904,8)
  })
})

describe('实际导出文件',()=>{
  it('公开计算书逐角度齐全，仅包含计算结果与公式',async()=>{
    const bytes=await workbookBytes(input,res),book=new ExcelJS.Workbook()
    await book.xlsx.load(bytes as never)
    expect(book.worksheets).toHaveLength(16)
    expect(book.getWorksheet('说明')).toBeUndefined()
    expect(book.worksheets.every(s=>s.state==='visible')).toBe(true)
    expect(book.worksheets.map(s=>s.name)).toEqual(['工况与气瓶参数','线型切点设计','铺层角度计算','铺层方案','筒身强度设计与计算','封头-10°','封头-17°','封头-25°','封头-37°','封头-40°','封头-45°','封头总厚度','封头总爆破压强','厚度分布','爆压分布','公式说明'])
    expect(book.worksheets.filter(s=>s.name.startsWith('封头-')).map(s=>s.name)).toEqual(['封头-10°','封头-17°','封头-25°','封头-37°','封头-40°','封头-45°'])
    const saved=XLSX.read(bytes,{type:'array'})
    expect(saved.SheetNames).not.toContain('原版对比')
    expect(saved.Sheets['工况与气瓶参数'].B8.v).toBeCloseTo(102.09988121282991,9)
    expect(saved.Sheets['工况与气瓶参数'].B9.v).toBeCloseTo(95.60087591615947,9)
    expect(saved.Sheets['工况与气瓶参数'].B10.v).toBeCloseTo(76.57491090962243,9)
    expect(saved.Sheets['工况与气瓶参数'].B11.v).toBeCloseTo(.055914150152195294,9)
    expect(saved.Sheets['封头总厚度'].A148.v).toBe(173.5)
    expect(saved.Sheets['封头总爆破压强'].C148.v).toBeCloseTo(79.38986572678792,9)
    for(const n of saved.SheetNames)for(const [a,c]of Object.entries(saved.Sheets[n])){
      expect(c.t,`${n}!${a}`).not.toBe('e')
      if(c.t==='s')expect(String(c.v)).not.toMatch(/一组一行|先看|再看|阅读顺序|取消隐藏|教你|原版|原表|修正|差异对比|核对通过/)
    }
    const angle=book.getWorksheet('封头-10°')!
    expect(angle.getCell('A2').value).toBe('10° 螺旋铺层校验')
    expect(angle.getCell('A30').formula).toBe('INDEX(MINVERSE($A$23:$D$26),1,1)')
    expect(angle.getCell('G30').formula).toBe('SUM(A30*E23,B30*E24,C30*E25,D30*E26)')
    expect(angle.getCell('H41').formula).toContain('COS(G41/180*PI())^2')
    expect(angle.getCell('A40').value).toBe('平行圆半径\nmm')
    expect(angle.getCell('G40').value).toBe('封头缠绕角度 K\n°')
    expect(angle.getCell('H40').value).toBe('爆破压强\nMPa')
    expect(angle.views[0].showGridLines).toBe(true)
    expect(angle.pageSetup.printTitlesRow).toBe('40:40')
    expect(angle.getCell('C6').fill).toMatchObject({fgColor:{argb:'FFF3D4'}})
    expect(book.getWorksheet('公式说明')!.getImages()).toHaveLength(FORMULAS.length)
    const zip=XLSX.CFB.read(bytes,{type:'array'})
    const charts=zip.FullPaths.filter((p:string)=>/charts\/chart\d+\.xml$/.test(p))
    expect(charts).toHaveLength(3)
    const xml=charts.map((p:string)=>new TextDecoder().decode(XLSX.CFB.find(zip,p)!.content as Uint8Array)).join('')
    expect(xml).toContain('<c:barChart>');expect(xml).toContain('<c:scatterChart>');expect(xml).not.toContain('externalData');expect(xml).not.toContain('<c:smooth val="1"')
  })
  it('数学表达式与网站一致，图片可离线读取',()=>{
    expect(images.map(i=>i.tex)).toEqual(FORMULAS.map(i=>i.formula))
    for(const i of images)expect(Buffer.from(i.base64,'base64').subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a')
  })
  it('厚度/爆压分布表逐点与内核一致',async()=>{
    const saved=XLSX.read(await workbookBytes(input,res),{type:'array'})
    const t=saved.Sheets['厚度分布'],p=saved.Sheets['爆压分布']
    res.dome.profile.forEach((pt,i)=>{
      const row=i+5
      expect(Number(t[`B${row}`].v),`厚度 r=${pt.r}`).toBeCloseTo(pt.tTotal,9)
      expect(Number(p[`B${row}`].v),`爆压 r=${pt.r}`).toBeCloseTo(pt.pTotal,9)
      expect(Number(p[`C${row}`].v)).toBeCloseTo(res.derived.pb,9)
    })
  })
  it('线型切点与铺层角度计算表就位，活公式与内核一致',async()=>{
    const bytes=await workbookBytes(input,res),book=new ExcelJS.Workbook()
    await book.xlsx.load(bytes as never)
    expect(book.getWorksheet('工况与气瓶参数')!.getCell('A21').value).toBe('设计指标与工况')
    const line=book.getWorksheet('线型切点设计')!
    expect(line.getCell('C15').formula).toBe('ASIN(B9/B7)/PI()*180')
    expect(line.getCell('C15').result as number).toBeCloseTo(Math.asin(res.derived.r0/input.geometry.R)*180/Math.PI,9)
    const vp={R_in:input.geometry.R,l:input.geometry.cylLength,lambda:lambdaFromDepth(input.geometry.R,input.geometry.headShortAxis),r0:res.derived.r0,Kf:0.8}
    expect(line.getCell('C19').formula).toBe('2*C18')
    expect(line.getCell('C19').result as number).toBeCloseTo(windingTurns(vp).roundTrip,9)
    const calc=book.getWorksheet('铺层角度计算')!
    expect(calc.getCell('C17').value).toBe(input.constraint.alphaRef)
    expect(calc.getCell('C24').formula).toBe('CEILING(C22,2)')
    const initial=initialDesign(input)
    expect(calc.getCell('C24').result).toBe(initial.spiral)
    expect(calc.getCell('C25').result).toBe(initial.hoop)
    const cands=expansionAngles(input.geometry.R,res.derived.r0,res.derived.bandTotal)
    expect(calc.getCell('B31').result as number).toBeCloseTo(cands[0].diameter,9)
    expect(calc.getCell('C31').result as number).toBeCloseTo(cands[0].angle,9)
    // 表2-1 原表插图：静态 PNG，Node 与浏览器导出都应带上（Node 下切线图为 SVG 栅格化，跳过）
    expect(line.getImages()).toHaveLength(1)
    // 图下不加注释（用户明确此类注解都不要）
    let hasNote=false
    line.eachRow((row)=>row.eachCell((cell)=>{if(typeof cell.value==='string'&&cell.value.includes('长径比经验区间'))hasNote=true}))
    expect(hasNote).toBe(false)
  })
  it('单角度、重复角度、停用组、十二个角度组可导出',async()=>{
    for(const spiral of [[{angle:10,layers:4}],[{angle:10,layers:4},{angle:10,layers:2},{angle:40,layers:4,active:false}],Array.from({length:12},(_,i)=>({angle:10+i*3,layers:2}))]){
      const data={...input,plan:{spiral,hoop:20}},result=runCheck(data),book=new ExcelJS.Workbook()
      await book.xlsx.load(await workbookBytes(data,result) as never)
      expect(book.worksheets.filter(s=>s.name.startsWith('封头-'))).toHaveLength(result.dome.groups.length)
      expect(book.getWorksheet('工况与气瓶参数')!.getCell('B16').result).toBeGreaterThan(0)
      expect(book.getWorksheet('原版对比')).toBeUndefined()
    }
  },15000)
  it('没有螺旋组时明确报错',async()=>{
    const data={...input,plan:{spiral:[],hoop:20}}
    await expect(workbookBytes(data,runCheck(data))).rejects.toThrow('没有可用的螺旋角度组')
  })
})
