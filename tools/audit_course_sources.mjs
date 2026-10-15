import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import XLSX from 'xlsx'

const root = path.resolve('..')
const out = path.join(root, '_核对记录_20261015')
fs.mkdirSync(out, { recursive: true })
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]) }
const files = walk(path.join(root, '00_原始参考资料')).filter(p => p.endsWith('.xls'))
const data = files.map(file => {
  const bytes = fs.readFileSync(file)
  const wb = XLSX.read(bytes, { type: 'buffer', cellFormula: true, cellStyles: true })
  return { file: path.relative(root, file), sha256: crypto.createHash('sha256').update(bytes).digest('hex'), sheets: wb.SheetNames.map(name => ({ name, cells: wb.Sheets[name] })) }
})
fs.writeFileSync(path.join(out, '原表单元格.json'), JSON.stringify(data, null, 2))
const reference = data.map(book => ({ file: book.file, sha256: book.sha256, sheets: book.sheets.filter(s => s.cells['!ref']).map(s => ({
  name: s.name,
  numeric: Object.fromEntries(Object.entries(s.cells).filter(([a,c]) => !a.startsWith('!') && c.t === 'n').map(([a,c]) => [a,c.v])),
  errors: Object.entries(s.cells).filter(([a,c]) => !a.startsWith('!') && c.t === 'e').map(([a,c]) => ({address:a, formula:c.f, code:c.v})),
})) }))
fs.writeFileSync('src/core/courseReference.json', JSON.stringify(reference))
for (const book of data) {
  console.log(book.file, book.sha256)
  for (const sheet of book.sheets) {
    console.log(sheet.name, sheet.cells['!ref'])
    const entries = Object.entries(sheet.cells).filter(([a, c]) => !a.startsWith('!') && c.v != null && (book.file.includes('强度设计') || Number(a.replace(/\D/g, '')) < 30 || ['总厚度', '总爆破压强'].includes(sheet.name) && Number(a.replace(/\D/g, '')) < 5))
    if (['10', '10°', '总厚度', '总爆破压强'].includes(sheet.name) || book.file.includes('强度设计')) for (const [a, c] of entries) console.log(a, JSON.stringify(c.v), c.f ? '= ' + c.f : '', c.F ? 'array:' + c.F : '')
    else console.log(Object.entries(sheet.cells).filter(([a]) => ['C14','C15','F3','G3','H3','I3','J3','K3','L3','M3','N3','O3','P3','G17','G18','G19','G20','I23','E28','E29','H28','J28','L28'].includes(a)).map(([a,c]) => `${a}: ${c.v} ${c.f || ''}`).join('\n'))
  }
}
