# 复合材料气瓶缠绕铺层设计软件 V1.0

> **状态：软件正在升级开发，当前版本暂停发布，完成升级后统一上线。**
>
> **Status: under active upgrade — this release is temporarily withdrawn and will be published once the upgrade is complete.**

[中文](#中文) · [English](#english)

---

# 中文

## 一、软件概述

复合材料气瓶缠绕铺层设计软件（VesselLayup）V1.0 是一款辅助工程师开展气瓶铺层计算与结构评估的实用工具。主要功能涵盖气瓶外形几何与容积参数估算、筒身与封头铺层承载验算、铺层层数与角度试算调整，以及 Excel / Word / PDF 计算书的自动导出。

面向高压储氢气瓶及特种压力容器的前期结构方案设计、工艺参数初拟与工程校核。

**开发目的**：以自动迭代替代手工试算表格，实现气瓶缠绕铺层的参数化设计与强度校核，提高设计效率。

**技术特点**：采用多维参数链全域即时重算架构；融合网格理论与三次样条算法，实现封头逐点壁厚与承载的高精解析；具备目标压强驱动的铺层智能规划与闭环复核；支持容积逆向反算与保留原生公式的动态计算书导出。

## 二、运行环境与安装

软件为轻量化设计，无需预装编程语言环境、依赖组件或第三方运行库，开箱即用。

| 项目 | 要求 |
|---|---|
| 运行平台 | Windows（64 位） |
| 网页版 | Chrome / Edge 等现代浏览器 |
| 网络 | 不需要，计算全程本地脱网执行 |

**两种形态，任选其一：**

1. **网页版**：用浏览器打开 `复合材料气瓶缠绕铺层设计软件-网页版.html`
2. **Windows 免安装版**：双击运行 `复合材料气瓶缠绕铺层设计软件-1.0-Windows-x64-免安装.exe`

> 当前为升级开发中，上述文件暂不提供下载；完成后在 Releases 统一发布。

## 三、使用说明

### 3.1 主界面与工作台布局

启动后进入集成化设计工作台，采用左右分栏布局：

- **顶栏**：左侧为软件名称与版本号，右侧集中放置操作按钮。
- **左栏**：自上而下排列的参数输入区，宽度固定，内容超出时在栏内滚动。
- **右栏**：结果区，卡片纵向排列，表格与图形随参数变化即时刷新。
- **底栏**：状态栏，显示版本号、当前计算内容、离线运行说明与最近一次操作结果。

参数发生变化时，状态层重新执行一次完整计算，再把新结果分发给各张卡片，因此界面上的判定、表格、图形与明细始终来自同一次计算。

### 3.2 参数输入（六个功能区）

| 功能区 | 用途 |
|---|---|
| 几何参数 | 录入内衬半径、筒身长度、封头深度与容积；极孔半径支持「直接输入」与「瓶口内径 + 内衬厚」两种取法 |
| 纤维与工艺 | 配置纤维与树脂密度、线密度、纱宽及体积含量，实时联动计算干纤维单层厚与含胶单层厚 |
| 材料强度 | 提供「NOL 环强度折减」与「直接给定发挥强度」两种模式，复材层基准强度可留空由算法折算 |
| 设计要求 | 可直接指定设计爆压，或输入工作压力与安全系数自动换算，同步输出应力平衡系数 |
| 筒身初算 | 设定初算缠绕角及螺旋/环向预估层数，作为自动生成全铺层方案的初始输入 |
| 结果概览 | 实时显示螺旋厚度、环向厚度、总缠绕厚度、封头最厚点位置与筒身-封头匹配性判定 |

每个分组标题右侧的问号按钮会弹出该组所用公式，以排版后的数学形式给出并附用途说明，便于核对口径而无需翻阅资料。

### 3.3 铺层方案表

用于配置各缠绕组参数与工艺次序，列项涵盖激活开关、缠绕角、类型、层数、方向贡献与厚度。

- 支持行内参数直编、单组一键启用/停用
- 支持行拖拽重排（联动更新封头堆叠顺序）
- 支持右键增删行
- 表尾实时展示分项小计、合计及状态指示色
- 集成螺旋/环向新增与「自动生成」功能

表格上方为计算结果卡片，给出初步计算判定、纵向爆破压强、环向爆破压强、筒身最小裕度、筒身总厚度与封头经验初估六项结果。判定分满足、待调整与不满足三档，数值达标显示绿色，不足显示红色，并直接给出相对设计爆压的裕度百分比。

### 3.4 自动生成铺层

点击「自动生成铺层」打开弹窗：

1. 先给出筒身初算结果，即按当前初算角度与强度参数算出的螺旋层数与环向层数。
2. 列出按扩孔步进得到的候选螺旋角表，每行给出该角度对应的极孔直径与螺旋角。
3. 勾选其中若干个作为参与生成的组；若所选组要求的层数高于初算值，弹窗给出按更高层数分配的提示。
4. 点击「生成并填入」，软件按所选角度组与初算层数自动排出铺层方案并回填到铺层表。

> 削峰量由所选角度组决定：选到多大角、选几组，就扩几次孔、降多少毫米，软件不预设固定毫米数。

### 3.5 封头厚度与爆压分布校核

封头校核卡片采用左右双图联动：

**左侧 · 厚度轮廓半剖图**：卧式半剖投影（轴线水平置底，左为极孔、右为赤道）。各角度组依缠绕次序向外彩色分层堆叠，圆点与方块分别标记起铺圆和样条-覆盖衔接圆，右上角标注峰值厚度及所在半径，轮廓线与特征标记可独立显隐。

**右侧 · 特性分布校验图**：支持爆压与厚度双视图切换。

- **爆压分布视图**：沿平行圆半径绘制计入应力平衡系数的合成爆压曲线，红色虚线为目标阈值，自动高亮欠压薄弱区（淡红）与未全覆盖区（浅灰）。
- **厚度分布视图**：展示径向厚度演化，辅以筒身螺旋层总厚基准线。
- **交互探针**：光标悬停实时读取指定半径的总厚、修正前后爆压及各角度组的分项贡献。

两幅图均可放大到独立窗口查看，便于在计算书中引用。

### 3.6 校核明细

点击顶栏「校核明细」呼出明细窗口，按功能分区展示：

- 输入参数汇总：几何尺寸、铺层工艺与复合材料物性
- 筒身强度校核表：逐组计算三角函数项、层数、厚度及单/多层强度贡献
- 封头参数表：特征圆半径、循环数、几何斜率、样条系数及赤道处组厚度与爆压
- 封头局部参考值表：按平行圆半径逐行对比各组厚度、累计总厚及折减爆压指标
- 螺旋铺层校验表：切换角度组，复核样条段与覆盖段厚度、局部实际缠绕角及参考爆压
- 计算公式表与校核结果：公式与用途，并给出封头-筒身衔接厚度偏差、曲线极值、最厚位置及系统诊断

### 3.7 容积互算与线型切点设计

几何板块支持按论文顺序（确定容积与工况 → 线型切点定筒身直径与长度 → 铺层缠绕计算）串起几何输入：

- 容积与尺寸互算，未知量可选筒身长 l、半径 R 或封头轴比 λ
- 「采用」把候选尺寸写回几何参数，并保持封头轴比λ不变
- 内衬纵剖面轮廓显示
- 线型缠绕切点校验（容积曲线与允许转角求交），超出常用区间标黄提示但不剔除

### 3.8 导出计算书

方案设计完成后可通过顶栏导出：

- **Excel 计算书**：包含方案汇总及分项校核等多个工作表，内嵌动态公式便于复核验算
- **Word 计算书**：含原生可编辑公式（OMML）
- **PDF 计算书**：集成图文混排与在线翻页预览，可直接另存为标准结构设计计算书

三份计算书同源同数，由同一内核生成。

## 四、适用范围与边界

- ⚠️ 输入参数与公式来自公开资料、基准算例与文献，**用于教学与预设计**；工程签发须按 GB/T 35544 等标准与试验验证。
- 计算结果为网格理论初步设计值，不替代承压、疲劳、密封与整瓶试验。
- 界面与计算书不添加来源、窗口、对比类注记；公式变量含义由界面「?」弹窗承载。

## 五、后续开发计划

当前版本已覆盖筒身铺层设计、封头校核、几何互算与三格式计算书导出。以下能力尚在开发中，将随升级版本陆续提供：

| 方向 | 计划内容 |
|---|---|
| 工艺闭环 | 切点数/线型与扩孔选角的工艺闭环，机床可执行性校验 |
| 接头几何 | 螺纹与密封面几何建模（当前仅尺寸设计，未建实体） |
| 建模对接 | 与 Abaqus 插件（Ⅳ型气瓶参数化建模软件）的程序级对接 |
| 内衬结构图 | 带完整尺寸链与局部放大的工程图，可导出 SVG / PDF |
| 材料库 | 常用内衬与复材牌号库，减少重复录入 |

## 六、问题反馈

改进建议请直接提 Issue。涉及公式口径、判据、单位换算的问题，请附**可复算的数值依据**（Excel 单元格或文献页码），便于定位。

## 七、其他

- 本仓库仅保留这份说明，不含源码与构建产物。
- DSH 插件（在 DeepSeek Harness 中调用同一内核）：见 [IY724/dsh-vessel-layup](https://github.com/IY724/dsh-vessel-layup)。
- 开发完成日期：2026-10-20　版本号：V1.0
- License：MIT

---

# English

## 1. Overview

**Composite Vessel Winding Layup Design Software (VesselLayup) V1.0** is a practical engineering tool for pressure-vessel layup calculation and structural assessment. It covers geometry and volume estimation, cylinder and dome load verification, ply-count and winding-angle iteration, and automatic export of Excel / Word / PDF calculation reports.

It targets preliminary structural design, process parameter drafting and engineering verification for high-pressure hydrogen storage vessels and special pressure vessels.

**Purpose**: replace manual spreadsheet iteration with automated, parametric layup design and strength verification.

**Technical characteristics**: full-model instant recomputation driven by a multi-dimensional parameter chain; netting theory combined with cubic-spline algorithms for high-resolution dome thickness and capacity analysis; target-pressure-driven ply planning with closed-loop re-verification; volume reverse-solving; and formula-preserving dynamic report export.

## 2. Environment and Installation

Lightweight by design — no language runtime, dependencies or third-party libraries required.

| Item | Requirement |
|---|---|
| Platform | Windows (64-bit) |
| Web build | Any modern browser (Chrome / Edge) |
| Network | Not required — all computation runs locally offline |

**Two builds, pick either:**

1. **Web build** — open `复合材料气瓶缠绕铺层设计软件-网页版.html` in a browser
2. **Portable Windows build** — run `复合材料气瓶缠绕铺层设计软件-1.0-Windows-x64-免安装.exe`

> Currently under upgrade; these files are not available for download yet. They will be published under Releases.

## 3. Usage

### 3.1 Main workspace

A split-pane workspace opens on launch:

- **Top bar** — product name and version on the left, action buttons on the right.
- **Left pane** — top-to-bottom parameter input, fixed width, scrolls when overflowing.
- **Right pane** — result cards stacked vertically; tables and charts refresh as parameters change.
- **Status bar** — version, current computation, offline note and the latest action result.

Every parameter change triggers one full recomputation by the state layer, and all cards receive results from that same run — so verdicts, tables, charts and details always agree.

### 3.2 Parameter input (six groups)

| Group | Purpose |
|---|---|
| Geometry | Liner radius, cylinder length, head depth, volume; pole radius accepts either direct input or "port bore + liner thickness" |
| Fibre & process | Fibre/resin density, linear density, band width, fibre volume fraction; live conversion to dry-fibre and resin-impregnated ply thickness |
| Material strength | Either "NOL ring strength with reduction" or "directly specified strength"; composite reference strength may be left blank for automatic derivation |
| Design requirements | Specify design burst pressure directly, or enter working pressure and safety factor for automatic conversion with stress-balance factor output |
| Cylinder initial estimate | Initial winding angle and preliminary spiral/hoop ply counts, seeding automatic layup generation |
| Result summary | Live spiral thickness, hoop thickness, total wound thickness, dome thickest location and cylinder–dome match verdict |

The question-mark button beside each group title pops up the formulas used, typeset with a one-line purpose note.

### 3.3 Layup table

Configures each winding group and process order: active flag, winding angle, type, ply count, directional contribution and thickness.

- Inline editing, one-click enable/disable per group
- Drag rows to reorder (dome stacking order follows)
- Right-click to add or delete rows
- Live subtotals, grand totals and status colours at the table foot
- Integrated spiral/hoop insertion and "auto-generate"

Above the table, a result card reports the preliminary verdict, longitudinal and hoop burst pressure, minimum cylinder margin, total cylinder thickness and empirical dome estimate. Verdicts are pass / to-adjust / fail, colour-coded, with margin percentages against design burst pressure.

### 3.4 Auto-generate layup

Clicking **Auto-generate layup** opens a dialog:

1. Cylinder initial estimates — spiral and hoop ply counts from the current initial angle and strength parameters.
2. A candidate winding-angle table stepped by expansion increments, listing the corresponding pole diameter and winding angle per row.
3. Tick the groups to include; if a selected group needs more plies than the initial estimate, the dialog says so.
4. Click **Generate and fill** — the layup is arranged from the selected angle groups and initial counts, then written back to the table.

> Peak reduction follows your angle selection: the highest angle and number of groups you pick determine how many expansion steps and how many millimetres are trimmed. The software does not impose a fixed millimetre target.

### 3.5 Dome thickness and burst pressure

The dome check card pairs two linked views:

**Left — half-section thickness contour**: horizontal half-section with the axis at the bottom, pole on the left and equator on the right. Angle groups stack outward in colour by winding order; circles and squares mark the start-of-winding circle and the spline–coverage junction. Peak thickness and its radius are annotated, and contour lines and markers toggle independently.

**Right — property distribution chart**, switchable between burst pressure and thickness:

- **Burst pressure view** — composite burst pressure along parallel-circle radius including the stress-balance factor, with a red dashed threshold and automatic highlighting of under-strength (pale red) and uncovered (pale grey) regions.
- **Thickness view** — radial thickness evolution with a cylinder spiral-thickness reference line.
- **Hover probe** — reads total thickness, pre/post-correction burst pressure and per-group contributions at any radius.

Both charts expand to a standalone window for citation in reports.

### 3.6 Check details

The **Check details** button opens a window organised by section:

- Input parameter summary — geometry, process and composite properties
- Cylinder strength table — trigonometric terms, ply counts, thickness and per-layer strength contribution per group
- Dome parameter table — characteristic radii, cycle counts, geometric slopes, spline coefficients, equatorial group thickness and burst pressure
- Dome local reference table — group thickness, cumulative thickness and derated burst pressure row by row along radius
- Spiral layup verification — switch angle groups to review spline and coverage thickness, local winding angle and reference burst pressure
- Formulas and results — formulas with purposes, plus cylinder–dome thickness deviation, curve extremes, thickest location and diagnostics

### 3.7 Volume solving and line-type tangency

The geometry section follows the design order (volume and conditions → line-type tangency fixes cylinder diameter and length → winding calculation):

- Volume ↔ dimension solving with a selectable unknown: cylinder length l, radius R, or head axis ratio λ
- **Adopt** writes candidate dimensions back into geometry while preserving λ
- Liner meridian profile display
- Line-type tangency check (volume curve intersected with allowed rotation angles); values outside the usual range are flagged amber but not discarded

### 3.8 Report export

After the design is settled, export from the top bar:

- **Excel report** — summary and per-section verification sheets with live formulas for independent re-checking
- **Word report** — native editable equations (OMML)
- **PDF report** — mixed text/graphics with in-app page preview, savable as a standard structural design calculation report

All three share one source of truth and produce identical numbers.

## 4. Scope and Limitations

- ⚠️ Inputs and formulas derive from public materials, reference cases and literature, and are **intended for teaching and preliminary design**. Engineering sign-off requires verification against standards such as GB/T 35544 and physical testing.
- Results are netting-theory preliminary design values and do not replace burst, fatigue, sealing or full-bottle testing.
- Neither the interface nor the reports carry source, window or comparison annotations; variable meanings are provided through the in-app "?" popups.

## 5. Roadmap

This version covers cylinder layup design, dome verification, volume solving and three-format report export. The following are in development:

| Area | Planned |
|---|---|
| Process closed loop | Pattern/cycle-count and expansion-angle process closure with machine executability checks |
| Boss geometry | Thread and sealing-face geometry modelling (currently dimension design only) |
| Modelling integration | Programmatic integration with the Abaqus Type-IV parametric modelling plugin |
| Liner drawing | Dimensioned engineering drawing with detail views, exportable as SVG / PDF |
| Material library | Common liner and composite grade library to reduce repeated entry |

## 6. Feedback

Please open an Issue for suggestions. For formula, criterion or unit-conversion questions, include **reproducible numerical evidence** (Excel cell or literature page) so it can be located quickly.

## 7. Notes

- This repository contains this description only; no source code or build artefacts.
- DSH plugin (same kernel inside DeepSeek Harness): [IY724/dsh-vessel-layup](https://github.com/IY724/dsh-vessel-layup).
- Development completed: 2026-10-20　Version: V1.0
- License: MIT
