/**
 * design_case.ts — 设计案例：用网站同一套内核代码走完整设计流程，导出与界面「导出 Excel」字节一致的 .xlsx
 *
 * 运行：npx vite-node tools/design_case.ts
 * 产物：output/design_case/{case.json, 案例-0参考铺层.xlsx, 案例-A自动生成.xlsx, 案例-B定稿.xlsx}
 *
 * 流程与界面一一对应：
 *   ① 几何页「容积与尺寸互算」：已知容积 140 L → 反算筒身长度 l
 *   ② 几何页「线型切点设计」：由几何算单程/双程转角
 *   ③ 左栏参数 → 派生 t_f / t_c / σ_c / p_b
 *   ④ 铺层表录入课件参考铺层（10/17/25/37/40/45° × 4/4/4/2/2/2 + 环向 23）→ 校核（方案 0，用来与原表逐格对账）
 *   ⑤ 「自动生成」→ 方案 A 并校核
 *   ⑥ 按诊断调整 → 方案 B 定稿（37° 组 2→6 层、环向 23→21 层）
 *   ⑦ 「导出 Excel」（workbookBytes，与按钮同一函数）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultInput, courseInput } from '../src/core/presets'
import { runCheck } from '../src/core/checker'
import { autoDesign } from '../src/core/designer'
import { domeAt } from '../src/core/dome'
import { computeVolume, geometryChecks, solveGeometry, windingTurns, matchLineType, type VolumeParams } from '../src/core/geometry'
import { workbookBytes } from '../src/export/excel'
import type { CheckResult, DesignInput } from '../src/core/types'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../output/design_case')
mkdirSync(OUT, { recursive: true })

// ── ① 容积与尺寸互算 ──────────────────────────────────────────────────────────
const base = defaultInput()
const R = base.geometry.R // 173.5
const vp0: VolumeParams = { R: R, l: 800, lambda: R / base.geometry.headShortAxis, r0: base.geometry.r0Winding, Kf: 0.8, linerThickness: base.geometry.linerThickness }
const geo = solveGeometry(vp0, 'l', 140)
const vp = geo.params
const vol = computeVolume(vp)
const turns = windingTurns(vp)
const lineType = matchLineType(turns.roundTrip)
const geoHints = geometryChecks(vp)

// ── ③ 设计输入（左栏） ─────────────────────────────────────────────────────────
const designInput: DesignInput = {
  ...base,
  geometry: { ...base.geometry, cylLength: Number(vp.l.toFixed(1)), volumeL: 140 },
}

// ── ④ 课件参考铺层（与原表同一铺层，逐格对账用） ───────────────────────────
const refInput: DesignInput = {
  ...designInput,
  constraint: courseInput().constraint,
  plan: {
    spiral: [
      { angle: 10, layers: 4 },
      { angle: 17, layers: 4 },
      { angle: 25, layers: 4 },
      { angle: 37, layers: 2 },
      { angle: 40, layers: 2 },
      { angle: 45, layers: 2, splineEndRadius: 163 },
    ],
    hoop: 23,
  },
}
const refRes = runCheck(refInput)

// ── ⑤ 自动生成 ─────────────────────────────────────────────────────────────────
const auto = autoDesign({ ...designInput, plan: { spiral: [], hoop: 0 } })
if (!auto.ok) throw new Error(`自动生成失败：${auto.reason}`)
const autoInput: DesignInput = { ...designInput, plan: auto.plan }
const autoRes = runCheck(autoInput)

// ── ⑥ 定稿：在参考铺层上加 37° 组 4 层、环向减 2 层 ───────────────────────
const finalInput: DesignInput = {
  ...refInput,
  plan: {
    spiral: refInput.plan.spiral.map((g) => (g.angle === 37 ? { ...g, layers: 6 } : g)),
    hoop: 21,
  },
}
const finalRes = runCheck(finalInput)

// ── ⑦ 导出 ─────────────────────────────────────────────────────────────────────
writeFileSync(resolve(OUT, '案例-0参考铺层.xlsx'), await workbookBytes(refInput, refRes))
writeFileSync(resolve(OUT, '案例-A自动生成.xlsx'), await workbookBytes(autoInput, autoRes))
writeFileSync(resolve(OUT, '案例-B定稿.xlsx'), await workbookBytes(finalInput, finalRes))

// 原课程表封头网格：30.2、32、33 … 173、173.5
const excelGrid = [30.2, ...Array.from({ length: 142 }, (_v, i) => 32 + i), 173.5]

function dump(input: DesignInput, res: CheckResult) {
  const d = res.derived
  const g = input.geometry
  return {
    plan: input.plan,
    derived: d,
    head: res.head,
    cylinder: {
      rows: res.cylinder.rows,
      pa: res.cylinder.pa,
      pth: res.cylinder.pth,
      spiralThickness: res.cylinder.spiralThickness,
      hoopThickness: res.cylinder.hoopThickness,
      totalThickness: res.cylinder.totalThickness,
      estimate: res.cylinder.estimate,
    },
    dome: {
      groups: res.dome.groups,
      rFirst: res.dome.rFirst,
      rFull: res.dome.rFull,
      minP: res.dome.minP,
      minPR: res.dome.minPR,
      minPAll: res.dome.minPAll,
      tAtR: res.dome.tAtR,
      pAtR: res.dome.profile[res.dome.profile.length - 1].pTotal,
      weakZones: res.dome.weakZones,
      pass: res.dome.pass,
      atExcelGrid: excelGrid.map((r) => {
        const p = domeAt(res.dome.groups, r, g.R, d.sigmaComposite, input.requirement.ks)
        return { r, tTotal: p.tTotal, pSum: p.pSum, pTotal: p.pTotal, tGroups: p.tGroups, pGroups: p.pGroups }
      }),
    },
    verdict: res.verdict,
    advice: { kind: res.advice.kind, text: res.advice.text, variants: res.advice.variants },
    weight: res.weight,
    consistency: res.consistency,
  }
}

const out = {
  geometry: { input: vp0, solved: vp, solvedText: geo.solved, ok: geo.ok, volume: vol, turns, lineType, hints: geoHints },
  requirement: designInput.requirement,
  material: designInput.material,
  strength: designInput.strength,
  constraint: designInput.constraint,
  auto: { trace: auto.trace, autoVerdict: auto.verdict, ...dump(autoInput, autoRes) },
  reference: dump(refInput, refRes),
  final: dump(finalInput, finalRes),
}
writeFileSync(resolve(OUT, 'case.json'), JSON.stringify(out, null, 2), 'utf8')
// 浏览器导出脚本（export_cases_browser.mjs）用它注入 localStorage，生成带插图的案例计算书
writeFileSync(resolve(OUT, 'inputs.json'), JSON.stringify({ reference: refInput, auto: autoInput, final: finalInput }, null, 2), 'utf8')

console.log('l =', vp.l.toFixed(2), 'mm; V =', vol.totalL.toFixed(3), 'L; θn =', turns.roundTrip.toFixed(2))
console.log('auto plan:', JSON.stringify(auto.plan), 'verdict', autoRes.verdict, 'pa', autoRes.cylinder.pa.toFixed(2), 'pth', autoRes.cylinder.pth.toFixed(2), 'domeMin', autoRes.dome.minP.toFixed(2))
console.log('ref verdict', refRes.verdict, 'pa', refRes.cylinder.pa.toFixed(4), 'pth', refRes.cylinder.pth.toFixed(4), 'domeMin', refRes.dome.minP.toFixed(3), '@', refRes.dome.minPR.toFixed(2))
console.log('final verdict', finalRes.verdict, 'pa', finalRes.cylinder.pa.toFixed(4), 'pth', finalRes.cylinder.pth.toFixed(4), 'domeMin', finalRes.dome.minP.toFixed(3), '@', finalRes.dome.minPR.toFixed(2))
console.log('written to', OUT)
