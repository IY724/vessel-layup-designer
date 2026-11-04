import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import XLSX from 'xlsx'
const file=path.resolve('../00_原始参考资料/附件/封头厚度计算公式最终 - 演示版.xls')
const bytes=fs.readFileSync(file),wb=XLSX.read(bytes,{type:'buffer',cellFormula:true})
const groups=['10','17','25','37','40','45']
const data=[]
for(let row=23;row<=166;row++){
 const r=wb.Sheets['10'][`E${row}`].v
 const entries=groups.map(name=>{
  const sheet=wb.Sheets[name],t=sheet[`J${row}`]?.v||0,K=sheet[`K${row}`]
  const defined=K?.t==='n',u=defined?K.v/180*Math.PI:NaN
  const scale=2*t*sheet.C15.v/sheet.C3.v
  return {angle:Number(name),original:sheet[`L${row}`].v,
   squaredLocal:defined?scale*Math.cos(u)**2:0,
   squaredCylinder:scale*Math.cos(sheet.F3.v/180*Math.PI)**2,
   thickness:t,localAngle:defined?K.v:null}
 })
 data.push({r,original:.75*entries.reduce((s,e)=>s+e.original,0),squaredLocal:.75*entries.reduce((s,e)=>s+e.squaredLocal,0),squaredCylinderSubstitution:.75*entries.reduce((s,e)=>s+e.squaredCylinder,0),groups:entries})
}
const max=data.reduce((a,b)=>a.original-a.squaredLocal>b.original-b.squaredLocal?a:b)
const result={sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
 originalFormula:wb.Sheets['10'].L23.f,
 probeAngles:[0,10,45,60,90].map(deg=>{const u=deg*Math.PI/180;return{deg,originalFactor:Math.cos(u*Math.cos(u)),squaredFactor:Math.cos(u)**2}}),
 points:[30.2,81,163,173.5].map(r=>data.find(p=>p.r===r)),
 maximumDifference:{r:max.r,original:max.original,squaredLocal:max.squaredLocal,difference:max.original-max.squaredLocal}}
fs.mkdirSync('output/qa/cosine-audit',{recursive:true})
fs.writeFileSync('output/qa/cosine-audit/余弦项数值核查.json',JSON.stringify(result,null,2))
console.log(JSON.stringify({...result,points:result.points.map(({groups,...point})=>point)},null,2))
