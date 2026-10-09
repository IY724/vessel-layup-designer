/**
 * excelRef.ts — 「Excel 原样复算」口径的公式对照表
 *
 * 软件默认 corrected（物理正确口径）；切到 excel 时用于与原表逐格对账。
 * 本文件只做两件事：① 保存两套公式的原文，供"校核明细"面板并列展示；
 * ② 记录已核对出的 Excel 原表问题（笔误/口径不一致），供报告引用。
 */

export interface FormulaRow {
  /** 名称（界面显示） */
  label: string
  /** Excel 原文（含单元格引用，逐字照抄自提取结果） */
  excel: string
  /** 软件实现（corrected 口径） */
  corrected: string
  /** 差异说明；无差异留空 */
  note: string
}

export const CYLINDER_FORMULAS: FormulaRow[] = [
  {
    label: '纤维单层厚 tf',
    excel: 'C8 = C7/C6/C4  （线密度/密度/带宽）',
    corrected: 'tf = tex / (ρ_fiber · b)',
    note: '',
  },
  {
    label: '复材单层厚 tc',
    excel: 'C9 = C8/C5',
    corrected: 'tc = tf / Vf',
    note: '',
  },
  {
    label: '单层纵向爆压贡献',
    excel: 'I12 = 2*$C$8*$C$11*J3/$C$3',
    corrected: 'pαi = 2·tf·σ_螺旋·cos²α / R',
    note: 'Excel 用四舍五入后的 σ发挥=3385；模式 A 自算为 2390/0.6×0.85=3385.83',
  },
  {
    label: '单层环向爆压贡献',
    excel: 'J12 = $C$11*$C$8*K3/$C$3',
    corrected: 'pθi = tf·σ_螺旋·sin²α / R',
    note: '',
  },
  {
    label: '环向层单层环向爆压',
    excel: 'J22 = C11*C8/C3',
    corrected: 'pθ90 = tf·σ_环向 / R',
    note: '',
  },
  {
    label: '螺旋向厚度初估',
    excel: 'B20 = (C3*C10)/(2*C11*B17*B17)',
    corrected: 'h螺 = R·pb / (2σ·cos²αref)',
    note: '',
  },
  {
    label: '环向厚度初估',
    excel: 'B24 = (2-B18*B18)*C3*C10/(2*C11)',
    corrected: 'h环 = (2−tan²αref)·R·pb / (2σ)',
    note: '',
  },
]

export const DOME_FORMULAS: FormulaRow[] = [
  {
    label: '极孔半径',
    excel: 'I3 = SIN(G3)*$C$3',
    corrected: 'r0g = R·sinαg',
    note: '',
  },
  {
    label: '平行圆纤维数',
    excel: 'L3 = 2*3.1415926*C3/C13*H3',
    corrected: 'mR = 2πR·cosα / b_tot',
    note: 'Excel 用 3.1415926 近似 π',
  },
  {
    label: '2 倍带宽外厚度（覆盖公式）',
    excel: 'G23 = $L$3*$N$3*(ACOS($I$3/E23)-ACOS(($I$3+$C$13)/E23))*$O$3/3.1415926',
    corrected: 't_cov = mR·nR·tp/π·[arccos(r0/r) − arccos(rb/r)]',
    note: '',
  },
  {
    label: '纤维体积守恒常数',
    excel: 'K8 = M9+O9  （V1+V2，闭式）',
    corrected: 'Vconst = V1 + V2',
    note: '已数值验证：V1=18367.7913、V2=13896.9294 @10°（本实现 Vconst=32264.7212 vs Excel 32264.7207）',
  },
  {
    label: '2 倍带宽内厚度（三次样条）',
    excel: 'F23 = $G$17+$G$18*E23+$G$19*E23*E23+$G$20*E23*E23*E23',
    corrected: 't = m1+m2·r+m3·r²+m4·r³（4 条件线性方程组）',
    note: 'Excel 的 m1 是数组公式（矩阵求逆 × 右端项），本实现直接解 4×4',
  },
  {
    label: '组厚度',
    excel: 'J23 = H23*$I$23',
    corrected: 't_g = cycles · t(r)，cycles = 该组层数/2',
    note: '★每组各自取值：10/17/25°×4 层→2，37/40/45°×2 层→1，不能一律 ×2',
  },
  {
    label: '局部缠绕角',
    excel: 'K23 = ASIN($I$3/E23)/3.1415926*180',
    corrected: 'αg(r) = arcsin(r0g/r)',
    note: 'r < r0g 时 Excel 出 #NUM!，作者把该行 L 列手工置 0',
  },
  {
    label: '组局部爆破压强',
    excel: 'L23 = 2*J23*$C$15/$C$3*COS(K23/180*PI()*COS(K23/180*PI()))',
    corrected: 'p_g = 2·t_g·σc/R·cos²αg(r)',
    note: '★原表少一个右括号：cos(u·cos u) ≠ cos²u。u→0（赤道）时两者都≈1；u→90°（各组自己的极孔边缘）时 0.995 vs 0.004。逐点对账：原算法与参考表最大差 0.0028 MPa，修正后最大差 86.0 MPa @ r=81',
  },
  {
    label: '总厚度 / 总爆破压强',
    excel: "总厚度!B2 = '10'!J23+'17'!J23+…+'45'!J23 ；总爆破压强!C2 = B2*0.75",
    corrected: '总厚 = Σ各组厚；爆压 = ks·Σ各组爆压',
    note: '参考表把 ks 固定为 0.75（常用 0.7~0.8），本软件开放 0.70~0.80',
  },
]

/** 已核对出的原表问题清单（报告/界面提示引用） */
export const EXCEL_ISSUES = [
  {
    id: 'cos2-typo',
    severity: '高' as const,
    where: '封头表各角度 sheet L 列（局部爆破压强）',
    text:
      '公式 COS(K*PI()/180*COS(K*PI()/180)) 少一个右括号，应为 cos²K。' +
      '小角度（赤道侧）两者几乎相等，各组自己的极孔边缘（K→90°）差异巨大，' +
      '导致封头中段与极孔侧爆压预测系统性虚高（默认参数下最大 +86 MPa）。',
  },
  {
    id: 'negative-spline',
    severity: '中' as const,
    where: '封头表 F/H 列（2 倍带宽内厚度）',
    text:
      '样条在 r < r0 区间会外插出负值，原表靠作者手工留空/置 0 截断，' +
      '导致每组 r0 下方 1~2 个格点仍带 0.04~0.45 mm 的虚假厚度。' +
      '本软件统一为 r < r0 → 该组厚度 0。',
  },
  {
    id: 'pi-approx',
    severity: '低' as const,
    where: '封头表 L3 / 筒身表 I3 等多处',
    text: 'π 用 3.1415926 硬编码近似，与 Math.PI 差 2.7e-8，对结果影响 <0.001%。',
  },
  {
    id: 'sigma-round',
    severity: '低' as const,
    where: '筒身表 C11 = 3385',
    text: '发挥强度取整为 3385 MPa（2390/0.6×0.85 = 3385.83），软件模式 A 用未取整值，差 0.025%。',
  },
]
