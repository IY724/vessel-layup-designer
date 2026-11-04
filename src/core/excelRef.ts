/**
 * excelRef.ts — 公式清单（只讲"算什么"，不出现任何内部对账 / 验证语言）
 *
 * 每条：label 项目名、formula 公式（LaTeX 子集，界面用 <Tex> 渲染成 MathML）、purpose 一句话作用。
 */

export interface FormulaRow {
  /** 名称（界面显示） */
  label: string
  /** 公式（LaTeX 子集，界面用 Tex 渲染） */
  formula: string
  /** 作用：这个公式算什么 */
  purpose: string
}

export const FORMULAS: FormulaRow[] = [
  // ── 材料与工艺 ──
  { label: '纤维单层厚 t_f', formula: 't_f=\\dfrac{tex}{\\rho_{f}\\cdot b}', purpose: '由线密度、纤维密度与带宽换算单层纤维厚度' },
  { label: '复材单层厚 t_c', formula: 't_c=\\dfrac{t_f}{V_f}', purpose: '单层纤维厚除以体积含量，得含树脂的单层厚度' },

  // ── 筒身 ──
  { label: '单层纵向爆压贡献', formula: 'p_{\\alpha i}=\\dfrac{2\\,t_f\\,\\sigma_{\\text{螺旋}}\\cos^2\\alpha}{R}', purpose: '一根螺旋纤维层对筒身纵向爆破压强的贡献' },
  { label: '单层环向爆压贡献', formula: 'p_{\\theta i}=\\dfrac{t_f\\,\\sigma_{\\text{螺旋}}\\sin^2\\alpha}{R}', purpose: '一根螺旋纤维层对筒身环向爆破压强的贡献' },
  { label: '环向层单层环向爆压', formula: 'p_{\\theta 90}=\\dfrac{t_f\\,\\sigma_{\\text{环向}}}{R}', purpose: '一根环向（90°）纤维层的环向贡献，纵向为零' },
  { label: '螺旋向厚度初估', formula: 'h_{\\text{螺}}=\\dfrac{R\\,p_b}{2\\,\\sigma_{sp}\\cos^2\\alpha_{ref}}', purpose: '按参考角和螺旋纤维发挥强度计算所需厚度' },
  { label: '环向厚度初估', formula: 'h_{\\text{环}}=\\dfrac{(2-\\tan^2\\alpha_{ref})\\,R\\,p_b}{2\\,\\sigma_{hp}}', purpose: '按环向纤维发挥强度计算所需厚度' },

  // ── 封头 ──
  { label: '起铺平行圆半径', formula: 'r_{0g}=R\\sin\\alpha_g', purpose: '由缠绕角求该角度组开始铺到的平行圆半径' },
  { label: '平行圆纤维数', formula: 'm_R=\\dfrac{2\\pi_0 R\\cos\\alpha}{b_{tot}}', purpose: 'π₀ = 3.1415926' },
  { label: '覆盖区厚度', formula: 't_{cov}=\\dfrac{m_R n_R t_p}{\\pi_0}\\left[\\arccos\\dfrac{r_0}{r}-\\arccos\\dfrac{r_b}{r}\\right]', purpose: '2倍带宽外厚度，π₀ = 3.1415926' },
  { label: '体积守恒常数', formula: 'V_{const}=V_1+V_2', purpose: '样条段应满足的纤维体积守恒量' },
  { label: '样条段厚度', formula: 't=m_1+m_2 r+m_3 r^2+m_4 r^3', purpose: '2 倍带宽以内区段的单层厚度（三次样条）' },
  { label: '组厚度', formula: 't_g=cycles\\cdot t(r)', purpose: '该角度组的厚度＝循环数×单层厚，循环数＝层数 ÷ 2' },
  { label: '封头缠绕角度', formula: 'K=\\dfrac{180}{\\pi_0}\\arcsin\\dfrac{r_0}{r}', purpose: '角度单位 °，π₀ = 3.1415926' },
  { label: '组局部参考爆压', formula: 'u=K\\pi/180,\\quad p_g=\\dfrac{2\\,t_g\\,\\sigma_c}{R}\\cos^2 u', purpose: '局部角 K；用于局部参考曲线' },
  { label: '总厚度 / 局部参考爆压', formula: 't_{\\text{总}}=\\sum t_g\\qquad p_{\\text{总}}=k_s\\sum p_g', purpose: '逐点求和；局部曲线仅作参考' },
  { label: '封头经验初估', formula: 'P_{b,h}=k_s\\sum_i\\dfrac{2\\sigma_{fb}n_i t_f\\cos^2\\alpha_{0i}}{R}', purpose: '筒身角 α₀、纯纤维厚度与纤维强度' },
]
