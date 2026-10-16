import ExcelJS from 'exceljs'
import { CFB, utils, type WorkBook } from 'xlsx'
import type { CheckResult, DesignInput } from '../core/types'
import { activeGroups, layupGroups } from '../core/layup'
import { initialDesign } from '../core/initialDesign'
import { expansionAngles } from '../core/expansion'
import { allowedLineTypes, computeVolume, intersectLineTypes, lambdaFromDepth, windingTurns, type VolumeParams } from '../core/geometry'
import images from './formulaImages.json'
import { addNativeCharts, type NativeChart } from './nativeCharts'
import { domeContourFigure, lineTypeFigure } from './figures'

type Sheet = ExcelJS.Worksheet
type AddressMap = Record<string,string>
const C={ink:'24384C',muted:'65768A',blue:'335E87',pale:'F3F6FA',line:'DCE3EB',input:'FFF3D4',calc:'EDF3FA',red:'FCEAEA',white:'FFFFFF'}
const fill=(color:string):ExcelJS.Fill=>({type:'pattern',pattern:'solid',fgColor:{argb:color}})
const live=(formula:string,result:number|string):ExcelJS.CellFormulaValue=>({formula,result})
const col=(n:number)=>utils.encode_col(n-1)
function base(ws:Sheet,widths:number[],freeze=4){
  widths.forEach((v,i)=>ws.getColumn(i+1).width=v);ws.properties.defaultRowHeight=25
  ws.properties.tabColor={argb:C.blue};ws.views=[{state:'frozen',ySplit:freeze,showGridLines:true,zoomScale:90}]
  ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.3,right:.3,top:.4,bottom:.4,header:.15,footer:.15}}
  ws.headerFooter.oddFooter='&L气瓶铺层计算书&C&A&R&P / &N'
}
function text(ws:Sheet,range:string,value:string,size=11,bold=false){
  if(range.includes(':'))ws.mergeCells(range)
  const cell=ws.getCell(range.split(':')[0]);cell.value=value
  cell.font={name:'微软雅黑',size,bold,color:{argb:C.ink}};cell.alignment={vertical:'middle',horizontal:'left',wrapText:true}
}
function title(ws:Sheet,value:string,end='H'){
  text(ws,`A2:${end}2`,value,19,true);ws.getRow(2).height=36
  for(let c=1;c<=ws.getColumn(end).number;c++)ws.getCell(2,c).border={bottom:{style:'medium',color:{argb:C.blue}}}
}
function section(ws:Sheet,row:number,value:string,start='A',end='H'){
  text(ws,`${start}${row}:${end}${row}`,value,11,true);ws.getRow(row).height=28
  for(let c=ws.getColumn(start).number;c<=ws.getColumn(end).number;c++)ws.getCell(row,c).fill=fill(C.pale)
}
function table(ws:Sheet,range:string,header=true){
  const r=utils.decode_range(range)
  for(let row=r.s.r;row<=r.e.r;row++)for(let c=r.s.c;c<=r.e.c;c++){
    const cell=ws.getCell(row+1,c+1)
    cell.font={name:'微软雅黑',size:10.5,color:{argb:C.ink}}
    cell.alignment={vertical:'middle',horizontal:typeof cell.value==='string'&&!cell.formula?'left':'right',wrapText:true}
    const edge:ExcelJS.Border={style:'thin',color:{argb:C.line}}
    cell.border={top:edge,bottom:edge,left:edge,right:edge}
    if(row>r.s.r||!header)cell.fill=(row-r.s.r)%2?{type:'pattern',pattern:'none'}:fill(C.pale)
    if(typeof cell.value==='number'||cell.formula)cell.numFmt='0.0000;[Red]-0.0000;0.0000'
  }
  if(header){ws.getRow(r.s.r+1).height=42;for(let c=r.s.c;c<=r.e.c;c++){
    const cell=ws.getCell(r.s.r+1,c+1);cell.fill=fill(C.blue)
    cell.font={name:'微软雅黑',size:10.5,bold:true,color:{argb:C.white}}
    cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};cell.border={right:{style:'thin',color:{argb:C.white}}}
  }}
}
function rows(ws:Sheet,start:number,values:ExcelJS.CellValue[][]){
  values.forEach((row,i)=>row.forEach((v,j)=>ws.getCell(start+i,j+1).value=v))
  table(ws,`A${start}:${col(values[0].length)}${start+values.length-1}`)
}
function input(ws:Sheet,address:string,format='0.0000'){
  const cell=ws.getCell(address);cell.fill=fill(C.input);cell.numFmt=format
}
function mapRange(map:AddressMap,from:string,to:string){
  const source=utils.decode_range(from),target=utils.decode_cell(to)
  for(let r=source.s.r;r<=source.e.r;r++)for(let c=source.s.c;c<=source.e.c;c++)map[utils.encode_cell({r,c})]=utils.encode_cell({r:target.r+r-source.s.r,c:target.c+c-source.s.c})
}
function domeMap(source:WorkBook,name:string):AddressMap{
  const m:AddressMap={};mapRange(m,'A2:D15','A5');mapRange(m,'F5:I8','A23');mapRange(m,'K5:K8','E23');mapRange(m,'F11:I14','A30');mapRange(m,'F17:G20','F30')
  for(let i=0;i<11;i++){m[`${col(i+6)}2`]=`F${i+6}`;m[`${col(i+6)}3`]=`G${i+6}`}
  Object.assign(m,{M8:'G22',M9:'H23',O8:'G24',O9:'H25',K9:'E22',M17:'F36',N17:'G36'})
  mapRange(m,`E22:L${utils.decode_range(source.Sheets[name]['!ref']!).e.r+1}`,'A40');return m
}
function cylinderMap(n:number,mh:number):AddressMap{
  const m:AddressMap={};mapRange(m,'A2:D11','A5');mapRange(m,`H2:L${n+2}`,'A18')
  const hh=n+5,h90=2*n+9
  mapRange(m,`H${hh}:L${hh+n}`,`A${n+22}`);mapRange(m,`H${h90}:M${h90+mh}`,`A${2*n+26}`)
  mapRange(m,`I${h90+mh+3}:J${h90+mh+4}`,`H${n+22}`);mapRange(m,`I${h90+mh+7}:K${h90+mh+8}`,`G${n+27}`)
  ;[16,17,18,20,24,27,29,31,33].forEach((r,i)=>{m[`A${r}`]=`A${2*n+mh+31+i}`;m[`B${r}`]=`C${2*n+mh+31+i}`;m[`C${r}`]=`D${2*n+mh+31+i}`});return m
}
/** 排版仅重定位单元格；公式中的引用同步映射。 */
export function translated(formula:string,current:string,maps:Record<string,AddressMap>):string{
  return formula.replace(/(?:'((?:[^']|'')+)'!)?(\$?[A-Z]{1,3}\$?\d+)/g,(match,sheet:string|undefined,address:string)=>{
    const target=sheet?.replace(/''/g,"'")??current,mapped=maps[target]?.[address.replace(/\$/g,'')]
    if(!mapped)return match
    const parts=/([A-Z]+)(\d+)/.exec(mapped)!
    return (sheet?`'${sheet}'!`:'')+(address.startsWith('$')?'$':'')+parts[1]+(address.includes('$',1)?'$':'')+parts[2]
  })
}
function copySource(source:WorkBook,wb:ExcelJS.Workbook,maps:Record<string,AddressMap>){
  for(const [name,map] of Object.entries(maps))for(const [address,target] of Object.entries(map)){
    const data=source.Sheets[name][address];if(!data)continue
    wb.getWorksheet(name)!.getCell(target).value=data.f?live(translated(data.f,name,maps),data.v):data.v
  }
}
function params(ws:Sheet,last:number){
  section(ws,4,'设计参数','A','D');table(ws,`A5:D${last}`)
  for(let r=6;r<=last;r++){
    ws.getCell(`A${r}`).numFmt='0';ws.getCell(`B${r}`).alignment={vertical:'middle',wrapText:true,indent:1};ws.getCell(`D${r}`).alignment={vertical:'middle',horizontal:'left',indent:1}
    const cell=ws.getCell(`C${r}`);cell.fill=fill(cell.formula?C.calc:C.input);cell.numFmt=r===8?'0.0%':'0.0000';ws.getRow(r).height=28
  }
}
function cylinder(ws:Sheet,res:CheckResult){
  const mh=Math.max(1,res.cylinder.rows.filter(g=>g.type==='hoop').length)
  const n=res.cylinder.rows.filter(r=>r.type==='spiral').length
  base(ws,[9,37,19,20,20,20,20,22,22],5);title(ws,'筒身强度校核','I');params(ws,14)
  section(ws,17,'缠绕角参数','A','E');table(ws,`A18:E${18+n}`)
  for(let r=19;r<=18+n;r++){input(ws,`A${r}`,'0.0');input(ws,`E${r}`,'0')}
  section(ws,n+21,'螺旋缠绕强度','A','E');table(ws,`A${n+22}:E${2*n+22}`)
  section(ws,2*n+25,'环向缠绕强度','A','E');table(ws,`A${2*n+26}:F${2*n+26+mh}`);ws.getRow(2*n+26).height=60;for(let i=0;i<mh;i++){input(ws,`A${2*n+27+i}`,'0.000');input(ws,`D${2*n+27+i}`,'0')}
  table(ws,`H${n+22}:I${n+23}`);ws.getRow(n+22).height=60
  for(const c of ['H','I'])ws.addConditionalFormatting({ref:`${c}${n+23}`,rules:[{type:'cellIs',operator:'lessThan',formulae:['$C$13'],priority:1,style:{fill:fill(C.red)}}]})
  table(ws,`G${n+27}:I${n+28}`);['螺旋缠绕厚度\nmm','环向缠绕厚度\nmm','总厚度\nmm'].forEach((s,i)=>ws.getCell(n+27,i+7).value=s);section(ws,2*n+mh+30,'缠绕层厚度估算','A','D')
  for(let i=0;i<9;i++){
    const r=2*n+mh+31+i;text(ws,`A${r}:B${r}`,String(ws.getCell(`A${r}`).value??''));table(ws,`A${r}:D${r}`,false)
    ws.getCell(`C${r}`).numFmt='0.000000';ws.getRow(r).height=28
  }
  for(const i of [5,6]){const cell=ws.getCell(`D${2*n+mh+31+i}`);cell.numFmt='0" 层"';cell.fill=fill(cell.formula?C.calc:C.input)}
  ws.pageSetup.printArea=`A1:I${2*n+mh+39}`;ws.pageSetup.printTitlesRow='1:2'
}
function dome(ws:Sheet,res:CheckResult,index:number){
  const g=res.dome.groups[index],end=res.dome.profile.length+40
  base(ws,[14,35,18,18,18,23,22,21],2);title(ws,`${g.angle}° 螺旋铺层校验`);params(ws,18)
  section(ws,4,'缠绕角与覆盖参数','F','H');table(ws,'F6:H16',false)
  ;['°','rad','','mm','mm','mm','','','','mm','mm'].forEach((unit,i)=>ws.getCell(`H${i+6}`).value=unit)
  input(ws,'G6','0.0');input(ws,'G14','0');ws.getCell('G7').numFmt='0.00000000'
  section(ws,21,'样条方程组','A','E');table(ws,'A23:E26',false)
  for(let r=23;r<=26;r++)for(let c=1;c<=5;c++)ws.getCell(r,c).numFmt='0.000000E+00'
  for(let r=23;r<=25;r++)ws.getCell(`A${r}`).numFmt='0'
  ws.getCell('A26').numFmt='0.00E+00'
  ;['m1系数','m2系数','m3系数','m4系数','右端项'].forEach((s,i)=>ws.getCell(22,i+1).value=s)
  section(ws,28,'逆矩阵','A','D');table(ws,'A30:D33',false)
  for(let r=30;r<=33;r++)for(let c=1;c<=4;c++)ws.getCell(r,c).numFmt='0.000000E+00'
  for(let r=30;r<=33;r++)ws.getCell(`A${r}`).numFmt='0.00E+00'
  section(ws,28,'样条系数','F','G');table(ws,'F30:G33',false)
  for(let r=30;r<=33;r++)ws.getCell(`G${r}`).numFmt='0.000000000E+00'
  table(ws,'G22:H25',false);ws.getCell('H23').numFmt='0.000000';ws.getCell('H25').numFmt='0.000000'
  ws.getCell('G26').value='Vconst';ws.getCell('H26').value=live('E26',g.Vconst);table(ws,'G26:H26',false)
  table(ws,'F36:H37',false);ws.getCell('F36').value='厚度公式切换半径';ws.getCell('H36').value='mm';if(!ws.getCell('G36').formula)input(ws,'G36')
  ws.getCell('F37').value='层数';ws.getCell('G37').value=live('E41',g.cycles);ws.getCell('H37').value='循环';input(ws,'E41','0.0')
  section(ws,39,'逐点厚度与局部参考值');table(ws,`A40:H${end}`)
  ;['平行圆半径\nmm','2倍带宽内厚度\nmm','2倍带宽外厚度\nmm','厚度\nmm','层数','总厚度\nmm','封头缠绕角度 K\n°','爆破压强\nMPa'].forEach((s,i)=>ws.getCell(40,i+1).value=s)
  ws.getRow(40).height=50
  for(let r=41;r<=end;r++){ws.getCell(`A${r}`).numFmt='0.0';ws.getCell(`E${r}`).numFmt='0.0';ws.getCell(`G${r}`).numFmt='0.0000'}
  ws.autoFilter=`A40:H${end}`;ws.pageSetup.printArea=`A1:H${end}`;ws.pageSetup.printTitlesRow='40:40';ws.getRow(39).addPageBreak()
}
function totals(ws:Sheet,res:CheckResult,pressure:boolean){
  const end=res.dome.profile.length+4,last=3+res.dome.groups.length
  base(ws,[16,21,22,...res.dome.groups.map(()=>17)],4);title(ws,pressure?'封头局部参考爆压':'封头总厚度',col(last));table(ws,`A4:${col(last)}${end}`)
  ws.getCell('A4').value='极孔直径\nmm';ws.getCell('B4').value=pressure?'总爆破压强\nMPa':'总厚度\nmm';ws.getCell('C4').value=pressure?'乘平衡系数后\nMPa':''
  if(!pressure)ws.getColumn('C').width=3
  for(let r=5;r<=end;r++)ws.getCell(`A${r}`).numFmt='0.0'
  ws.autoFilter=`A4:${col(last)}${end}`;ws.pageSetup.printArea=`A1:${col(last+(pressure?0:8))}${end}`;ws.pageSetup.printTitlesRow='4:4'
}
function layup(ws:Sheet,data:DesignInput,res:CheckResult,maps:Record<string,AddressMap>){
  base(ws,[8,13,14,12,17,19,19,20,20,20,20],4);title(ws,'铺层方案','K')
  const n=res.cylinder.rows.filter(g=>g.type==='spiral').length,h90=2*n+9,hh=n+5
  let si=0,hi=0
  const f=(address:string,value:number)=>live(`'筒身强度设计与计算'!${maps['筒身强度设计与计算'][address]}`,value)
  rows(ws,4,[['序号','缠绕类型','缠绕角度\n°','层数','缠绕角弧度','cosα平方','sinα平方','纵向单层爆压\nMPa','环向单层爆压\nMPa','纵向多层爆压\nMPa','环向多层爆压\nMPa'],...res.cylinder.rows.map((g,i)=>{
    const a=g.angle*3.1415926/180
    if(g.type==='spiral'){
      const k=si++,r=3+k,s=hh+1+k
      return [i+1,'螺旋',f(`H${r}`,g.angle),f(`L${r}`,g.layers),f(`I${r}`,a),f(`J${r}`,Math.cos(a)**2),f(`K${r}`,Math.sin(a)**2),f(`I${s}`,g.paUnit),f(`J${s}`,g.pthUnit),f(`K${s}`,g.paSum),f(`L${s}`,g.pthSum)]
    }
    const r=h90+1+hi++,row=i+5
    return [i+1,'环向',f(`H${r}`,g.angle),f(`K${r}`,g.layers),live(`C${row}/180*3.1415926`,a),live(`COS(E${row})^2`,Math.cos(a)**2),live(`SIN(E${row})^2`,Math.sin(a)**2),f(`I${r}`,g.paUnit),f(`J${r}`,g.pthUnit),f(`M${r}`,g.paSum),f(`L${r}`,g.pthSum)]
  })])
  const end=res.cylinder.rows.length+5;ws.getRow(end).values=['合计','','',res.cylinder.spiralLayers+res.cylinder.hoopLayers,'','','','','',live(`SUM(J5:J${end-1})`,res.cylinder.pa),live(`SUM(K5:K${end-1})`,res.cylinder.pth)];table(ws,`A${end}:K${end}`,false)
  for(let r=5;r<=end;r++)for(const c of ['A','D'])ws.getCell(`${c}${r}`).numFmt='0'
  ws.getRow(4).height=58
  const inactive=layupGroups(data.plan).filter(g=>g.active===false||g.layers<=0)
  if(inactive.length)text(ws,`A${end+2}:K${end+2}`,`停用组：${inactive.map(g=>`${g.type==='hoop'?'环向':'螺旋'} ${g.angle}° / ${g.layers}层`).join('，')}`)
  ws.pageSetup.printArea=`A1:K${end+2}`
}
function summary(ws:Sheet,data:DesignInput,res:CheckResult,maps:Record<string,AddressMap>):NativeChart{
  base(ws,[28,20,20,20,18,22,18,22],4);title(ws,'气瓶铺层计算书')
  ws.getRow(4).values=['设计爆破压强',res.derived.pb,'筒身半径 R',data.geometry.R,'平衡系数 Ks',data.requirement.ks,'单位','mm / MPa'];table(ws,'A4:H4',false)
  text(ws,'A5:H5','封头经验初估：筒身角 α₀；局部角 K 曲线仅作参考。',10)
  const target=(a:string)=>`'筒身强度设计与计算'!${maps['筒身强度设计与计算'][a]}`,n=res.cylinder.rows.filter(g=>g.type==='spiral').length,mh=Math.max(1,res.cylinder.rows.filter(g=>g.type==='hoop').length),r=2*n+mh+13,end=res.dome.profile.length+4
  rows(ws,7,[['项目','计算值 / MPa','设计值 / MPa','差值 / MPa','结果','位置 r / mm'],
    ['筒身纵向',live(target(`I${r}`),res.cylinder.pa),live('$B$4',res.derived.pb),live('B8-C8',res.cylinder.pa-res.derived.pb),live('IF(B8>=C8,"满足","不足")',res.cylinder.paPass?'满足':'不足'),''],
    ['筒身环向',live(target(`J${r}`),res.cylinder.pth),live('$B$4',res.derived.pb),live('B9-C9',res.cylinder.pth-res.derived.pb),live('IF(B9>=C9,"满足","不足")',res.cylinder.pthPass?'满足':'不足'),''],
    ['封头经验初估',live(`F4*SUM('筒身强度设计与计算'!D${n+23}:D${2*n+22})`,res.head.pressure),live('$B$4',res.derived.pb),live('B10-C10',res.head.pressure-res.derived.pb),live('IF(B10>=C10,"满足","不足")',res.head.pass?'满足':'不足'),''],
    ['局部参考最低值',live(`MIN('封头总爆破压强'!C5:C${end})`,res.dome.minP),'','','参考',live(`INDEX('封头总爆破压强'!A5:A${end},MATCH(B11,'封头总爆破压强'!C5:C${end},0))`,res.dome.minPR)]])
  rows(ws,13,[['厚度项目','计算值 / mm'],['筒身螺旋层',live(target(`I${2*n+mh+17}`),res.cylinder.spiralThickness)],['筒身环向层',live(target(`J${2*n+mh+17}`),res.cylinder.hoopThickness)],['筒身总厚度',live(target(`K${2*n+mh+17}`),res.cylinder.totalThickness)],['封头赤道总厚度',live(`'封头总厚度'!B${end}`,res.dome.tAtR)]])
  // ── 工况与参数明细 ──
  section(ws,21,'设计指标与工况');rows(ws,22,[
    ['项目','数值','单位'],
    ['设计容积 V',data.geometry.volumeL,'L'],
    ['设计爆破压强 pb',res.derived.pb,'MPa'],
    ['工作压力',data.requirement.pbMode==='wp_sf'?data.requirement.workingPressure:'—','MPa'],
    ['安全系数 S',data.requirement.pbMode==='wp_sf'?data.requirement.safetyFactor:'—',''],
    ['应力平衡系数 ks',data.requirement.ks,''],
  ])
  section(ws,29,'几何与内衬');rows(ws,30,[
    ['项目','数值','单位'],
    ['筒身段半径 R',data.geometry.R,'mm'],
    ['筒身段长度 l',data.geometry.cylLength,'mm'],
    ['封头短半轴 b（半椭球）',data.geometry.headShortAxis,'mm'],
    ['极孔半径 r0（缠绕）',res.derived.r0,'mm'],
    ['内衬厚度',data.geometry.linerThickness??3,'mm'],
  ])
  section(ws,37,'材料与工艺');rows(ws,38,[
    ['项目','数值','单位'],
    ['单束带宽 b',data.material.bandWidth,'mm'],
    ['每束纱数 n',data.material.strandCount,''],
    ['总带宽',res.derived.bandTotal,'mm'],
    ['纤维体积含量 Vf',data.material.vf,''],
    ['线密度 tex',data.material.tex,'g/m'],
    ['纤维密度 ρ',data.material.fiberDensity,'g/cm3'],
    ['纤维单层厚 tf',Number(res.derived.tf.toFixed(4)),'mm'],
    ['复材单层厚 tc',Number(res.derived.tc.toFixed(4)),'mm'],
  ])
  section(ws,48,'强度参数');rows(ws,49,[
    ['项目','数值','单位'],
    ['螺旋层发挥强度',res.derived.sigmaSpiral,'MPa'],
    ['环向层发挥强度',res.derived.sigmaHoop,'MPa'],
    ['复材层强度 σc',res.derived.sigmaComposite,'MPa'],
  ])
  section(ws,54,'计算表');const names=['线型切点设计','铺层角度计算','铺层方案','筒身强度设计与计算',...Object.keys(maps).filter(n=>n.startsWith('封头-')),'封头总厚度','封头总爆破压强','厚度分布','爆压分布','公式说明']
  names.forEach((name,i)=>{const cell=ws.getCell(55+Math.floor(i/2),i%2?5:1);cell.value={text:name,hyperlink:`#'${name}'!A1`};cell.font={name:'微软雅黑',size:11,color:{argb:C.blue},underline:true}})
  ws.pageSetup.printArea='A1:H65'
  return {sheetId:ws.id,title:'爆破压强',kind:'bar',yTitle:'MPa',from:{col:3,row:12},to:{col:8,row:18},series:[
    {name:'计算值',color:C.blue,xFormula:"'工况与气瓶参数'!$A$8:$A$10",yFormula:"'工况与气瓶参数'!$B$8:$B$10",x:['筒身纵向','筒身环向','封头经验初估'],y:[res.cylinder.pa,res.cylinder.pth,res.head.pressure]},
    {name:'设计值',color:'A9B5C2',xFormula:"'工况与气瓶参数'!$A$8:$A$10",yFormula:"'工况与气瓶参数'!$C$8:$C$10",x:['筒身纵向','筒身环向','封头经验初估'],y:[res.derived.pb,res.derived.pb,res.derived.pb]}]}
}
function distribution(ws:Sheet,res:CheckResult,pressure:boolean):NativeChart{
  base(ws,[17,22,22,4,...Array(8).fill(12)],4);title(ws,pressure?'封头局部参考爆压分布':'封头厚度分布','L')
  rows(ws,4,[['平行圆半径 r\nmm',pressure?'总爆破压强\nMPa':'总厚度\nmm',pressure?'设计爆破压强\nMPa':'筒身螺旋厚度\nmm'],...res.dome.profile.map((p,i)=>{
    const r=i+5;return [live(`'封头总厚度'!A${r}`,p.r),live(`'${pressure?'封头总爆破压强':'封头总厚度'}'!${pressure?'C':'B'}${r}`,pressure?p.pTotal:p.tTotal),live(pressure?"'方案汇总'!B4":"'方案汇总'!B14",pressure?res.derived.pb:res.cylinder.spiralThickness)]})])
  const end=res.dome.profile.length+4;ws.autoFilter=`A4:C${end}`;ws.pageSetup.printArea='A1:L29'
  return {sheetId:ws.id,title:pressure?'总爆破压强':'总厚度',kind:'scatter',xTitle:'平行圆半径 r / mm',yTitle:pressure?'MPa':'mm',from:{col:4,row:4},to:{col:12,row:26},series:[
    {name:pressure?'总爆破压强':'总厚度',color:C.blue,xFormula:`'${ws.name}'!$A$5:$A$${end}`,yFormula:`'${ws.name}'!$B$5:$B$${end}`,x:res.dome.profile.map(p=>p.r),y:res.dome.profile.map(p=>pressure?p.pTotal:p.tTotal)},
    {name:pressure?'设计爆破压强':'筒身螺旋厚度',color:'A56859',xFormula:`'${ws.name}'!$A$5:$A$${end}`,yFormula:`'${ws.name}'!$C$5:$C$${end}`,x:res.dome.profile.map(p=>p.r),y:res.dome.profile.map(()=>pressure?res.derived.pb:res.cylinder.spiralThickness),dash:true}]}
}
/** 线型切点设计：候选表 + Φ(D) 切线图；返回切线图锚点行（1 基） */
function lineTypeSheet(ws:Sheet,data:DesignInput,res:CheckResult):number{
  base(ws,[26,20,20,18,16,16,14,16],4);title(ws,'线型切点设计','H')
  const R=data.geometry.R,hAxis=data.geometry.headShortAxis||R
  const vp:VolumeParams={R_in:R,l:data.geometry.cylLength,lambda:lambdaFromDepth(R,hAxis),r0:res.derived.r0,Kf:0.8}
  const vol=computeVolume(vp),turns=windingTurns(vp)
  const candidates=intersectLineTypes({lambda:vp.lambda,r0:vp.r0,Kf:vp.Kf},vol.totalL,allowedLineTypes(450,660,4))
  const currentD=2*R
  section(ws,4,'设计条件','A','D');rows(ws,5,[
    ['项目','数值','单位'],
    ['目标容积 V',Number(vol.totalL.toFixed(3)),'L'],
    ['筒身内半径 R_in',R,'mm'],
    ['封头轴比 λ',Number(vp.lambda.toFixed(3)),''],
    ['极孔半径 r0',vp.r0,'mm'],
    ['筒身段长度 l',vp.l,'mm'],
    ['阀座容积折减 Kf',vp.Kf,''],
  ])
  section(ws,13,'转角核算','A','D');rows(ws,14,[
    ['项目','符号','数值','单位'],
    ['极孔缠绕角','α₀',live('ASIN(B9/B7)/PI()*180',turns.alpha0Deg),'°'],
    ['筒身转角','γ',live('B10*TAN(C15/180*PI())/(2*PI()*B7)*360',turns.gamma),'°'],
    ['封头转角','β',live('2*(90+ASIN((B7/B8*TAN(C15/180*PI())-B9)/B7)/PI()*180)',turns.beta),'°'],
    ['单程转角','θt',live('C16+C17',turns.oneWay),'°'],
    ['双程转角','θn',live('2*C18',turns.roundTrip),'°'],
  ])
  section(ws,21,'候选方案','A','G')
  const list=candidates.length?candidates.map(c=>[
    live(`360*(${c.m}+${c.K}/${c.n})`,c.theta),Number(c.D.toFixed(2)),Number(c.l.toFixed(1)),Number(c.ratio.toFixed(3)),c.n,`${c.K} / ${c.m}`,Math.abs(c.D-currentD)<1.5?'是':'—',
  ]):[['无交点：请调整容积 / 轴比 / 极孔','','','','','','']]
  rows(ws,22,[['转角 θ / °','外径 D / mm','筒身段长 l / mm','长径比 l/D','切点数 n','K / m','采用'],...list])
  const noteRow=23+list.length
  text(ws,`A${noteRow}:G${noteRow}`,'θ = 360°·(m + K/n)：n 为切点数，K、m 为整数（K 与 n 互质）。',10)
  const imgRow=noteRow+2
  ws.pageSetup.printArea=`A1:H${imgRow+24}`
  return imgRow
}

/** 铺层角度计算：筒身单角度初估 + 扩孔候选（公式带值） */
function angleCalcSheet(ws:Sheet,data:DesignInput,res:CheckResult){
  base(ws,[30,16,18,16,16,18,16,14],4);title(ws,'铺层角度计算','H')
  const d=res.derived
  const initial=initialDesign(data)
  const estimate=initial.estimate
  section(ws,4,'估算参数','A','D');rows(ws,5,[
    ['项目','数值','单位'],
    ['筒身半径 R',data.geometry.R,'mm'],
    ['极孔半径 r0',d.r0,'mm'],
    ['设计爆破压强 pb',d.pb,'MPa'],
    ['发挥强度 σ',d.sigmaSpiral,'MPa'],
    ['纤维单层厚 tf',Number(d.tf.toFixed(6)),'mm'],
    ['复材单层厚 tc',Number(d.tc.toFixed(6)),'mm'],
    ['单束带宽 b',data.material.bandWidth,'mm'],
    ['总带宽 b_tot',d.bandTotal,'mm'],
  ])
  section(ws,15,'筒身单角度初估','A','D');rows(ws,16,[
    ['项目','符号','数值','单位'],
    ['初估角','α',data.constraint.alphaRef,'°'],
    ['cosα','',live('COS(C17/180*PI())',estimate.cosRef),''],
    ['tanα','',live('TAN(C17/180*PI())',estimate.tanRef),''],
    ['螺旋向纤维厚度','tα',live('B6*B8/(2*B9*C18^2)',estimate.hSpiral),'mm'],
    ['环向纤维厚度','tθ',live('(2-C19^2)*B6*B8/(2*B9)',estimate.hHoop),'mm'],
    ['螺旋向层数','nα',live('C20/B10',estimate.nSpiral),'层'],
    ['环向层数','nθ',live('C21/B10',estimate.nHoop),'层'],
    ['螺旋初估层数（向上取偶）','',live('CEILING(C22,2)',initial.spiral),'层'],
    ['环向初估层数（向上取整）','',live('CEILING(C23,1)',initial.hoop),'层'],
  ])
  text(ws,'A26:G26','初估角取经验值：23°，或 极孔缠绕角 + 10°（默认 20° = 10° + 10°）；螺旋向上取偶、环向向上取整。',10)
  text(ws,'A27:G27',`初估复核：纵向 ${initial.pa.toFixed(2)} / 环向 ${initial.pth.toFixed(2)} MPa，${initial.pass?'满足':'不满足'}。`,10)
  section(ws,29,'扩孔候选','A','G')
  const picked=new Map(activeGroups(data.plan).filter(g=>g.type==='spiral').map(g=>[Math.round(g.angle),g.layers]))
  const all=expansionAngles(data.geometry.R,d.r0,d.bandTotal)
  const shown=all.slice(0,80)
  const list=shown.map((row,i)=>[
    i+1,
    live(row.boundary?'2*$B$6':`2*$B$7+${i}*$B$12`,row.diameter),
    live(`ASIN(B${31+i}/(2*$B$6))/PI()*180`,row.angle),
    live(`ROUND(C${31+i},0)`,Math.round(row.angle)),
    picked.has(Math.round(row.angle))?'是':'—',
    picked.get(Math.round(row.angle))??'—',
    row.boundary?'筒身边界':'',
  ])
  rows(ws,30,[['序号','扩孔直径 Dᵢ / mm','反算角 αᵢ / °','取整角 / °','采用','分配层数','备注'],...(list.length?list:[['—','—','—','—','—','—','参数不足无法生成候选']])])
  const noteRow=31+Math.max(1,list.length)
  text(ws,`A${noteRow+1}:G${noteRow+1}`,'Dᵢ = 2r₀ + i·b；角度按整度四舍五入后写入铺层表；“分配层数”为当前铺层表中该角度的层数。',10)
  if(all.length>80)text(ws,`A${noteRow+2}:G${noteRow+2}`,`候选共 ${all.length} 项，本表列前 80 项。`,10)
  ws.pageSetup.printArea=`A1:H${noteRow+3}`
}

function formulas(wb:ExcelJS.Workbook){
  const ws=wb.getWorksheet('公式说明')!;base(ws,[7,29,85,42],4);title(ws,'计算公式','D');rows(ws,4,[['序号','计算项目','公式','用途']])
  images.forEach((img,i)=>{const row=i+5;ws.getRow(row).values=[i+1,img.label,'',img.purpose];table(ws,`A${row}:D${row}`,false);ws.getCell(`A${row}`).numFmt='0';ws.getRow(row).height=76
    const ratio=Math.min(550/img.width,86/img.height,.5),id=wb.addImage({base64:img.base64,extension:'png'})
    ws.addImage(id,{tl:{col:2.1,row:row-.86},ext:{width:Math.round(img.width*ratio),height:Math.round(img.height*ratio)}})})
  ws.pageSetup.printArea=`A1:D${images.length+4}`;ws.pageSetup.printTitlesRow='4:4'
}
export async function writePresentation(source:WorkBook,data:DesignInput,res:CheckResult):Promise<Uint8Array>{
  const wb=new ExcelJS.Workbook();wb.creator='复合材料气瓶缠绕铺层设计软件';wb.title='气瓶铺层计算书';wb.calcProperties.fullCalcOnLoad=true
  const names=source.SheetNames.filter(n=>n.startsWith('封头-'))
  for(const name of ['工况与气瓶参数','线型切点设计','铺层角度计算','铺层方案','筒身强度设计与计算',...names,'封头总厚度','封头总爆破压强','厚度分布','爆压分布','公式说明'])wb.addWorksheet(name)
  const maps:Record<string,AddressMap>={'筒身强度设计与计算':cylinderMap(res.cylinder.rows.filter(g=>g.type==='spiral').length,Math.max(1,res.cylinder.rows.filter(g=>g.type==='hoop').length))}
  for(const name of names)maps[name]=domeMap(source,name)
  for(const name of ['封头总厚度','封头总爆破压强']){maps[name]={};mapRange(maps[name],source.Sheets[name]['!ref']!,'A4')}
  copySource(source,wb,maps);cylinder(wb.getWorksheet('筒身强度设计与计算')!,res);names.forEach((name,i)=>dome(wb.getWorksheet(name)!,res,i))
  totals(wb.getWorksheet('封头总厚度')!,res,false);totals(wb.getWorksheet('封头总爆破压强')!,res,true);layup(wb.getWorksheet('铺层方案')!,data,res,maps)
  const lineTypeImageRow=lineTypeSheet(wb.getWorksheet('线型切点设计')!,data,res)
  angleCalcSheet(wb.getWorksheet('铺层角度计算')!,data,res)
  const charts=[summary(wb.getWorksheet('工况与气瓶参数')!,data,res,maps),distribution(wb.getWorksheet('厚度分布')!,res,false),distribution(wb.getWorksheet('爆压分布')!,res,true)]
  formulas(wb)
  for(const ws of wb.worksheets)ws.eachRow(row=>row.eachCell(cell=>{if(cell.value==='')cell.value=null}))
  // 插图：在网页/桌面环境里栅格化后嵌入；Node 单测环境没有 DOM，跳过
  try{
    const [lineFig,contourFig]=await Promise.all([lineTypeFigure(data,res,720,380),domeContourFigure(data,res,640,310)])
    const putFigure=(sheet:string,base64:string,w:number,h:number,tl:{col:number;row:number})=>{
      const target=wb.getWorksheet(sheet);if(!target)return
      const id=wb.addImage({base64,extension:'png'});target.addImage(id,{tl,ext:{width:w,height:h}})
    }
    putFigure('线型切点设计',lineFig.base64,lineFig.width/2,lineFig.height/2,{col:0,row:lineTypeImageRow-1})
    putFigure('封头总厚度',contourFig.base64,contourFig.width/2,contourFig.height/2,{col:3+res.dome.groups.length+1,row:3})
  }catch{}
  const bytes=new Uint8Array(await wb.xlsx.writeBuffer()),zip=CFB.read(bytes,{type:'array'});addNativeCharts(zip,charts)
  return CFB.write(zip,{fileType:'zip',type:'array',compression:true}) as Uint8Array
}
