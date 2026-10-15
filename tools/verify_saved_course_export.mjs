import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import XLSX from 'xlsx'
const ref=JSON.parse(fs.readFileSync(new URL('../src/core/courseReference.json',import.meta.url),'utf8'))
const filename=process.argv[2]||'../交付/案例-0参考铺层.xlsx'
const wb=XLSX.readFile(filename,{cellFormula:true}),comparison=wb.Sheets['原版对比']
const errors=[],differences=[],summary=[]
for(const name of wb.SheetNames)for(const [address,cell]of Object.entries(wb.Sheets[name]))if(cell.t==='e')errors.push({name,address,value:cell.w})
let row=19,count=0
for(const book of ref){
 const bytes=fs.readFileSync(path.join('..',book.file))
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==book.sha256)throw Error('原始文件哈希已变化')
 for(const sheet of book.sheets){
  let n=0,maxRelative=0,maxAbsolute=0,bad=0
  for(const [address,expected]of Object.entries(sheet.numeric)){
   if(comparison[`B${row}`]?.v!==address)throw Error(`比较顺序错误：${row}`)
   const actual=comparison[`D${row}`]?.v,referenceValue=comparison[`C${row}`]?.v
   const difference=typeof actual==='number'?Math.abs(actual-expected):Infinity
   const relative=difference/Math.max(1,Math.abs(expected))
   const referenceDifference=typeof referenceValue==='number'?Math.abs(referenceValue-expected)/Math.max(1,Math.abs(expected)):Infinity
   if(referenceDifference>1e-8||relative>1e-8){differences.push({sheet:sheet.name,address,expected,actual,referenceValue});bad++}
   maxRelative=Math.max(maxRelative,relative);maxAbsolute=Math.max(maxAbsolute,difference);row++;count++;n++
  }
  summary.push({sheet:sheet.name,count:n,bad,maxRelative,maxAbsolute})
 }
}
const report={file:path.resolve(filename),sha256:crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),count,errors,differences,summary}
console.log(JSON.stringify({...report,differences:differences.slice(0,8)},null,2))
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2))
if(errors.length||differences.length||count!==5990)process.exitCode=1
