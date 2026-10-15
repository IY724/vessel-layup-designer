import type { WorkBook } from 'xlsx'
import reference from '../core/courseReference.json'

export interface ComparedCell { sheet: string; originalSheet: string; address: string; reference: number; expected: number; corrected: boolean; actual: number | null; difference: number | null; pass: boolean }
/** 独立基准：只用原表缓存的厚度、局部角和材料量修正余弦项。 */
function correctedPressure(sheet: typeof reference[number]['sheets'][number], row: number): number {
  const n = sheet.numeric as Record<string, number>
  if (n[`E${row}`] < n.I3) return 0
  return 2 * n[`J${row}`] * n.C15 / n.C3 * Math.cos(n[`K${row}`] / 180 * Math.PI) ** 2
}
export function correctedReference(book: typeof reference[number], sheet: typeof reference[number]['sheets'][number], address: string, original: number): number {
  if (book.file.includes('强度设计')) return original
  const pressure = /^L(\d+)$/.exec(address)
  if (/^\d+$/.test(sheet.name) && pressure && Number(pressure[1]) >= 23) return correctedPressure(sheet, Number(pressure[1]))
  const total = /^([BC])(\d+)$/.exec(address)
  if (sheet.name === '总爆破压强' && total && Number(total[2]) >= 2) {
    const row = Number(total[2]) + 21
    const sum = book.sheets.filter(s => /^\d+$/.test(s.name)).reduce((v, s) => v + correctedPressure(s, row), 0)
    const n = sheet.numeric as Record<string, number>
    return sum * (total[1] === 'C' ? n.C2 / n.B2 : 1)
  }
  return original
}
export function compareCourse(source: WorkBook): ComparedCell[] {
  const cells: ComparedCell[] = []
  for (const book of reference) for (const sheet of book.sheets) {
    const target = book.file.includes('强度设计') ? '筒身强度设计与计算' : sheet.name.startsWith('总') ? `封头${sheet.name}` : `封头-${sheet.name}°`
    for (const [address, value] of Object.entries(sheet.numeric)) {
      const cell = source.Sheets[target]?.[address]
      const actual = typeof cell?.v === 'number' ? cell.v : null
      const difference = actual == null ? null : actual - value
      const expected = correctedReference(book, sheet, address, value)
      const tolerance = 1e-8 * Math.max(1, Math.abs(expected))
      cells.push({ sheet: target, originalSheet: sheet.name, address, reference: value, expected, corrected: Math.abs(expected - value) > tolerance, actual, difference,
        pass: actual != null && Math.abs(actual - expected) <= tolerance })
    }
  }
  return cells
}
export { reference as courseReference }
