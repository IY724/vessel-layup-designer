import ExcelJS from 'exceljs'
import { CFB, utils, type WorkBook } from 'xlsx'
import type { CheckResult, DesignInput } from '../core/types'
import images from './formulaImages.json'
import { addNativeCharts, type NativeChart } from './nativeCharts'

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
function cylinderMap(n:number):AddressMap{
  const m:AddressMap={};mapRange(m,'A2:D11','A5');mapRange(m,`H2:L${n+2}`,'A18')
  const hh=n+5,h90=2*n+9
  mapRange(m,`H${hh}:L${hh+n}`,`A${n+22}`);mapRange(m,`H${h90}:L${h90+1}`,`A${2*n+26}`)
  mapRange(m,`I${h90+4}:J${h90+5}`,`G${n+22}`);mapRange(m,`I${h90+8}:K${h90+9}`,`F${n+27}`)
  ;[16,17,18,20,24,27,29,31,33].forEach((r,i)=>{m[`A${r}`]=`A${2*n+32+i}`;m[`B${r}`]=`C${2*n+32+i}`;m[`C${r}`]=`D${2*n+32+i}`});return m
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
  const n=res.cylinder.rows.filter(r=>r.type==='spiral').length
  base(ws,[9,37,19,20,20,20,22,22],5);title(ws,'筒身强度校核');params(ws,14)
  section(ws,17,'缠绕角参数','A','E');table(ws,`A18:E${18+n}`)
  for(let r=19;r<=18+n;r++){input(ws,`A${r}`,'0.0');input(ws,`E${r}`,'0')}
  section(ws,n+21,'螺旋缠绕强度','A','E');table(ws,`A${n+22}:E${2*n+22}`)
  section(ws,2*n+25,'环向缠绕强度','A','E');table(ws,`A${2*n+26}:E${2*n+27}`);ws.getRow(2*n+26).height=60;input(ws,`D${2*n+27}`,'0')
  table(ws,`G${n+22}:H${n+23}`);ws.getRow(n+22).height=60
  for(const c of ['G','H'])ws.addConditionalFormatting({ref:`${c}${n+23}`,rules:[{type:'cellIs',operator:'lessThan',formulae:['$C$13'],priority:1,style:{fill:fill(C.red)}}]})
  table(ws,`F${n+27}:H${n+28}`);['螺旋缠绕厚度\nmm','环向缠绕厚度\nmm','总厚度\nmm'].forEach((s,i)=>ws.getCell(n+27,i+6).value=s);section(ws,2*n+31,'缠绕层厚度估算','A','D')
  for(let i=0;i<9;i++){
    const r=2*n+32+i;text(ws,`A${r}:B${r}`,String(ws.getCell(`A${r}`).value??''));table(ws,`A${r}:D${r}`,false)
    ws.getCell(`C${r}`).numFmt='0.000000';ws.getRow(r).height=28
  }
  for(const i of [5,6])input(ws,`D${2*n+32+i}`,'0" 层"')
  ws.pageSetup.printArea=`A1:H${2*n+40}`;ws.pageSetup.printTitlesRow='1:2'
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
  table(ws,'F36:H37',false);ws.getCell('F36').value='样条选取上限';ws.getCell('H36').value='mm';if(!ws.getCell('G36').formula)input(ws,'G36')
  ws.getCell('F37').value='层数';ws.getCell('G37').value=live('E41',g.cycles);ws.getCell('H37').value='循环';input(ws,'E41','0.0')
  section(ws,39,'逐点厚度与局部参考值');table(ws,`A40:H${end}`)
  ;['极孔直径\nmm','2倍带宽内厚度\nmm','2倍带宽外厚度\nmm','厚度\nmm','层数','总厚度\nmm','封头局部角 K\n°','局部参考爆压\nMPa'].forEach((s,i)=>ws.getCell(40,i+1).value=s)
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
  ws.autoFilter=`A4:${col(last)}${end}`;ws.pageSetup.printArea=`A1:${col(last)}${end}`;ws.pageSetup.printTitlesRow='4:4'
}
function layup(ws:Sheet,data:DesignInput,res:CheckResult){
  base(ws,[8,13,14,12,17,19,19,20,20,20,20],4);title(ws,'铺层方案','K')
  rows(ws,4,[['序号','缠绕类型','缠绕角度\n°','层数','缠绕角弧度','cosα平方','sinα平方','纵向单层爆压\nMPa','环向单层爆压\nMPa','纵向多层爆压\nMPa','环向多层爆压\nMPa'],...res.cylinder.rows.map((g,i)=>{
    const n=res.dome.groups.length,r=19+i,s=n+23+i,q="'筒身强度设计与计算'!",f=(a:string,v:number)=>live(q+a,v)
    return [i+1,g.type==='spiral'?'螺旋':'环向',g.type==='spiral'?f(`A${r}`,g.angle):90,g.type==='spiral'?f(`E${r}`,g.layers):f(`D${2*n+27}`,g.layers),g.type==='spiral'?f(`B${r}`,g.angle*3.1415926/180):'',g.type==='spiral'?f(`C${r}`,Math.cos(g.angle*3.1415926/180)**2):'',g.type==='spiral'?f(`D${r}`,Math.sin(g.angle*3.1415926/180)**2):'',g.type==='spiral'?f(`B${s}`,g.paUnit):0,g.type==='spiral'?f(`C${s}`,g.pthUnit):f(`C${2*n+27}`,g.pthUnit),g.type==='spiral'?f(`D${s}`,g.paSum):0,g.type==='spiral'?f(`E${s}`,g.pthSum):f(`E${2*n+27}`,g.pthSum)]
  })])
  const end=res.cylinder.rows.length+5;ws.getRow(end).values=['合计','','',res.cylinder.spiralLayers+res.cylinder.hoopLayers,'','','','','',res.cylinder.pa,res.cylinder.pth];table(ws,`A${end}:K${end}`,false)
  for(let r=5;r<=end;r++)for(const c of ['A','D'])ws.getCell(`${c}${r}`).numFmt='0'
  ws.getRow(4).height=58
  const inactive=data.plan.spiral.filter(g=>g.active===false||g.layers<=0)
  if(inactive.length)text(ws,`A${end+2}:K${end+2}`,`停用组：${inactive.map(g=>`${g.angle}° / ${g.layers}层`).join('，')}`)
  ws.pageSetup.printArea=`A1:K${end+2}`
}
function summary(ws:Sheet,data:DesignInput,res:CheckResult,maps:Record<string,AddressMap>):NativeChart{
  base(ws,[28,20,20,20,18,22,18,22],4);title(ws,'气瓶铺层计算书')
  ws.getRow(4).values=['设计爆破压强',res.derived.pb,'筒身半径 R',data.geometry.R,'平衡系数 Ks',data.requirement.ks,'单位','mm / MPa'];table(ws,'A4:H4',false)
  text(ws,'A5:H5','封头经验初估：筒身角 α₀；局部角 K 曲线仅作参考。',10)
  const target=(a:string)=>`'筒身强度设计与计算'!${maps['筒身强度设计与计算'][a]}`,n=res.dome.groups.length,r=2*n+14,end=res.dome.profile.length+4
  rows(ws,7,[['项目','计算值 / MPa','设计值 / MPa','差值 / MPa','结果','位置 r / mm'],
    ['筒身纵向',live(target(`I${r}`),res.cylinder.pa),live('$B$4',res.derived.pb),live('B8-C8',res.cylinder.pa-res.derived.pb),live('IF(B8>=C8,"满足","不足")',res.cylinder.paPass?'满足':'不足'),''],
    ['筒身环向',live(target(`J${r}`),res.cylinder.pth),live('$B$4',res.derived.pb),live('B9-C9',res.cylinder.pth-res.derived.pb),live('IF(B9>=C9,"满足","不足")',res.cylinder.pthPass?'满足':'不足'),''],
    ['封头经验初估',live('F4*B8',res.head.pressure),live('$B$4',res.derived.pb),live('B10-C10',res.head.pressure-res.derived.pb),live('IF(B10>=C10,"满足","不足")',res.head.pass?'满足':'不足'),''],
    ['局部参考最低值',live(`MIN('封头总爆破压强'!C5:C${end})`,res.dome.minP),'','','参考',live(`INDEX('封头总爆破压强'!A5:A${end},MATCH(B11,'封头总爆破压强'!C5:C${end},0))`,res.dome.minPR)]])
  rows(ws,13,[['厚度项目','计算值 / mm'],['筒身螺旋层',live(target(`I${2*n+18}`),res.cylinder.spiralThickness)],['筒身环向层',live(target(`J${2*n+18}`),res.cylinder.hoopThickness)],['筒身总厚度',live(target(`K${2*n+18}`),res.cylinder.totalThickness)],['封头赤道总厚度',live(`'封头总厚度'!B${end}`,res.dome.tAtR)]])
  section(ws,20,'计算表');const names=['铺层方案','筒身强度设计与计算',...Object.keys(maps).filter(n=>n.startsWith('封头-')),'封头总厚度','封头总爆破压强','公式说明']
  names.forEach((name,i)=>{const cell=ws.getCell(22+Math.floor(i/2),i%2?5:1);cell.value={text:name,hyperlink:`#'${name}'!A1`};cell.font={name:'微软雅黑',size:11,color:{argb:C.blue},underline:true}})
  ws.pageSetup.printArea='A1:H31'
  return {sheetId:ws.id,title:'爆破压强',kind:'bar',yTitle:'MPa',from:{col:3,row:12},to:{col:8,row:18},series:[
    {name:'计算值',color:C.blue,xFormula:"'方案汇总'!$A$8:$A$10",yFormula:"'方案汇总'!$B$8:$B$10",x:['筒身纵向','筒身环向','封头经验初估'],y:[res.cylinder.pa,res.cylinder.pth,res.head.pressure]},
    {name:'设计值',color:'A9B5C2',xFormula:"'方案汇总'!$A$8:$A$10",yFormula:"'方案汇总'!$C$8:$C$10",x:['筒身纵向','筒身环向','封头经验初估'],y:[res.derived.pb,res.derived.pb,res.derived.pb]}]}
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
  for(const name of ['方案汇总','铺层方案','筒身强度设计与计算',...names,'封头总厚度','封头总爆破压强','厚度分布','爆压分布','公式说明'])wb.addWorksheet(name)
  const maps:Record<string,AddressMap>={'筒身强度设计与计算':cylinderMap(res.dome.groups.length)}
  for(const name of names)maps[name]=domeMap(source,name)
  for(const name of ['封头总厚度','封头总爆破压强']){maps[name]={};mapRange(maps[name],source.Sheets[name]['!ref']!,'A4')}
  copySource(source,wb,maps);cylinder(wb.getWorksheet('筒身强度设计与计算')!,res);names.forEach((name,i)=>dome(wb.getWorksheet(name)!,res,i))
  totals(wb.getWorksheet('封头总厚度')!,res,false);totals(wb.getWorksheet('封头总爆破压强')!,res,true);layup(wb.getWorksheet('铺层方案')!,data,res)
  const charts=[summary(wb.getWorksheet('方案汇总')!,data,res,maps),distribution(wb.getWorksheet('厚度分布')!,res,false),distribution(wb.getWorksheet('爆压分布')!,res,true)]
  formulas(wb)
  for(const ws of wb.worksheets)ws.eachRow(row=>row.eachCell(cell=>{if(cell.value==='')cell.value=null}))
  const bytes=new Uint8Array(await wb.xlsx.writeBuffer()),zip=CFB.read(bytes,{type:'array'});addNativeCharts(zip,charts)
  return CFB.write(zip,{fileType:'zip',type:'array',compression:true}) as Uint8Array
}
