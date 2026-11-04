/** 论文式计算书的数据与正文。数值全部来自当前输入和共享计算内核。 */
import type { CheckResult, DesignInput } from '../core/types'
import { allowedLineTypes, computeVolume, intersectLineTypes, lambdaFromDepth, windingTurns } from '../core/geometry'
import { initialDesign } from '../core/initialDesign'
import { expansionAngles } from '../core/expansion'
import { layupGroups } from '../core/layup'

export type ReportFigure = 'line' | 'netting' | 'domeTheory' | 'contour' | 'thickness' | 'pressure'
export type ReportBlock =
  | { kind: 'heading'; text: string; level: 1 | 2 }
  | { kind: 'paragraph'; text: string }
  | { kind: 'equation'; tex: string; number: string }
  | { kind: 'table'; caption: string; head: string[]; rows: string[][] }
  | { kind: 'figure'; figure: ReportFigure; caption: string; height: number }

export interface ReportModel {
  title: string
  date: string
  blocks: ReportBlock[]
}

export const reportNumber = (n: number, digits = 3): string => Number.isFinite(n) ? n.toFixed(digits) : '无有效结果'
const f = reportNumber
const pass = (ok: boolean) => ok ? '满足' : '不满足'

/** 不以论文案例中的固定数值替代用户方案，也不把初估当作实际铺层。 */
export function buildReportModel(input: DesignInput, result: CheckResult, now = new Date()): ReportModel {
  const { geometry: g, material: m, strength: s, requirement: q } = input
  const { derived: d, cylinder: c, dome, head } = result
  const lambda = lambdaFromDepth(g.R, g.headShortAxis || g.R)
  const kf = g.headVolumeFactor ?? 0.8
  const vp = { R: g.R, l: g.cylLength, lambda, r0: d.r0, Kf: kf, linerThickness: g.linerThickness }
  const volume = computeVolume(vp)
  const turns = windingTurns(vp)
  const candidates = intersectLineTypes(vp, g.volumeL, allowedLineTypes(450, 660, 4))
  const initial = initialDesign(input)
  const groups = layupGroups(input.plan)
  const expansion = expansionAngles(g.R, d.r0, d.bandTotal)
  const blocks: ReportBlock[] = []
  const h = (text: string, level: 1 | 2 = 1) => blocks.push({ kind: 'heading', text, level })
  const p = (text: string) => blocks.push({ kind: 'paragraph', text })
  const e = (tex: string, number: string) => blocks.push({ kind: 'equation', tex, number })
  const t = (caption: string, head: string[], rows: string[][]) => blocks.push({ kind: 'table', caption, head, rows })
  const fig = (figure: ReportFigure, caption: string, height: number) => blocks.push({ kind: 'figure', figure, caption, height })

  h('1 设计条件与计算方法')
  p(`本方案针对目标容积 ${f(g.volumeL, 2)} L 的复合材料气瓶开展结构初步设计。先依据容积与纤维缠绕规律确定内衬尺寸及线型，再计算筒身缠绕层数，按扩孔角度安排铺层，最后分别进行筒身双向承载与封头校核。设计爆破压强取 ${f(d.pb, 2)} MPa。`)
  p('结构预设计需要同时满足容积、连续缠绕和承载要求。容积条件给出筒身半径与长度之间的关系；线型条件约束纤维往返后的落点；承载条件用于确定纤维用量。三者依次衔接，选定尺寸后再分配铺层，并用实际角度和层数重新进行强度校核。')
  p('缠绕层采用网格理论分析。其基本假设为：内压载荷由纤维承担，忽略内衬及树脂的承载贡献；纤维主要承受沿纤维方向的拉力，薄壁结构的弯曲应力不计；纤维连续、均匀并对称铺放，在理想受力过程中缠绕角保持不变。以下推导以薄膜力平衡为基础，不涉及层间应力与损伤演化。')
  t('表 1 设计条件', ['参数', '符号 / 单位', '当前取值'], [
    ['目标容积', 'V / L', f(g.volumeL, 2)], ['工作压力（记录值）', 'p / MPa', f(q.workingPressure, 2)],
    ['设计爆破压强', 'pb / MPa', f(d.pb, 2)], ['爆压输入方式', '-', q.pbMode === 'direct' ? '直接给定' : `工作压力 × ${f(q.safetyFactor, 3)}`],
    ['应力平衡系数', 'ks', f(q.ks)], ['筒身初算角', 'αref / °', f(input.constraint.alphaRef, 2)],
  ])
  if (q.pbMode === 'wp_sf') e(String.raw`p_{b}=p\cdot S`, '1-1')
  p(q.pbMode === 'wp_sf'
    ? `式中，p 为工作压力，S 为所采用的爆压倍率，pb 为参与层厚设计和强度判定的设计爆破压强。本方案代入 ${f(q.workingPressure, 2)} MPa 与 ${f(q.safetyFactor, 3)}，得到 pb = ${f(d.pb, 2)} MPa。`
    : `本方案直接给定 pb = ${f(d.pb, 2)} MPa。工作压力为工况记录值，厚度初算及后续强度比较均使用所给定的设计爆破压强。`)

  h('2 内衬尺寸与缠绕线型设计')
  h('2.1 容积与结构尺寸', 2)
  p(`封头采用椭圆回转曲面，筒身采用圆柱段。R 为内衬外半径，也是缠绕与强度计算的基准半径；封头外表面深度为 h，外表面轴比 λ = R/h。容积按内衬厚度 t 扣除后计算；两个封头的有效容积乘以折减系数 Kf = ${f(kf)}。以下长度以 mm 计，容积 V 以 mm³ 计，1 L = 10⁶ mm³。`)
  e(String.raw`h=\frac{R}{\lambda},\quad a=R-t,\quad b=\frac{R}{\lambda}-t`, '2-1')
  e(String.raw`V=\frac{4\pi}{3}K_{f} a^2 b+\pi a^2 l`, '2-2')
  e(String.raw`l=\frac{V-\frac{4\pi}{3}K_{f} a^2 b}{\pi a^2}`, '2-3')
  p('式中，l 为筒身段长度，a 为容积计算的径向半轴，b 为容积计算的封头轴向半轴。两个半椭球封头合为一个椭球，其理论容积为4πa²b/3；筒身段容积为πa²l。Kf 表示阀座等占用空间对封头有效容积的影响。当目标容积给定时，将筒身容积项移至等式一侧，即得长度反算式。')
  t('表 2 当前几何尺寸及容积分解', ['项目', '单位', '数值'], [
    ['内衬外半径 R', 'mm', f(g.R)], ['内衬外径 D = 2R', 'mm', f(2 * g.R)],
    ['筒身段长度 l', 'mm', f(g.cylLength)], ['封头外表面深度 h', 'mm', f(g.headShortAxis)],
    ['封头轴比 λ', '-', f(lambda)], ['缠绕极孔半径 r0', 'mm', f(d.r0)],
    ['内衬厚度 t', 'mm', f(g.linerThickness)], ['容积径向半轴 a = R−t', 'mm', f(g.R - g.linerThickness)],
    ['容积轴向半轴 b = h−t', 'mm', f(volume.b)], ['筒身段容积', 'L', f(volume.cylMm3 / 1e6)],
    ['两封头有效容积', 'L', f(volume.headMm3 / 1e6)], ['几何计算容积', 'L', f(volume.totalL)],
    ['计算容积与目标之差', 'L', f(volume.totalL - g.volumeL)],
  ])
  p(`代入当前尺寸，计算容积为 ${f(volume.totalL)} L，与目标容积相差 ${f(volume.totalL - g.volumeL)} L。容积驱动的线型候选按目标 ${f(g.volumeL, 2)} L 单独求解；下表同时列出候选尺寸与当前尺寸，尺寸取用后再进行后续铺层校核。`)
  h('2.2 测地线条件与芯模转角', 2)
  p('为保持纤维连续缠绕，采用测地线关系确定筒身起始缠绕角。导丝头单程转角由筒身段转角 γ 与封头段转角 β 组成；芯模转角 θn 对应导丝头往返一次。')
  p('测地线关系可写成 r·sinα = 常数。在纤维与极孔圆相切的位置，α = 90°，该常数等于缠绕极孔半径 r0；到达筒身交界处，平行圆半径变为R，因此筒身起始角由下式确定。缠绕角均相对于筒身轴向或封头局部经线方向定义。')
  e(String.raw`\alpha_{0}=\arcsin\frac{r_{0}}{R}`, '2-4')
  e(String.raw`\gamma=\frac{l\tan\alpha_{0}}{\pi D}\cdot360°`, '2-5')
  e(String.raw`\beta=2\left(90°+\arcsin\frac{h\tan\alpha_{0}-r_{0}}{R}\right)`, '2-6')
  e(String.raw`\theta_{n}=2(\gamma+\beta),\quad\theta=360°\left(m+\frac{K}{n}\right)`, '2-7')
  p('式中，D = 2R；γ 表示纤维通过筒身段时的芯模转角，β 表示封头段对应转角。n 为切点数，K 与n互质，m为整数，它们用于描述连续缠绕落点的周期关系。将容积关系得到的 l(D) 代入转角表达式，便可形成 θn = f(D) 的设计曲线，与允许转角求交后确定候选尺寸。')
  p(`当前尺寸下，起始缠绕角为 ${f(turns.alpha0Deg)}°，筒身段转角为 ${f(turns.gamma)}°，封头段转角为 ${f(turns.beta)}°，芯模转角为 ${f(turns.roundTrip)}°。将目标容积反算的 l(D) 代入转角关系，可得芯模转角随筒身直径变化的设计曲线；与允许线型转角求交后得到下列候选。n 为切点数，K 与 n 互质，m 为整数。`)
  fig('line', '图 1 筒身直径与芯模转角设计曲线', 83)
  t('表 3 目标容积对应的线型候选', ['θ / °', 'D / mm', 'l / mm', 'l/D', 'n', 'K / m'], candidates.length
    ? candidates.map(v => [f(v.theta, 0), f(v.D, 2), f(v.l, 2), f(v.ratio), String(v.n), `${v.K} / ${v.m}`])
    : [['-', '-', '-', '-', '-', '无有效交点']])

  h('3 缠绕材料与筒身初算')
  h('3.1 材料与工艺参数', 2)
  p('由线密度、纤维密度和单束带宽计算纤维单层厚度，再根据纤维体积含量换算复材单层厚度。总带宽用于扩孔候选与封头厚度计算，承载计算中的纤维厚度和复材厚度分别使用。')
  e(String.raw`t_{f}=\frac{tex}{\rho_{f} b},\quad t_{c}=\frac{t_{f}}{V_{f}},\quad b_{tot}=N_{s} b`, '3-1')
  p('式中，tex为纤维线密度，以g/m计；ρf为纤维密度，以g/cm³计；b为单束带宽，Ns为并纱束数，Vf为纤维体积含量。由单位长度纤维质量除以密度得到截面积，再除以带宽得到tf；加入树脂后的复材层厚为tc。此单位组合中的长度与质量换算相互抵消，计算所得厚度以mm计。')
  e(String.raw`\sigma_{sp}=\sigma_{hp}=\frac{\sigma_{NOL}}{V_{f}}k,\quad\sigma_{c}=\sigma_{sp}V_{f}`, '3-2')
  p('发挥强度表示本次承载估算采用的有效纤维方向强度。由NOL环拉伸强度换算时，k为强度损失系数，σsp与σhp分别表示螺旋及环向纤维发挥强度，σc表示复材层强度。若采用直接给定的发挥强度，则按给定值参与计算，不再额外乘以NOL损失系数。')
  if (s.mode === 'A') {
    p(`强度按环拉伸强度 ${f(s.sigmaNOL, 1)} MPa、体积含量 ${f(m.vf)} 和损失系数 ${f(s.kLoss)} 计算。螺旋与环向纤维发挥强度均为 ${f(d.sigmaSpiral)} MPa，封头所用复材层强度为 ${f(d.sigmaComposite)} MPa。`)
  } else {
    p(`强度采用直接给定方式：螺旋纤维发挥强度 ${f(d.sigmaSpiral)} MPa，环向纤维发挥强度 ${f(d.sigmaHoop)} MPa；复材层强度${s.sigmaCompositeDirect === null ? '由螺旋纤维发挥强度与体积含量相乘得到' : '直接给定'}，为 ${f(d.sigmaComposite)} MPa。`)
  }
  p('纤维厚度与发挥强度应配套使用，复材厚度与复材层强度也应配套使用。当σc = Vf·σsp时，tf·σsp = tc·σc，两种表达给出相同的单位宽度承载力。下文筒身初算采用tf与σsp、σhp，封头局部计算采用实际复材厚度与σc，以避免体积含量被重复计入。')
  t('表 4 材料与工艺参数', ['参数', '单位', '数值'], [
    ['纤维线密度 tex', 'g/m', f(m.tex)], ['纤维密度 ρf', 'g/cm³', f(m.fiberDensity)],
    ['单束带宽 b', 'mm', f(m.bandWidth)], ['并纱数量 Ns', '束', String(m.strandCount)],
    ['总带宽 btot', 'mm', f(d.bandTotal)], ['纤维体积含量 Vf', '-', f(m.vf)],
    ['纤维单层厚 tf', 'mm', f(d.tf, 6)], ['复材单层厚 tc', 'mm', f(d.tc, 6)],
    ['螺旋纤维发挥强度 σsp', 'MPa', f(d.sigmaSpiral)], ['环向纤维发挥强度 σhp', 'MPa', f(d.sigmaHoop)],
    ['复材层强度 σc', 'MPa', f(d.sigmaComposite)],
  ])
  h('3.2 筒身薄膜内力与纤维受力分解', 2)
  t('表 4a 筒身网格理论主要符号', ['符号', '物理意义', '单位'], [
    ['p，pb', '内压，设计爆破压强', 'MPa'], ['Nz，Nθ', '单位长度轴向、环向薄膜内力', 'N/mm'],
    ['α', '螺旋纤维与筒身轴向的夹角', '°'], ['hsp，hhp', '螺旋组、环向组的纤维总厚度', 'mm'],
    ['σsp，σhp', '螺旋、环向纤维发挥强度', 'MPa'], ['nsp，nhp', '螺旋、环向单层总数', '层'],
  ])
  p('取气瓶筒身端部截面，内压在圆形端面上的合力为pπR²，沿圆周分布的轴向薄膜力合力为2πR·Nz，两者平衡。再取长度为L的筒身半圆柱体，内压在直径平面上的投影合力为2pRL，两侧截面的环向薄膜力合力为2NθL。分别整理可得：')
  e(String.raw`p\pi R^{2}=2\pi R N_{z},\quad N_{z}=\frac{pR}{2}`, '3-3')
  e(String.raw`2pRL=2N_{\theta}L,\quad N_{\theta}=pR`, '3-4')
  p('因此，圆柱段环向薄膜内力为轴向的两倍。Nz与Nθ为单位长度上的力，不能直接当作纤维应力；还需要按厚度与方向将各纤维组的承载贡献换算为薄膜力。')
  fig('netting', '图 2 气瓶筒身段微元示意图', 55)
  p('对沿±α对称铺放的螺旋纤维，沿轴向和环向的承载分别按cos²α和sin²α分配。平方项同时包含纤维拉力的方向投影及穿过截面的纤维数量投影；正、负角组的剪切贡献相互抵消。90°环向组只提供环向承载，故平衡关系为：')
  e(String.raw`N_{z}=\sigma_{sp}h_{sp}\cos^{2}\alpha`, '3-5')
  e(String.raw`N_{\theta}=\sigma_{sp}h_{sp}\sin^{2}\alpha+\sigma_{hp}h_{hp}`, '3-6')
  p('在同种纤维且采用均衡变形近似时，可令两类纤维的应变相同，再由胡克定律得到等应力关系。弹性模量E在后续内力比中约去，层厚设计最终由所采用的发挥强度控制。若分别给定两类发挥强度，则在平衡方程中保留各自数值。')
  e(String.raw`\epsilon_{sp}=\epsilon_{hp}=\epsilon,\quad\sigma_{sp}=\sigma_{hp}=E\epsilon`, '3-7')
  h('3.3 层厚公式的推导与适用角度', 2)
  p('在螺旋与环向采用相同强度时，将式(3-6)除以式(3-5)，并代入Nθ/Nz = 2，可把受力平衡写成厚度比例。将环向层厚单独移至等式一侧，得到：')
  e(String.raw`\eta=\frac{N_{\theta}}{N_{z}}=\frac{h_{sp}\sin^{2}\alpha+h_{hp}}{h_{sp}\cos^{2}\alpha}=2`, '3-8')
  e(String.raw`\frac{h_{hp}}{h_{sp}}=2\cos^{2}\alpha-\sin^{2}\alpha=\cos^{2}\alpha(2-\tan^{2}\alpha)`, '3-9')
  p('令内压达到设计爆破压强pb，先从轴向平衡式求解螺旋纤维总厚度。再将其代入环向平衡式，由环向总需求减去螺旋组已提供的环向贡献，得到剩余环向纤维厚度。保留分方向强度后，两式为：')
  e(String.raw`h_{sp}=\frac{Rp_{b}}{2\sigma_{sp}\cos^{2}\alpha_{ref}}`, '3-10')
  e(String.raw`h_{hp}=\frac{p_{b}R-\sigma_{sp}h_{sp}\sin^{2}\alpha_{ref}}{\sigma_{hp}}`, '3-11')
  e(String.raw`h_{hp}=\frac{(2-\tan^{2}\alpha_{ref})Rp_{b}}{2\sigma_{hp}}`, '3-12')
  p('式(3-11)至式(3-12)的变化使用了sin²α/cos²α = tan²α。可见，螺旋层主要由轴向需求确定，环向层补足周向承载。为使环向初算厚度非负，应有tan²α ≤ 2；本单角度初算取0° < αref < 54.7356°。该上限来自此平衡模型，不代表多角度方案的最优缠绕角。')
  h('3.4 厚度换算、层数取整与当前代入', 2)
  p(`本次采用初算角 ${f(input.constraint.alphaRef, 2)}°。所求hsp、hhp为纤维总厚度，除以纤维单层厚tf得到理论单层数；相应的复材总厚度为层数乘以tc。螺旋组包含正、负角单层，按成对铺放要求向上取偶；环向组按单层向上取整数。`)
  e(String.raw`n_{sp}=\frac{h_{sp}}{t_{f}},\quad n_{hp}=\frac{h_{hp}}{t_{f}}`, '3-13')
  e(String.raw`n_{sp}^{sel}=2\operatorname{ceil}\left(\frac{n_{sp}}{2}\right),\quad n_{hp}^{sel}=\operatorname{ceil}(n_{hp})`, '3-14')
  e(String.raw`t_{sp}^{c}=n_{sp}^{sel}t_{c},\quad t_{hp}^{c}=n_{hp}^{sel}t_{c}`, '3-15')
  p('其中ceil表示向上取整数，上标sel表示取用层数，上标c表示复材厚度。取整会增加理论用量，但扩孔分配后的角度改变仍可能降低轴向承载，因此取整后的单角度方案与最终多角度方案应分别校核。')
  e(String.raw`h_{sp}=\frac{${f(g.R, 2)}\times${f(d.pb, 2)}}{2\times${f(d.sigmaSpiral, 3)}\times\cos^{2}(${f(input.constraint.alphaRef, 2)}°)}=${f(initial.estimate.hSpiral, 4)}\ \mathrm{mm}`, '3-16')
  t('表 5 单角度初算与取整结果', ['项目', '螺旋向', '环向'], [
    ['理论纤维厚度 / mm', f(initial.estimate.hSpiral), f(initial.estimate.hHoop)],
    ['理论层数', f(initial.estimate.nSpiral), f(initial.estimate.nHoop)],
    ['向上取整层数', String(initial.spiral), String(initial.hoop)],
    ['取整后单角度方案爆压 / MPa', f(initial.pa), f(initial.pth)],
    ['与设计爆压比较', pass(initial.pa >= d.pb), pass(initial.pth >= d.pb)],
  ])

  h('4 扩孔缠绕与铺层方案')
  p('单一小角度螺旋层会使较多纤维经过同一极孔邻域，造成局部厚度集中。扩孔缠绕将螺旋层分配给不同起铺平行圆，使较大角度的纤维组在较大半径处转向，从而改变封头厚度分布。扩孔增加角度后，cos²α减小、sin²α增大，轴向和环向承载会重新分配，因此需要重新核算。')
  p('为分散极孔附近的纤维堆积，逐步增大各螺旋组的缠绕极孔直径。扩孔候选由起始直径开始，每次增加一个总带宽，再由测地线关系反算缠绕角。实际写入铺层表时，角度按整度取值，后续校核使用表内实际角度。')
  e(String.raw`D_{i}=2r_{0}+i b_{tot},\quad\alpha_{i}=\arcsin\frac{D_{i}}{2R}`, '4-1')
  p('式中，i = 0、1、2…为扩孔序号，Di为候选起铺圆直径。每步增加一个总带宽，直到筒身直径边界；90°边界对应环向方向，不作为螺旋候选。候选角用于安排铺层，实际校核采用最终写入方案的整度角。')
  t('表 6 扩孔角度候选', ['序号', '极孔直径 / mm', '反算角 / °', '整度角 / °'], expansion.length
    ? expansion.map((v, i) => [String(i + 1), f(v.diameter, 2), f(v.angle, 4), v.boundary ? '筒身边界' : String(Math.round(v.angle))])
    : [['-', '-', '-', '无有效候选']])
  p(`当前方案按下表顺序铺放，参与计算的螺旋层合计 ${c.spiralLayers} 层、环向层合计 ${c.hoopLayers} 层，复材总厚度为 ${f(c.totalThickness)} mm。停用行保留在方案表中，承载与厚度汇总只计入启用且层数大于零的有效行。螺旋组的层数为正、负角单层的合计数。`)
  p('方案按缠绕先后顺序记录，螺旋与环向可交替铺放。以下网格理论按各组贡献求和，求和结果与行顺序无关；层间应力和工艺上的顺序效应仍需更细致的结构分析。自动分配采用初算总层数进行分组，给定设计方案则按其实际层数逐组计算。')
  t('表 7 当前有序铺层方案', ['顺序', '类型', '角度 / °', '层数', '组厚 / mm', '状态'], groups.map((v, i) => [
    String(i + 1), v.type === 'spiral' ? '螺旋' : '环向', f(v.angle, 2), String(v.layers), f(v.layers * d.tc), v.active === false ? '停用' : '启用',
  ]))

  h('5 筒身段强度校核')
  p('将每组铺层的轴向和环向爆压贡献逐项求和。螺旋组使用螺旋纤维发挥强度，环向组使用环向纤维发挥强度；环向组的角度以方案表实际值代入，90°时轴向贡献为零。两个方向均达到设计爆压时，筒身段校核满足要求。')
  e(String.raw`p_{z,i}=\frac{2n_{i} t_{f}\sigma_{i}\cos^2\alpha_{i}}{R}`, '5-1')
  e(String.raw`p_{\theta,i}=\frac{n_{i} t_{f}\sigma_{i}\sin^2\alpha_{i}}{R}`, '5-2')
  e(String.raw`p_{z}=\sum_{i} p_{z,i}\ge p_{b},\quad p_\theta=\sum_{i} p_{\theta,i}\ge p_{b}`, '5-3')
  p('式中，ni为第i组参与计算的单层总数，σi按该组类型取相应发挥强度。式(5-1)由Nz = pR/2反解压力得到，式(5-2)由Nθ = pR反解得到，因此轴向表达式多一个系数2。对90°环向组，cos90° = 0，故其轴向贡献为零。')
  e(String.raw`p_{\theta,90}=\frac{n_{90}t_{f}\sigma_{hp}}{R},\quad M_{z}=\frac{p_{z}}{p_{b}}-1,\quad M_{\theta}=\frac{p_{\theta}}{p_{b}}-1`, '5-4')
  p('Mz和Mθ分别为轴向、环向承载裕度。裕度为零表示恰好达到设计值，大于零表示该方向估算承载高于设计值；两个方向都满足才通过筒身校核。表中分别保留各组贡献，便于判断角度或层数变化对结果的影响。')
  const example = c.rows.find(row => row.type === 'spiral')
  if (example) {
    p(`以实际方案中的 ${f(example.angle, 2)}° 螺旋组为例，层数为 ${example.layers}，其轴向贡献按下式计算；同一组的环向贡献为 ${f(example.pthSum)} MPa。所有有效组均按相同方式计算后求和。`)
    e(String.raw`p_{z,i}=\frac{2\times${example.layers}\times${f(d.tf, 6)}\times${f(d.sigmaSpiral, 3)}\times\cos^{2}(${f(example.angle, 2)}°)}{${f(g.R, 2)}}=${f(example.paSum, 3)}\ \mathrm{MPa}`, '5-5')
  }
  t('表 8 各铺层组筒身承载贡献', ['序号', '类型', 'α / °', '层数', 'pz / MPa', 'pθ / MPa'], c.rows.map((v, i) => [String(i + 1), v.type === 'spiral' ? '螺旋' : '环向', f(v.angle, 2), String(v.layers), f(v.paSum), f(v.pthSum)]))
  t('表 9 筒身段校核结果', ['校核方向', '计算值 / MPa', '设计值 / MPa', '裕度 / %', '判定'], [
    ['轴向', f(c.pa), f(d.pb), f(c.paMargin * 100, 2), pass(c.paPass)], ['环向', f(c.pth), f(d.pb), f(c.pthMargin * 100, 2), pass(c.pthPass)],
  ])
  p(`当前铺层的轴向估算爆压为 ${f(c.pa)} MPa，环向估算爆压为 ${f(c.pth)} MPa，分别${c.paPass ? '达到' : '低于'}和${c.pthPass ? '达到' : '低于'}设计爆压。螺旋向复材厚度为 ${f(c.spiralThickness)} mm，环向复材厚度为 ${f(c.hoopThickness)} mm。`)

  h('6 封头厚度预测与强度校核')
  h('6.1 回转封头受力与厚度变化机理', 2)
  p('封头为回转曲面，其经线方向与平行圆方向的薄膜内力分别记为Nφ和Nθ，对应主曲率半径为Rφ和Rθ。在均布内压p作用下，薄壳法向平衡的一般形式为：')
  fig('domeTheory', '图 3 封头段纤维缠绕示意图', 72)
  e(String.raw`\frac{N_{\phi}}{R_{\phi}}+\frac{N_{\theta}}{R_{\theta}}=p`, '6-1')
  p('对称螺旋层在局部经线方向的夹角记为K(r)。与筒身的方向分解相同，局部纤维拉力按cos²K和sin²K分配到两个主方向。由于曲率与角度沿封头变化，局部厚度也随平行圆半径r变化，不能直接采用筒身常厚值。')
  e(String.raw`N_{\phi}=\sigma_{c}t(r)\cos^{2}K(r),\quad N_{\theta}=\sigma_{c}t(r)\sin^{2}K(r)`, '6-2')
  p('连续缠绕时，理想纤维用量在不同平行圆截面上保持一致。设第g组在筒身上的复材厚度为tR,g，其筒身缠绕角为αg，则纤维截面守恒及测地线条件分别给出：')
  e(String.raw`2\pi R t_{R,g}\cos\alpha_{g}=2\pi r t_{ideal,g}(r)\cos K_{g}(r)`, '6-3')
  e(String.raw`t_{ideal,g}(r)=t_{R,g}\frac{\sqrt{R^{2}-r_{0g}^{2}}}{\sqrt{r^{2}-r_{0g}^{2}}}`, '6-4')
  p('式中r0g = R·sinαg为该组的测地线极孔半径。随着r接近r0g，理想连续分布式的分母趋近于零，反映出极孔附近纤维密集的趋势。有限带宽、滑移和重新取向会改变实际分布，因此厚度预测进一步引入纱带几何覆盖，并在极孔邻域采用三次样条平滑。')
  h('6.2 有限带宽几何覆盖模型', 2)
  p('封头只计入启用的螺旋组。每组按其筒身缠绕角确定测地线极孔半径，并在两个总带宽处建立样条与几何覆盖关系。单循环厚度由三次多项式和覆盖公式分段给出，再乘以该组层数的一半，得到实际组厚度。')
  e(String.raw`r_{0g}=R\sin\alpha_{g},\quad r_{bg}=r_{0g}+b_{tot},\quad r_{2bg}=r_{0g}+2b_{tot}`, '6-5')
  e(String.raw`m_{R}=\frac{2\pi R\cos\alpha_{g}}{b_{tot}},\quad n_{R}=1,\quad t_{p}=t_{c}`, '6-6')
  p('rbg和r2bg分别表示距该组极孔一个、两个总带宽处的平行圆半径；mR为均匀覆盖条件下的等效纱片数，nR为单循环模型的计数系数，tp为单层纱带厚度。先按一个正、负角循环建立厚度模型，实际组层数随后换算为循环数。')
  e(String.raw`t_{in}(r)=\frac{m_{R}n_{R}t_{p}}{\pi}\arccos\frac{r_{0g}}{r},\quad r_{0g}\le r\le r_{bg}`, '6-7')
  e(String.raw`t_{cov}(r)=\frac{m_{R}n_{R}t_{p}}{\pi}\left(\arccos\frac{r_{0g}}{r}-\arccos\frac{r_{bg}}{r}\right),\quad r>r_{bg}`, '6-8')
  p('反余弦项表示纱带经过平行圆时所占的几何角域。在一个带宽以内使用单侧覆盖项，越过一个带宽后使用两个角域之差。该几何分布在一个带宽附近形成较尖的厚度峰值，采用平滑模型有助于表达纱带在极孔区域的重新分布。')
  h('6.3 三次样条边界条件与体积约束', 2)
  e(String.raw`t_{s}(r)=m_{1}+m_{2}r+m_{3}r^{2}+m_{4}r^{3}`, '6-9')
  p('四个样条系数由极孔边界厚度、两个带宽处的厚度连续条件、一阶导数连续条件和纤维体积守恒共同确定。体积约束对单循环厚度沿平行圆积分，求解后按实际循环数叠加。各组的实际分段半径及系数见表 10、表 11。')
  e(String.raw`t_{s}(r_{0g})=t_{p}n_{R},\quad t_{s}(r_{2bg})=t_{cov}(r_{2bg})`, '6-10')
  e(String.raw`t_{s}'(r_{2bg})=t_{cov}'(r_{2bg})`, '6-11')
  e(String.raw`t_{cov}'(r)=\frac{m_{R}n_{R}t_{p}}{\pi}\left(\frac{r_{0g}}{r\sqrt{r^{2}-r_{0g}^{2}}}-\frac{r_{bg}}{r\sqrt{r^{2}-r_{bg}^{2}}}\right)`, '6-12')
  p('前两个条件约束端点厚度，第三个条件约束衔接处的斜率，从而避免厚度曲线出现跳变或折角。第四个条件控制平滑前后的投影环带体积，保证平滑不是任意改变纤维用量。体积积分按2πr·dr对应的投影环带面积建立，与本次厚度计算形式一致。')
  e(String.raw`V_{const}=\int_{r_{0g}}^{r_{2bg}}2\pi r t_{s}(r)\,dr=V_{1}+V_{2}`, '6-13')
  e(String.raw`V_{1}=m_{R}n_{R}t_{p}\left(r_{bg}^{2}\arccos\frac{r_{0g}}{r_{bg}}-r_{0g}\sqrt{r_{bg}^{2}-r_{0g}^{2}}\right)`, '6-14')
  e(String.raw`V_{2}=\pi(r_{2bg}^{2}-r_{bg}^{2})t_{cov}(r_{2bg})`, '6-15')
  p('V1与V2构成用于确定样条函数的体积约束。将三次多项式代入式(6-13)并逐项积分，可把最后一个约束写成关于四个系数的线性方程：')
  e(String.raw`\Delta_{j}=r_{2bg}^{j}-r_{0g}^{j}`, '6-16')
  e(String.raw`\pi m_{1}\Delta_{2}+\frac{2\pi}{3}m_{2}\Delta_{3}+\frac{\pi}{2}m_{3}\Delta_{4}+\frac{2\pi}{5}m_{4}\Delta_{5}=V_{const}`, '6-17')
  p('由两个端点值、一个端点导数和一个积分条件构成四元一次方程组，求得m1至m4。r以mm计时，各项m1、m2r、m3r²、m4r³均为mm；系数的量纲依次为mm、1、mm⁻¹和mm⁻²。这样得到的多项式既具有确定的衔接条件，也保留了所设定的体积约束。')
  h('6.4 厚度分段、实际循环数与分组叠加', 2)
  p('以表 10 中的分段半径 rs 选择厚度函数，负值取零，再按循环数叠加：')
  e(String.raw`t(r)=\max(0,t_{s}(r)),\quad r\le r_{s}`, '6-18a')
  e(String.raw`t(r)=\max(0,t_{cov}(r)),\quad r>r_{s}`, '6-18b')
  e(String.raw`t_{g}(r)=\frac{n_{g}}{2}t(r),\quad t_{total}(r)=\sum_{g} t_{g}(r)`, '6-19')
  p('ng为该螺旋组正、负角单层的合计数，ng/2为实际循环数；环向组不计入封头厚度。rs为样条段与覆盖段的衔接半径，各组取值列于表10。各组起铺圆均由实际缠绕角反算，厚度在共同的平行圆半径位置求值，再按式(6-19)叠加。')
  t('表 10 封头分组计算参数', ['α / °', '层数', 'r0 / mm', 'r2b / mm', '分段 / mm', 'Vconst / mm³'], dome.groups.map(v => [f(v.angle, 2), String(v.layers), f(v.r0), f(v.r2b), f(v.splineEndRadius), f(v.Vconst, 2)]))
  t('表 11 三次样条系数（r 以 mm 计）', ['α / °', 'm1', 'm2', 'm3', 'm4'], dome.groups.map(v => [f(v.angle, 2), ...v.m.map(n => n.toExponential(9))]))
  if (dome.failedGroups.length) p(`以下螺旋组未能建立有效封头模型：${dome.failedGroups.map(v => `${v.angle}°：${v.reason}`).join('；')}。封头计算不完整，不能据此判定满足要求。`)
  fig('contour', '图 4 封头铺层厚度轮廓', 86)
  fig('thickness', '图 5 封头总厚度分布', 80)
  const maxT = dome.profile.reduce((best, v) => v.tTotal > best.tTotal ? v : best, { r: 0, tTotal: 0 })
  p(`按当前半径点计算，封头总厚度最大值为 ${f(maxT.tTotal)} mm，位于平行圆半径 ${f(maxT.r)} mm 处；赤道处总厚度为 ${f(dome.tAtR)} mm，筒身螺旋层厚度为 ${f(c.spiralThickness)} mm，两者差值为 ${f(result.consistency.diff)} mm。`)
  h('6.5 封头经验承载估算与局部分布', 2)
  p('封头经验承载估算采用筒身各螺旋组的轴向承载贡献乘以应力平衡系数 ks。局部爆压分布则使用各平行圆的实际厚度、复材层强度及局部缠绕角计算，两者分别列示。局部曲线用于观察不同半径处的变化，不以曲线单点代替整瓶爆破试验结果。')
  e(String.raw`p_{H}=k_{s}\sum_{g}\frac{2n_{g} t_{f}\sigma_{sp}\cos^{2}\alpha_{g}}{R}`, '6-20')
  e(String.raw`K_{g}(r)=\arcsin\frac{r_{0g}}{r},\quad p_{g}(r)=\frac{2t_{g}(r)\sigma_{c}\cos^{2}K_{g}(r)}{R}`, '6-21')
  p('局部角与承载贡献在 r ≥ r0g 的覆盖区计算；r < r0g 时该组爆压贡献为零。')
  e(String.raw`p_{local}(r)=k_{s}\sum_{g} p_{g}(r)`, '6-22')
  p('局部爆压由几何覆盖与样条得到的厚度、复材层强度及局部角共同决定。ks为封头应力平衡系数，在各组局部贡献相加后统一乘入；采用NOL换算时的强度损失已包含在σc内，不再重复相乘。')
  p('经验承载式使用各组筒身角与总层数，给出整体初估；局部式使用随半径变化的角度和厚度，用于识别分布特征。同一方案中两者通常不同，判断时分别列示，不能由某一位置的局部值直接推断整瓶实际爆破压力。')
  t('表 12 封头校核与分布特征', ['项目', '计算值', '结果'], [
    ['经验估算爆压 / MPa', f(head.pressure), pass(head.pass && !dome.failedGroups.length)],
    ['设计爆破压强 / MPa', f(d.pb), '-'],
    ['局部曲线最小值 / MPa', f(dome.minP), `r = ${f(dome.minPR)} mm`],
    ['局部曲线最大值 / MPa', f(dome.maxP), `r = ${f(dome.maxPR)} mm`],
    ['赤道处局部爆压 / MPa', f(dome.profile[dome.profile.length - 1]?.pTotal ?? NaN), `r = ${f(g.R)} mm`],
    ['封头模型失败组数', String(dome.failedGroups.length), dome.failedGroups.length ? '计算不完整' : '计算完成'],
  ])
  fig('pressure', '图 6 封头局部爆破压强分布', 82)
  p(`当前封头经验估算爆压为 ${f(head.pressure)} MPa，${head.pass ? '达到' : '低于'}设计爆压 ${f(d.pb)} MPa。局部分布最小值为 ${f(dome.minP)} MPa，对应半径为 ${f(dome.minPR)} mm；该数值与经验承载估算分别反映局部厚度分布和整体初估，不能互相替用。`)

  h('7 设计结果')
  const complete = dome.failedGroups.length === 0 && dome.groups.length > 0
  const overall = c.paPass && c.pthPass && head.pass && complete && !result.diagnoses.some(v => v.level === 'error')
  p(`本方案采用 ${c.spiralLayers} 层螺旋缠绕与 ${c.hoopLayers} 层环向缠绕，筒身复材总厚度为 ${f(c.totalThickness)} mm。筒身轴向、环向和封头经验承载估算分别为 ${f(c.pa)}、${f(c.pth)} 和 ${f(head.pressure)} MPa。按设计爆破压强 ${f(d.pb)} MPa 比较，当前方案${overall ? '满足本次网格理论初步校核要求' : '尚未满足本次初步校核的全部要求，需根据未满足项目调整方案后重新计算'}。`)
  t('表 13 设计结果汇总', ['项目', '结果'], [
    ['筒身双向强度校核', pass(c.paPass && c.pthPass)], ['封头经验强度校核', pass(head.pass && complete)],
    ['封头厚度模型', complete ? '全部有效螺旋组完成计算' : '缺少有效组或存在计算失败'],
    ['铺层总数 / 层', String(c.spiralLayers + c.hoopLayers)], ['筒身总厚度 / mm', f(c.totalThickness)],
  ])
  const issues = result.diagnoses.filter(v => v.level !== 'ok')
  if (issues.length) {
    t('表 14 当前方案待核对项目', ['状态', '检查结果'], issues.map(v => [v.level === 'error' ? '需处理' : '需核对', v.text]))
  }
  p('上述结果为基于当前输入参数的结构预设计与承载估算。整瓶实际爆破压力、损伤演化及使用性能仍需通过相应的有限元分析和试验确定。')

  return {
    title: '复合材料气瓶结构设计计算书',
    date: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }), blocks,
  }
}
