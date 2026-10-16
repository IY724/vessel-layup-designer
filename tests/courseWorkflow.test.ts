import { describe, expect, it } from 'vitest'
import { courseInput } from '../src/core/presets'
import { runCheck } from '../src/core/checker'
import { coverageAt, layerThickness } from '../src/core/dome'
import { buildWorkbook } from '../src/export/excel'
import { courseReference } from '../src/export/courseComparison'

const input = courseInput(), result = runCheck(input), book = buildWorkbook(input, result)
const source = courseReference[1]

describe('原表流程与正确平方公式', () => {
  for (const angle of [10,17,25,37,40,45]) it(`${angle}°：一倍/两倍带宽、内外厚度选取、循环数和逐半径爆压`, () => {
    const ref = source.sheets.find(s => s.name === String(angle))!.numeric as Record<string,number>
    const actual = book.Sheets[`封头-${angle}°`]
    const group = result.dome.groups.find(g => g.angle === angle)!
    expect(group.rb-group.r0).toBeCloseTo(20,10)
    expect(group.r2b-group.r0).toBeCloseTo(40,10)
    expect(group.cycles).toBe(ref.I23)
    for(let row=23;row<=166;row++) {
      const r = ref[`E${row}`]
      expect(actual[`E${row}`].v).toBe(r)
      for(const col of ['F','G','H','J']) if(Number.isFinite(ref[`${col}${row}`])) {
        expect(actual[`${col}${row}`].v,`${angle}° ${col}${row}`).toBeCloseTo(ref[`${col}${row}`],7)
      }
      const selected = r<=group.splineEndRadius ? actual[`F${row}`].v : actual[`G${row}`].v
      expect(layerThickness(group,r)).toBeCloseTo(selected,10)
      const expectedPressure = r<ref.I3 ? 0 : 2*ref[`J${row}`]*ref.C15/ref.C3*Math.cos(ref[`K${row}`]/180*Math.PI)**2
      expect(actual[`L${row}`].v).toBeCloseTo(expectedPressure,7)
      expect(actual[`L${row}`].f).toContain(`COS(K${row}/180*PI())^2`)
    }
  })
  it('共同半径30.2至173.5的144行，厚度直接相加，爆压先相加再乘系数', () => {
    expect(result.dome.profile).toHaveLength(144)
    expect(result.dome.profile[0].r).toBe(30.2)
    expect(result.dome.profile[result.dome.profile.length-1].r).toBe(173.5)
    for(const point of result.dome.profile) {
      expect(point.tTotal).toBeCloseTo(point.tGroups.reduce((s,n)=>s+n,0),12)
      expect(point.pTotal).toBeCloseTo(point.pGroups.reduce((s,n)=>s+n,0)*.75,12)
    }
  })
  it('覆盖公式从一倍带宽边界起有定义；两倍带宽衔接处与样条一致', () => {
    const g = result.dome.groups[0]
    expect(coverageAt(g,g.rb)).toBeGreaterThan(0)
    expect(layerThickness(g,g.r2b)).toBeCloseTo(coverageAt(g,g.r2b),7)
    expect(book.Sheets['封头-10°'].L23.v).toBeCloseTo(.07455220020292706,8)
  })
})
