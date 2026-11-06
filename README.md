# 复合材料气瓶缠绕铺层设计系统 / Vessel Layup Designer

> **状态：软件正在升级开发，本版本暂不发布。** 部分功能正在调整，完成后统一发布。

面向 Ⅲ/Ⅳ 型储氢高压复合材料气瓶的**缠绕铺层设计系统**。输入设计条件、材料工艺与筒身计算角度，得出筒身层数结论并校核；在扩孔候选表里选择角度写入铺层表；分别校核筒身双向与封头逐点强度；在铺层表里调整层数、角度、类型与顺序；导出 Excel / Word / PDF 计算书。

计算依据为**网格理论（netting analysis）**：筒身按等厚假设做多角度混合铺层校核，封头按缠绕规律（纤维体积沿平行圆守恒 + 三次样条）逐角度组校核。

## 软件用途

把"课程讲义 + 两张 Excel 手工迭代"的设计流程，变成秒级、可视、可追溯的自动设计：

- **不用再手工凑层数**：给出工况与材料，自动算出筒身初算层数并复核双向爆压。
- **不用再手工排铺层**：扩孔候选角由极孔直径逐级加带宽反算，选定角度后自动分配层数、交替排列。
- **不用再手工对数**：筒身逐角度贡献、封头逐点厚度与爆压、标准符合性，全部由同一内核计算。
- **结果可直接交付**：一次设计同时产出 Excel 活公式计算书、Word 计算书（原生可编辑公式）与 PDF 计算书，三份同源同数。

## 主要功能

| 板块 | 能力 |
|---|---|
| 铺层设计 | 筒身单角度初算 → 扩孔选角 → 顺序铺层表（可拖动换序、停用、增删）→ 双向强度校核 |
| 封头校核 | 逐角度组三次样条厚度预测、覆盖公式、逐点爆压曲线、厚度分布 |
| 几何板块 | 容积↔尺寸互算（未知量可选 l / R / λ）、内衬纵剖面轮廓、线型切点校验、Ⅳ型瓶接头尺寸链 |
| 计算书 | Excel（活公式）、Word（OMML 原生公式）、PDF（封面、正文、公式、表图），三份同源 |
| 标准判定 | 按 T/CATSI 02 007-2020 逐条核对适用范围、纤维应力比与最小爆破压力 |
| 建模对接 | 可生成 Abaqus Ⅳ型瓶几何模型（cae / stp）与内衬结构工程图 |

## 计算口径

| 环节 | 内容 |
|---|---|
| 工艺参数链 | t_f = tex/(ρ·b)、t_c = t_f/V_f、总带宽 = n·b |
| 强度 | 模式 A：σ_NOL/V_f·k 自算；模式 B：直接给定（螺旋/环向可分） |
| 测地线 | r₀ = R·sinα ⇔ α = arcsin(r₀/R)，逐组扩孔 |
| 筒身 | 多角混合 p_α = Σn·2t_fσcos²α/R、p_θ = Σn·t_fσsin²α/R + n₉₀·t_fσ/R |
| 封头 | 两倍带宽内三次样条、外侧覆盖公式 → t_g(r)；同半径叠加 |
| 判定 | 筒身双向 ≥ p_b；封头经验初估 k_s·Σ(2σ_fb·n·t_f·cos²α₀/R) ≥ p_b |

初算层数是计算结论，不接受手填。均分后纵向欠强时，向单位纵向贡献最大的角度组补成对的层，补层数写入生成依据；角度选择、环向层数与铺层行序不变。

**一个必须区分的量**：Ⅳ型瓶的**阀座通孔半径**与缠绕的**测地线极孔 r_cl = R_out·sinα₀** 是两个不同的量。铺层设计里填的"缠绕极孔半径"是 r_cl，软件在几何面板里把两者并列显示。

## 如何获取

**当前为升级开发中，暂不提供下载。** 完成升级后会在 Releases 统一发布：

- **单文件网页版**：下载后双击用浏览器打开即可，零安装、零联网、零后端。
- **Windows 桌面版**：免安装可执行文件。

本仓库只保留这份说明，不含源码与构建产物：

- **DSH 插件**（在 DeepSeek Harness 里直接调用同一内核）：见 [IY724/dsh-vessel-layup](https://github.com/IY724/dsh-vessel-layup)。

## 适用范围与边界

- ⚠️ 输入参数与公式来自公开课件、基准算例与两篇硕士论文，**用于教学与预设计**；工程签发须按 GB/T 35544 等标准与试验验证。
- 计算结果给出的是网格理论初步设计值，不替代承压、疲劳、密封与整瓶试验。
- 界面与计算书不添加来源、窗口、对比类注记；公式变量含义由界面「?」弹窗承载。

## 问题反馈

改进建议请直接提 Issue。涉及公式口径、判据、单位换算的问题，请附**可复算的数值依据**（Excel 单元格或论文页码），便于定位。

## License

MIT。

---

## English

> **Status: under active upgrade; no release is available at this time.** Some features are being reworked and will be released together once complete.

**Vessel Layup Designer** is a filament-winding layup design system for Type III/IV hydrogen storage pressure vessels.

Given working conditions, material data and a cylinder winding angle, it derives the cylinder ply count and verifies it, lets you pick expansion angles from a candidate table, checks both cylinder directions and the dome point by point, and exports an Excel / Word / PDF calculation report from the same kernel.

**Analysis basis**: netting theory for the cylinder under a constant-thickness, multi-angle layup assumption; the dome is checked group by group following the winding law (fibre volume conserved along each parallel circle, cubic spline thickness prediction).

**Key capabilities**

- Cylinder: initial single-angle estimate, expansion angle selection, ordered layup table, bidirectional strength check.
- Dome: per-group spline thickness prediction, coverage formula, point-by-point burst pressure and thickness profiles.
- Geometry: volume ↔ dimension solving (unknown l / R / λ), liner meridian profile, winding line-type tangency check, Type-IV boss dimension chain.
- Reports: Excel (live formulas), Word (native OMML equations) and PDF, all generated from one source of truth.
- Standards: clause-by-clause screening against T/CATSI 02 007-2020.
- Modelling: optional Abaqus Type-IV geometry (cae / stp) and a liner structural drawing.

**Scope**: intended for teaching and preliminary design. Engineering sign-off requires verification against standards such as GB/T 35544 and physical testing. Results do not replace burst, fatigue, sealing or full-bottle testing.

**Distribution**: a single-file web build and a portable Windows executable will be published under Releases once the upgrade is complete. This repository contains this description only; the DSH plugin lives at [IY724/dsh-vessel-layup](https://github.com/IY724/dsh-vessel-layup).

Licensed under the MIT License.
