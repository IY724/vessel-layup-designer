from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
headers={
 'src/export/excel.ts': '/** 两份课件原表的计算单元格。coursePresentation.ts 负责重排及引用映射。\n * 保留原表常数、封头爆压表达式、手选层数及分段。样条系数保留矩阵求逆公式。\n */',
 'src/core/checker.ts': '/** 筒身与封头汇总。计算按课件原表，封头完整半径列参与比较。\n * rFull 仅记录全部角度覆盖起点，不用于排除极孔侧数据。\n */',
 'src/core/dome.ts': '/** 封头逐角度计算，按课件原表的实际公式与人工选取复现。\n * mR、覆盖公式、体积矩阵采用 3.1415926；角度输入弧度采用 Math.PI。\n * 局部角 K 以 3.1415926 转成度；爆压保持 cos(u*cos(u))，u=K*Math.PI/180。\n * 正样条外插保留；循环数为每组层数/2；45° 原表 163 mm 分段由输入显式保留。\n */',
}
for filename,header in headers.items():
 p=root/filename;s=p.read_text(encoding='utf-8');s=re.sub(r'^/\*\*.*?\*/',header,s,count=1,flags=re.S)
 if filename.endswith('checker.ts'):
  s=re.sub(r'/\*\*\n \* 判定窗口下界.*?\*/','/** 原表半径列起点；不采用自定的强度检查截断区。 */',s,flags=re.S)
  s=re.sub(r'/\*\*\n \* 薄弱区定位与对策建议。.*?\*/','/** 按完整数据列定位最低值；调整仅作试算。 */',s,flags=re.S)
 if filename.endswith('excel.ts'):
  s=s.replace('res.dome.rFull.toFixed(2)','res.dome.rBoss.toFixed(2)')
  start=s.index('function notesSheet(): WS {');end=s.index('// ── 入口',start)
  s=s[:start]+'''function notesSheet(): WS {
  const ws: WS = {}
  const rows = [
    ['计算依据', ''],
    ['筒身', '强度设计与计算.xls'],
    ['封头', '封头厚度计算公式最终 - 演示版.xls'],
    ['常数', '保留原表分别采用的 3.1415926 与 PI()。'],
    ['封头爆压', 'COS(K/180*PI()*COS(K/180*PI()))'],
    ['样条分段', '保留原表手选分段；45° 组在 163 mm 处仍选样条。'],
    ['层数初估', '保留小数估算及独立手选层数。'],
    ['矩阵与系数', '矩阵求逆和系数保留活公式。'],
  ]
  rows.forEach(([a,b],i)=>{put(ws,`A${i+1}`,a);put(ws,`B${i+1}`,b)})
  ref(ws,rows.length,2)
  return ws
}

''' + s[end:]
 p.write_text(s,encoding='utf-8')
p=root/'README.md';s=p.read_text(encoding='utf-8')
start=s.index('## 与原始 Excel');end=s.index('## 目录结构',start)
s=s[:start]+'''## 与课件原表的对齐

网页、明细及 Excel 使用同一组计算结果。两份原始 XLS 保持不变；保留原表常数、封头爆压表达式、144 个半径点、手选层数及 45° 组在 163 mm 处的分段。不采用之前的 cos² 替换、层数强制取整或半径截断。

导出保留各角度组的全部参数、条件矩阵、逆矩阵、样条系数和逐点计算。全部工作表可见。“原版对比”逐格列出课件基准与输出，原表 5,990 个有定义数值均在容差内一致。网页按钮下载文件与独立重算均已核对。

详见 [课件原表对齐核对记录](docs/课件原表对齐核对记录.md)。

''' + s[end:]
s=s.replace('p_g(r) = 2t_g σc/R·cos²α_g(r)','p_g(r) = 2t_g σc/R·cos(u·cos u)，u=Kπ/180')
s=s.replace('封头 min over r∈[r_boss, R] { ks·Σp_g(r) } ≥ pb','封头完整半径列的最低 ks·Σp_g(r) 与 pb 比较')
s=s.replace('Excel 复刻报告（11 张表','Excel 复刻报告（默认 16 张表')
s=s.replace('两种封头算法在顶栏切换：\n「正确算法（推荐）」与「参考表原算法（仅对账）」。','封头按课件原表计算。')
p.write_text(s,encoding='utf-8')
p=root/'docs/DESIGN.md';s=p.read_text(encoding='utf-8');p.write_text('> 2026-10-15 更新：计算方式与导出结构以《课件原表对齐核对记录》为准。下文保留早期设计讨论。\n\n'+s,encoding='utf-8')
