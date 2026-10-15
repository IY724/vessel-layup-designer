import { CFB } from 'xlsx'

export interface ChartSeries {
  name: string
  color: string
  xFormula: string
  yFormula: string
  x: Array<number | string>
  y: number[]
  dash?: boolean
  marker?: boolean
}
export interface NativeChart {
  sheetId: number
  title: string
  kind: 'scatter' | 'bar'
  xTitle?: string
  yTitle: string
  xMin?: number
  xMax?: number
  yMax?: number
  series: ChartSeries[]
  from: { col: number; row: number }
  to: { col: number; row: number }
}
const NS = 'http://schemas.openxmlformats.org'
const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const esc = (s: string | number) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const color = (hex: string) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`
const font = '<a:latin typeface="微软雅黑"/><a:ea typeface="微软雅黑"/>'
const textProperties = `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100">${color('344655')}${font}</a:defRPr></a:pPr><a:endParaRPr lang="zh-CN"/></a:p></c:txPr>`
function title(text: string, size = 1400) {
  return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr/><a:r><a:rPr lang="zh-CN" sz="${size}">${color('243746')}${font}</a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></c:rich></c:tx><c:layout/><c:overlay val="0"/></c:title>`
}
function numericRef(formula: string, values: Array<number | string>) {
  return `<c:numRef><c:f>${esc(formula)}</c:f><c:numCache><c:formatCode>0.00</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache></c:numRef>`
}
function categoryRef(formula: string, values: Array<number | string>) {
  return `<c:strRef><c:f>${esc(formula)}</c:f><c:strCache><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef>`
}
function seriesXml(s: ChartSeries, i: number, kind: NativeChart['kind']) {
  if (s.x.length !== s.y.length || !s.y.length || !s.y.every(Number.isFinite)) throw new Error('图表数据长度或数值无效')
  if (kind === 'scatter' && !s.x.every((x) => typeof x === 'number' && Number.isFinite(x))) throw new Error('分布曲线必须使用数值半径轴')
  const base = `<c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx>`
  if (kind === 'bar') return `<c:ser>${base}<c:spPr>${color(s.color)}<a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/><c:cat>${categoryRef(s.xFormula, s.x)}</c:cat><c:val>${numericRef(s.yFormula, s.y)}</c:val></c:ser>`
  const line = s.marker ? '<a:ln><a:noFill/></a:ln>' : `<a:ln w="${s.dash ? 19050 : 28575}">${color(s.color)}${s.dash ? '<a:prstDash val="dash"/>' : ''}</a:ln>`
  const marker = s.marker ? `<c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr>${color(s.color)}<a:ln>${color(s.color)}</a:ln></c:spPr></c:marker>` : '<c:marker><c:symbol val="none"/></c:marker>'
  return `<c:ser>${base}<c:spPr>${line}</c:spPr>${marker}<c:xVal>${numericRef(s.xFormula, s.x)}</c:xVal><c:yVal>${numericRef(s.yFormula, s.y)}</c:yVal><c:smooth val="0"/></c:ser>`
}
function axis(id: number, cross: number, position: 'b' | 'l', category: boolean, label?: string, min?: number, max?: number) {
  const tag = category ? 'catAx' : 'valAx'
  return `<c:${tag}><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/>${max !== undefined ? `<c:max val="${max}"/>` : ''}${min !== undefined ? `<c:min val="${min}"/>` : ''}</c:scaling><c:delete val="0"/><c:axPos val="${position}"/>${position === 'l' ? `<c:majorGridlines><c:spPr><a:ln w="6350">${color('DFE6EB')}</a:ln></c:spPr></c:majorGridlines>` : ''}${label ? title(label, 1100) : ''}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525">${color('96A5B1')}</a:ln></c:spPr>${textProperties}<c:crossAx val="${cross}"/><c:crosses val="autoZero"/>${category ? '<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>' : '<c:crossBetween val="between"/>'}</c:${tag}>`
}
function chartXml(chart: NativeChart, index: number) {
  const x = 1000 + index * 2, y = x + 1
  const ser = chart.series.map((s, i) => seriesXml(s, i, chart.kind)).join('')
  const plot = chart.kind === 'bar'
    ? `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}<c:dLbls><c:numFmt formatCode="0.0" sourceLinked="0"/><c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls><c:gapWidth val="140"/><c:overlap val="0"/><c:axId val="${x}"/><c:axId val="${y}"/></c:barChart>`
    : `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${ser}<c:axId val="${x}"/><c:axId val="${y}"/></c:scatterChart>`
  return `${xmlHeader}<c:chartSpace xmlns:c="${NS}/drawingml/2006/chart" xmlns:a="${NS}/drawingml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><c:date1904 val="0"/><c:lang val="zh-CN"/><c:roundedCorners val="0"/><c:chart>${title(chart.title)}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}${axis(x, y, 'b', chart.kind === 'bar', chart.xTitle, chart.xMin, chart.xMax)}${axis(y, x, 'l', false, chart.yTitle, 0, chart.yMax)}</c:plotArea><c:legend><c:legendPos val="b"/><c:layout/><c:overlay val="0"/>${textProperties}</c:legend><c:plotVisOnly val="0"/><c:dispBlanksAs val="gap"/><c:showDLblsOverMax val="0"/></c:chart><c:spPr>${color('FFFFFF')}<a:ln w="9525">${color('CEDBE3')}</a:ln></c:spPr>${textProperties}</c:chartSpace>`
}
function anchorXml(chart: NativeChart, index: number) {
  const pos = (tag: string, p: { col: number; row: number }) => `<xdr:${tag}><xdr:col>${p.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${p.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:${tag}>`
  return `<xdr:twoCellAnchor editAs="oneCell">${pos('from', chart.from)}${pos('to', chart.to)}<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${index}" name="${esc(chart.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS}/drawingml/2006/chart"><c:chart xmlns:c="${NS}/drawingml/2006/chart" xmlns:r="${NS}/officeDocument/2006/relationships" r:id="rIdChart${index}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
}

/** 添加标准 OOXML 图表部件；曲线与工作表范围绑定，不是截图，也不依赖外部文件。 */
export function addNativeCharts(zip: ReturnType<typeof CFB.read>, charts: NativeChart[]) {
  const get = (path: string) => {
    const entry = CFB.find(zip, `/${path}`)
    return entry ? new TextDecoder().decode(entry.content as Uint8Array) : ''
  }
  const put = (path: string, xml: string) => CFB.utils.cfb_add(zip, `/${path}`, new TextEncoder().encode(xml))
  let contentTypes = get('[Content_Types].xml')
  charts.forEach((chart, i) => {
    const index = i + 1, drawing = `reportChart${index}`
    const sheetPath = `xl/worksheets/sheet${chart.sheetId}.xml`
    const sheet = get(sheetPath)
    if (!sheet || /<drawing\b/.test(sheet)) throw new Error('图表目标工作表不存在或已包含绘图')
    put(sheetPath, sheet.replace('</worksheet>', `<drawing r:id="rIdReportChart"/></worksheet>`))
    const relPath = `xl/worksheets/_rels/sheet${chart.sheetId}.xml.rels`
    const rel = `<Relationship Id="rIdReportChart" Type="${NS}/officeDocument/2006/relationships/drawing" Target="../drawings/${drawing}.xml"/>`
    const rels = get(relPath)
    put(relPath, rels ? rels.replace('</Relationships>', `${rel}</Relationships>`) : `${xmlHeader}<Relationships xmlns="${NS}/package/2006/relationships">${rel}</Relationships>`)
    put(`xl/drawings/${drawing}.xml`, `${xmlHeader}<xdr:wsDr xmlns:xdr="${NS}/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS}/drawingml/2006/main">${anchorXml(chart, index)}</xdr:wsDr>`)
    put(`xl/drawings/_rels/${drawing}.xml.rels`, `${xmlHeader}<Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rIdChart${index}" Type="${NS}/officeDocument/2006/relationships/chart" Target="../charts/chart${index}.xml"/></Relationships>`)
    put(`xl/charts/chart${index}.xml`, chartXml(chart, index))
    contentTypes = contentTypes.replace('</Types>', `<Override PartName="/xl/drawings/${drawing}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart${index}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`)
  })
  put('[Content_Types].xml', contentTypes)
}
