import { defaultInput } from '../src/core/presets'
import { runCheck } from '../src/core/checker'
import { initialDesign } from '../src/core/initialDesign'
import { domeAt } from '../src/core/dome'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
const input=defaultInput(),result=runCheck(input),initial=initialDesign(input)
const eq=domeAt(result.dome.groups,input.geometry.R,input.geometry.R,result.derived.sigmaComposite,input.requirement.ks)
const max=result.dome.profile.reduce((a,b)=>a.tTotal>b.tTotal?a:b)
const source=[{angle:15,n:8,pa:69,pth:2.48},{angle:20,n:8,pa:65.3,pth:4.33},{angle:25,n:4,pa:30.37,pth:3.3},{angle:35,n:4,pa:24.81,pth:6.08},{angle:40,n:4,pa:21.7,pth:7.64}]
const summary={
  input,derived:result.derived,initial:{spiral:initial.spiral,hoop:initial.hoop},
  sourceComparison:source.map((s,i)=>({angle:s.angle,layers:s.n,paPaper:s.pa,paActual:result.cylinder.rows.filter(r=>r.type==='spiral')[i].paSum,pthPaper:s.pth,pthActual:result.cylinder.rows.filter(r=>r.type==='spiral')[i].pthSum})),
  pa:result.cylinder.pa,pth:result.cylinder.pth,hoopContribution:result.cylinder.rows.filter(r=>r.type==='hoop').reduce((s,r)=>s+r.pthSum,0),
  headEstimate:result.head.pressure,equatorLocalPressure:eq.pTotal,maxThickness:max.tTotal,maxThicknessRadius:max.r,
  comparison:{ initialPaper:[28,36], hoopPaper:160.45, hoopDifference:result.cylinder.rows.filter(r=>r.type==='hoop').reduce((s,r)=>s+r.pthSum,0)-160.45,
    pthPaper:183.43,pthDifference:result.cylinder.pth-183.43,equatorPaper:168.47,equatorDifference:eq.pTotal-168.47,
    maximumThicknessPaper:19.1,maximumThicknessDifference:max.tTotal-19.1 },
}
const out=resolve('../_work/default_order_20261017');mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'朱宁默认参数复算.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2))
