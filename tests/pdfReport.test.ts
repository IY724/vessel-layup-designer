import { describe, expect, it } from 'vitest'
import { defaultInput } from '../src/core/presets'
import { runCheck } from '../src/core/checker'
import { buildReportModel } from '../src/export/reportModel'
import { renderTex } from '../src/ui/Tex'

describe('PDF 计算书的数据与结论', () => {
  it('所有理论公式均转换为数学符号，不把未识别的命令名印入计算书', () => {
    const input=defaultInput(), report=buildReportModel(input,runCheck(input))
    const functions=new Set(['cos','sin','tan','arcsin','arccos','max','min'])
    for (const block of report.blocks) if(block.kind==='equation') {
      const visible=renderTex(block.tex,true).replace(/<[^>]+>/g,'')
      for(const command of block.tex.matchAll(/\\([a-zA-Z]+)/g)) {
        if(!functions.has(command[1])) expect(visible,block.number).not.toContain(command[1])
      }
    }
  })
  it('几何折减系数使用工程输入，容积与线型候选同时更新', () => {
    const input = defaultInput()
    const before = buildReportModel(input, runCheck(input))
    input.geometry.headVolumeFactor = 0.65
    const after = buildReportModel(input, runCheck(input))
    const volume = after.blocks.find(b => b.kind === 'table' && b.caption.startsWith('表 2 '))
    const expected = (Math.PI * 135**2 * 1282 + 4*Math.PI/3*0.65*135**2*65)/1e6
    expect(volume?.kind === 'table' && volume.rows.find(r => r[0] === '几何计算容积')?.[2]).toBe(expected.toFixed(3))
    expect(after.blocks.some(b => b.kind === 'paragraph' && b.text.includes('Kf = 0.650'))).toBe(true)
    expect(after.blocks.find(b => b.kind === 'table' && b.caption.startsWith('表 3 '))).not.toEqual(before.blocks.find(b => b.kind === 'table' && b.caption.startsWith('表 3 ')))
    expect('subtitle' in after).toBe(false)
  })
  it('保留默认案例实际铺层和校核值，明确区分几何容积与目标容积', () => {
    const input = defaultInput()
    const original = JSON.stringify(input)
    const report = buildReportModel(input, runCheck(input))
    const resultTable = report.blocks.find(b => b.kind === 'table' && b.caption.startsWith('表 9 '))
    expect(resultTable?.kind === 'table' && resultTable.rows[0][1]).toBe('203.649')
    // 当前强度内核：各角螺旋环向贡献 + 36 层90°环向贡献。
    expect(resultTable?.kind === 'table' && resultTable.rows[1][1]).toBe('183.433')
    const rows = report.blocks.find(b => b.kind === 'table' && b.caption.startsWith('表 7 '))
    expect(rows?.kind === 'table' && rows.rows.reduce((s, r) => s + Number(r[3]), 0)).toBe(64)
    const volume = report.blocks.find(b => b.kind === 'table' && b.caption.startsWith('表 2 '))
    expect(volume?.kind === 'table' && volume.rows.some(r => r[0] === '计算容积与目标之差')).toBe(true)
    const equations = report.blocks.filter(b => b.kind === 'equation')
    expect(new Set(equations.map(b=>b.number)).size).toBe(equations.length)
    expect(equations.some(b => b.kind === 'equation' && b.tex.includes('\\frac'))).toBe(true)
    expect(equations.every(b => b.kind === 'equation' && !/[\x00-\x1f]/.test(b.tex))).toBe(true)
    expect(report.blocks.filter(b=>b.kind==='paragraph').map(b=>b.text).join('\n')).not.toMatch(/Excel|表格计算形式|近似处理|样条外推/)
    expect(JSON.stringify(input)).toBe(original)
  })

  it('不把未满足的修改方案写成通过，不把初算层数当实际层数', () => {
    const input = defaultInput()
    input.plan = { groups: [{ type: 'spiral', angle: 20, layers: 2 }, { type: 'hoop', angle: 90, layers: 1 }], spiral: [], hoop: 0 }
    input.requirement.pb = 400
    const report = buildReportModel(input, runCheck(input))
    const text = report.blocks.filter(b => b.kind === 'paragraph').map(b => b.text).join('\n')
    expect(text).toContain('尚未满足本次初步校核的全部要求')
    expect(text).toContain('2 层螺旋缠绕与 1 层环向缠绕')
    const table = report.blocks.find(b => b.kind === 'table' && b.caption.startsWith('表 9 '))
    expect(table?.kind === 'table' && table.rows.every(r => r[4] === '不满足')).toBe(true)
  })

  it('直接给定强度、非90度环向、停用行均按当前方案输出', () => {
    const input = defaultInput()
    input.strength.mode = 'B'
    input.strength.sigmaSpiralDirect = 3000
    input.strength.sigmaHoopDirect = 4200
    input.strength.sigmaCompositeDirect = 1700
    input.plan = { groups: [
      { type: 'spiral', angle: 25, layers: 8 }, { type: 'hoop', angle: 80, layers: 20 },
      { type: 'spiral', angle: 40, layers: 50, active: false },
    ], spiral: [], hoop: 0 }
    const result = runCheck(input)
    const report = buildReportModel(input, result)
    const table = report.blocks.find(b => b.kind === 'table' && b.caption.startsWith('表 7 '))
    expect(table?.kind === 'table' && table.rows[2][5]).toBe('停用')
    const actual = report.blocks.find(b => b.kind === 'table' && b.caption.startsWith('表 8 '))
    expect(actual?.kind === 'table' && actual.rows.length).toBe(2)
    expect(actual?.kind === 'table' && actual.rows[1][2]).toBe('80.00')
    expect(report.blocks.some(b => b.kind === 'paragraph' && b.text.includes('复材层强度直接给定，为 1700.000 MPa'))).toBe(true)
  })
})
