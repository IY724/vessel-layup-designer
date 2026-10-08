# -*- coding: utf-8 -*-
"""封头模型 vs Excel 缓存值 逐点对账（144 格点）+ 每组参数基准值。

三条口径的结论（写进 core 实现与"Excel 原样复算"开关）：
  strict   : r < r0 -> 组厚=0（软件口径，物理正确：该组纤维不到达更小的平行圆）
  excelmax : r <= r2b -> max(0, 样条)，即 Excel 作者"样条为负就手工留空"的真实形态
  typo     : 爆压用原表笔误式 cos(u*cos u)，u 为弧度；修正式为 cos^2 u
"""
import io, math
import openpyxl

XLSX = r'F:\abaqus_temp\qingping\_extract\封头厚度公式.xlsx'
R, btot, tp, sigc, ks = 173.5, 20.0, 0.305555555555556, 2031.0, 0.75
GROUPS = [(10, 2), (17, 2), (25, 2), (37, 1), (40, 1), (45, 1)]
LOG = io.StringIO()


def P(*a):
    print(*a, file=LOG)


def dome_group(alpha_deg):
    a = math.radians(alpha_deg)
    r0 = R * math.sin(a)
    rb, r2b = r0 + btot, r0 + 2 * btot
    mR = 2 * math.pi * R * math.cos(a) / btot
    tcov = lambda r: (mR * tp / math.pi * (math.acos(r0 / r) - math.acos(rb / r))) if r > rb else 0.0
    tcov_d = lambda r: mR * tp / math.pi * (r0 / (r * math.sqrt(r * r - r0 * r0))
                                            - rb / (r * math.sqrt(r * r - rb * rb)))
    V1 = mR * tp * (rb * rb * math.acos(r0 / rb) - r0 * math.sqrt(rb * rb - r0 * r0))
    V2 = (r2b * r2b - rb * rb) * mR * tp * (math.acos(r0 / r2b) - math.acos(rb / r2b))
    A = [[1, r0, r0 ** 2, r0 ** 3, tp],
         [1, r2b, r2b ** 2, r2b ** 3, tcov(r2b)],
         [0, 1, 2 * r2b, 3 * r2b ** 2, tcov_d(r2b)],
         [math.pi * (r2b ** 2 - r0 ** 2), 2 / 3 * math.pi * (r2b ** 3 - r0 ** 3),
          math.pi / 2 * (r2b ** 4 - r0 ** 4), 2 / 5 * math.pi * (r2b ** 5 - r0 ** 5), V1 + V2]]
    for c in range(4):
        piv = max(range(c, 4), key=lambda i: abs(A[i][c]))
        A[c], A[piv] = A[piv], A[c]
        for i in range(4):
            if i != c and abs(A[i][c]) > 1e-14:
                f = A[i][c] / A[c][c]
                for j in range(c, 5):
                    A[i][j] -= f * A[c][j]
    m = [A[i][4] / A[i][i] for i in range(4)]
    tspl = lambda r: m[0] + m[1] * r + m[2] * r * r + m[3] * r ** 3
    return dict(r0=r0, rb=rb, r2b=r2b, mR=mR, V=V1 + V2, m=m, tspl=tspl, tcov=tcov)


G = {a: dome_group(a) for a, _ in GROUPS}


def t_group(r, ang, I23, mode):
    g = G[ang]
    if mode == 'excelmax':
        t = max(0.0, g['tspl'](r)) if r <= g['r2b'] else g['tcov'](r)
    else:
        if r < g['r0']:
            return 0.0
        t = g['tspl'](r) if r <= g['r2b'] else g['tcov'](r)
    return t * I23


def p_group(r, ang, I23, typo):
    g = G[ang]
    if r < g['r0']:
        return 0.0
    t = (g['tspl'](r) if r <= g['r2b'] else g['tcov'](r)) * I23
    u = math.asin(g['r0'] / r)
    return 2 * t * sigc / R * (math.cos(u * math.cos(u)) if typo else math.cos(u) ** 2)


wb = openpyxl.load_workbook(XLSX, data_only=True)
grid = [(float(a), float(b)) for a, b in wb['总厚度'].iter_rows(min_row=2, values_only=True)
        if isinstance(a, (int, float)) and isinstance(b, (int, float))]
pgrid = [(float(a), float(b), float(c)) for a, b, c in
         wb['总爆破压强'].iter_rows(min_row=2, values_only=True)
         if all(isinstance(v, (int, float)) for v in (a, b, c))]
P(f'格点数: 厚度 {len(grid)}  爆压 {len(pgrid)}   r: {grid[0][0]} .. {grid[-1][0]}')

for mode in ('strict', 'excelmax'):
    d = [(abs(sum(t_group(r, a, I, mode) for a, I in GROUPS) - t), r) for r, t in grid]
    nz = [x for x in d if x[0] > 1e-4]
    P(f'[厚度 mode={mode:8s}] max|diff| = {max(d)[0]:.4f} @ r={max(d)[1]}   超 1e-4 的点数 = {len(nz)}/{len(d)}')

P('')
for tag, typo, col in (('原样笔误式 cos(u·cos u) vs B列', True, 1), ('修正 cos²u vs B列', False, 1)):
    d = [(abs(sum(p_group(row[0], a, I, typo) for a, I in GROUPS) - row[col]), row[0]) for row in pgrid]
    P(f'[爆压 {tag}] max|diff| = {max(d)[0]:.4f} @ r={max(d)[1]}')
d = [(abs(sum(p_group(row[0], a, I, True) for a, I in GROUPS) * ks - row[2]), row[0]) for row in pgrid]
P(f'[爆压 原样×ks vs C列] max|diff| = {max(d)[0]:.4f} @ r={max(d)[1]}')

P('\n两种口径的爆压曲线特征（修正 cos², ×ks=0.75）:')
rs = sorted({r for r, _, _ in pgrid})
vals = [(sum(p_group(r, a, I, False) for a, I in GROUPS) * ks, r) for r in rs]
P(f'  峰值 {max(vals)[0]:.2f} @ r={max(vals)[1]}   谷值(全区间) {min(vals)[0]:.2f} @ r={min(vals)[1]}')
sub = [v for v in vals if v[1] >= 40]
P(f'  r>=40 区间最小 {min(sub)[0]:.2f} @ r={min(sub)[1]}   r=R 处 {vals[-1][0]:.2f}')
P(f'  Excel 原样口径 r=R: {vals[-1][0]:.2f} vs {sum(p_group(173.5,a,I,True) for a,I in GROUPS)*ks:.2f}')

P('\n每组参数（core 断言基准）:')
for a, I in GROUPS:
    g = G[a]
    P(f'  {a:2d}deg I23={I} r0={g["r0"]:.6f} rb={g["rb"]:.6f} r2b={g["r2b"]:.6f} '
      f'mR={g["mR"]:.6f} Vconst={g["V"]:.4f}')
    P(f'        m1..m4 = ({g["m"][0]:.6f}, {g["m"][1]:.6f}, {g["m"][2]:.8f}, {g["m"][3]:.8f})')
g10 = G[10]
P(f'\n10deg 单点: t(30.2)={g10["tspl"](30.2):.7f}  t(70)={g10["tspl"](70):.7f}  '
  f't(173.5)={g10["tcov"](173.5):.7f}  V1+V2={g10["V"]:.4f}')

open(r'F:\abaqus_temp\qingping\_work\compare_model.txt', 'w', encoding='utf-8').write(LOG.getvalue())
print(LOG.getvalue().encode('gbk', 'replace').decode('gbk'))
