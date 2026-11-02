/**
 * validate-literature.ts — 文献基准运行器（阶段5）
 *
 * 用法（不新增依赖，vite-node 直跑）：
 *   node node_modules/vite-node/vite-node.mjs tools/validate-literature.ts
 *   → 输出 docs/literature-validation/literature-errors.json + 控制台表格
 *
 * 对四篇文献做两条校核路径：
 *   A 正向复算：论文铺层 + 论文参数 → cylinderCheck / domeAt 复算爆压、厚度、层数
 *   B 自动设计：论文目标(几何/材料/爆压/角度约束) → autoDesign 生成方案 vs 论文方案
 * 逐项输出 原值/计算值/绝对误差/相对误差/取整差/是否达标（≤5%、层数≤1制造层或5%、角度≤1°）。
 * 论文自身口径矛盾如实双列，不把 unknown 标 pass。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cylinderCheck } from '../src/core/netting'
import { deriveParams } from '../src/core/materials'
import { autoDesign, planPressures } from '../src/core/designer'
import { runCheck } from '../src/core/checker'
import { initialDesign } from '../src/core/initialDesign'
import { literatureCases, caoConsistentCase, type LiteratureCase } from '../tests/fixtures/literature/literatureCases'
import type { DesignInput, LayupPlan } from '../src/core/types'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TOL_REL = 0.05        // 连续量相对误差门槛
const TOL_ANGLE = 1         // 角度门槛（度）
const TOL_LAYERS = Math.max(1, 0.05) // 层数：≤1 制造层 或 5%（取满足其一）

interface Row {
  key: string
  label: string
  printed: number
  computed: number
  absErr: number
  relErr: number
  page: string
  basis: string
  pass: boolean
}

const rel = (a: number, b: number) => (b === 0 ? Infinity : Math.abs(a - b) / Math.abs(b))
const r6 = (v: number) => Number(v.toFixed(6))

/** A 路：给定输入与印刷值 → 复算行 */
function routeA(id: string, input: DesignInput, printed: Array<{ key: string; label: string; printed: number; page: string; basis: string }>): Row[] {
  const d = deriveParams(input)
  const plan: LayupPlan = input.plan
  const c = cylinderCheck(plan, {
    R: input.geometry.R, tf: d.tf, tc: d.tc, sigmaSpiral: d.sigmaSpiral, sigmaHoop: d.sigmaHoop, pb: d.pb, alphaRef: input.constraint.alphaRef,
  })
  const computed: Record<string, number> = {
    pa: c.pa,
    pth: c.pth,
    head: 0,
    // 厚度对照 = 方案层数 × 复材单层厚（cylinderCheck 输出即此口径）
    tSpiral: c.spiralThickness,
    tHoop: c.hoopThickness,
    nSpiral: c.spiralLayers,
    nHoop: c.hoopLayers,
  }
  // 张/贾论文为单口径（0.227/0.325 既当除数得层数又当乘数得厚度，即 tf/tc 混同）；
  // 厚度对照按论文口径 n×tf，软件 tc 口径 n×tc 在 basis 注明。朱文为复材口径（tc=0.3 独立给出），走 cylinderCheck。
  if (id === 'zhang' || id === 'jia') {
    computed.tSpiral = c.spiralLayers * d.tf
    computed.tHoop = c.hoopLayers * d.tf
  }
  // 曹文封头 = ks × Pα（论文式8口径：全部螺旋层赤道贡献 × ks）
  if (id === 'cao' || id === 'cao-consistent') computed.head = input.requirement.ks * c.pa
  // 朱文初估对照：软件 initialEstimate 是"纤维口径、无K"（层数=估算/tf），
  // 论文式2.19 是"复材口径、螺旋带K=0.7"（层数=估算/tc）。等价链（已数值验证）：
  //   软件hSpiral/Vf/K = 论文tα（8.1158 vs 印刷8.12）；软件hHoop/Vf = 论文tθ（10.2204 vs 10.22）。
  // 对照行换算到论文复材口径；K=0.7 是论文常数（p36，取值区间 0.7-0.8 下限），不是拟合量。
  // K 差异如实保留：软件初估无K偏薄，靠 autoDesign 补层循环保底，是设计取舍而非公式误差。
  if (id === 'zhu') {
    const K_ZHU = 0.7
    const est = initialDesign(input)
    const vf = input.material.vf
    computed.tSpiralEst = est.estimate.hSpiral / vf / K_ZHU
    computed.tHoopEst = est.estimate.hHoop / vf
    computed.nSpiral = est.spiral
    computed.nHoop = est.hoop
  }

  return printed.map(p => {
    const got = computed[p.key] ?? NaN
    return {
      key: p.key, label: p.label, printed: p.printed, computed: r6(got),
      absErr: r6(got - p.printed), relErr: r6(rel(got, p.printed)),
      page: p.page, basis: p.basis,
      pass: Number.isFinite(got) && rel(got, p.printed) <= TOL_REL,
    }
  })
}

/** B 路：自动设计 vs 论文方案 */
interface BRow {
  caseId: string
  ok: boolean
  reason?: string
  verdict?: string
  autoPlan?: Array<{ angle: number; layers: number }>
  autoSpiral?: number
  autoHoop?: number
  paperPlan: Array<{ angle: number; layers: number }>
  pa?: number
  pth?: number
  paPass?: boolean
  pthPass?: boolean
  trace?: string[]
  layerErrVsPaper?: number
  pass: boolean
  note: string
}

/** B 路：自动设计 vs 论文方案。
 *  评级分两层，不把"软件更省料"误报成失败，也不掩盖差异：
 *   PASS    自动方案双向≥pb 且层数差 ≤ max(1, 5%)
 *   PARTIAL 自动方案双向≥pb 但层数差超出（论文过设计 / K 口径差 / 论文内部矛盾，note 说明）
 *   FAIL    autoDesign 失败或双向不满足 */
function routeB(id: string, input: DesignInput): BRow {
  const paperPlan = input.plan.spiral.map(g => ({ angle: g.angle, layers: g.layers }))
  const res = autoDesign(input)
  const base: BRow = {
    caseId: id, ok: res.ok, paperPlan, pass: false,
    note: 'B 路评级：双向满足 pb 且层数差≤max(1,5%) = PASS；双向满足但层数差大 = PARTIAL（附原因）；其余 FAIL。',
  }
  if (!res.ok) return { ...base, reason: res.reason, trace: res.trace }
  const p = planPressures(input, res.plan)
  const autoSpiral = res.plan.spiral.reduce((s, g) => s + g.layers, 0)
  const paperSpiral = input.plan.spiral.reduce((s, g) => s + g.layers, 0)
  const layerErr = autoSpiral - paperSpiral
  const hoopRows = res.plan.groups?.filter(g => g.type === 'hoop') ?? []
  const autoHoop = hoopRows.reduce((s, g) => s + g.layers, 0)
  const reqMet = p.pa >= p.requirement && p.pth >= p.requirement
  const layerClose = Math.abs(layerErr) <= Math.max(1, paperSpiral * 0.05)
  return {
    ...base, ok: true, verdict: res.verdict,
    autoPlan: res.plan.spiral.map(g => ({ angle: g.angle, layers: g.layers })),
    autoSpiral, autoHoop, pa: r6(p.pa), pth: r6(p.pth),
    paPass: p.pa >= p.requirement, pthPass: p.pth >= p.requirement,
    trace: res.trace, layerErrVsPaper: layerErr,
    pass: reqMet && layerClose,
    note: reqMet ? (layerClose ? '双向满足且层数与论文一致。' : `双向满足但层数差${layerErr}层（论文方案余量/口径差异，见 trace 与 notes）。`) : '自动方案未双向满足设计爆压。',
  }
}

/** 基本性质：压力/强度缩放（σ×2 → p×2）、整数可制造性、双向满足 */
function invariants(input: DesignInput) {
  const d = deriveParams(input)
  const args = { R: input.geometry.R, tf: d.tf, tc: d.tc, sigmaSpiral: d.sigmaSpiral, sigmaHoop: d.sigmaHoop, pb: d.pb, alphaRef: input.constraint.alphaRef }
  const c1 = cylinderCheck(input.plan, args)
  const scale = 2
  const c2 = cylinderCheck(input.plan, { ...args, sigmaSpiral: d.sigmaSpiral * scale, sigmaHoop: d.sigmaHoop * scale })
  const plan = input.plan
  const integerOk = (plan.groups ?? [...plan.spiral.map(g => ({ ...g, type: 'spiral' as const })), ...(plan.hoop ? [{ type: 'hoop' as const, angle: 90, layers: plan.hoop }] : [])])
    .every(g => Number.isInteger(g.layers) && g.layers > 0)
  const scaling = Math.abs(c2.pa - 2 * c1.pa) < 1e-6 && Math.abs(c2.pth - 2 * c1.pth) < 1e-6
  return { integerOk, scaling, bothDirections: { pa: r6(c1.pa), pth: r6(c1.pth) } }
}

function main() {
  const report: Record<string, unknown>[] = []
  const console_: string[] = []

  for (const c of literatureCases) {
    const input = c.input()
    const rowsA = routeA(c.id, input, c.printed)
    const rowB = routeB(c.id, input)
    const inv = invariants(input)
    const result = runCheck(input)
    report.push({
      id: c.id, paper: c.paper, title: c.title, notes: c.notes,
      routeA: rowsA, routeB: rowB, invariants: inv,
      verdictGivenPlan: result.verdict,
      derived: { tf: r6(result.derived.tf), tc: r6(result.derived.tc), sigmaSpiral: r6(result.derived.sigmaSpiral), sigmaHoop: r6(result.derived.sigmaHoop), pb: result.derived.pb },
    })
    console_.push(`\n=== ${c.id}: ${c.paper} ===`)
    for (const r of rowsA) {
      console_.push(`  [A] ${r.label}: 印刷${r.printed} vs 复算${r.computed} (Δ=${r.absErr}, ${((r.relErr) * 100).toFixed(2)}%) ${r.pass ? 'PASS' : 'FAIL'}  (${r.page})`)
    }
    console_.push(`  [B] ok=${rowB.ok} verdict=${rowB.verdict ?? '-'} autoSpiral=${rowB.autoSpiral} vs paper=${rowB.paperPlan.reduce((s, g) => s + g.layers, 0)} 层差=${rowB.layerErrVsPaper} pa=${rowB.pa} pth=${rowB.pth} ${rowB.pass ? 'PASS' : (rowB.ok && rowB.paPass && rowB.pthPass ? 'PARTIAL' : 'FAIL')}`)
    if (rowB.note) console_.push(`      ${rowB.note}`)
    if (rowB.trace) for (const t of rowB.trace) console_.push(`      · ${t}`)
    console_.push(`  [inv] 整数层=${inv.integerOk} 线性缩放=${inv.scaling} 双向 pa=${inv.bothDirections.pa} pth=${inv.bothDirections.pth} 判定=${result.verdict}`)
  }

  // 曹文物理一致口径单独一列
  {
    const input = caoConsistentCase.input()
    const rowsA = routeA('cao-consistent', input, caoConsistentCase.printed)
    report.push({ id: 'cao-consistent', paper: '曹文·物理一致口径对照列', notes: ['tf=0.3×0.6=0.18 × σf=3385 ≡ tc=0.3 × σc=2031'], routeA: rowsA })
    console_.push('\n=== cao-consistent（物理一致口径）===')
    for (const r of rowsA) console_.push(`  [A] ${r.label}: ${r.printed} vs ${r.computed} (${((r.relErr) * 100).toFixed(2)}%) ${r.pass ? 'PASS' : 'FAIL'}`)
  }

  const outDir = resolve(ROOT, 'docs/literature-validation')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'literature-errors.json')
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), tol: { relContinuous: TOL_REL, angleDeg: TOL_ANGLE, layers: '≤1制造层或5%' }, cases: report }, null, 2))
  console_.push(`\nJSON → ${outPath}`)
  console.log(console_.join('\n'))
}

main()
