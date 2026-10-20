# Composite Vessel Winding Layup Design System / Vessel Layup Designer

[简体中文](README.zh-CN.md) | **English**

> **Status: code and installer temporarily withdrawn; Releases are unavailable.** Some features are being upgraded and will be fully released later.

> Turn the "course notes + two Excel sheets" manual iteration workflow into a fast, visual, traceable automatic design.

Winding layup design for Type III/IV hydrogen storage pressure vessels. Zero installation, zero network, zero backend: the product is a single `index.html` that runs in any browser; a Windows desktop build is also available.

## How to use

1. Fill in the geometry, fiber/process and strength inputs.
2. Click **Auto-generate layup** and select angles in the expansion candidate table (default: every other of 8 groups).
3. The software writes the layup table and checks the cylinder in both directions and the dome point by point. If a check fails, it gives a one-line ply-addition suggestion.
4. Adjust the layers, angles, type and order in the layup table, then export the Excel calculation book or print/PDF.

The top bar also has **Restore defaults** and **Check details** (cell-by-cell verification). The **?** popup next to each field explains the parameter and its formula.

## Interface

<table>
<tr><td align="center" width="33.3%"><img src="docs/softcopyright-main.png" width="96%"/><br/>Main workbench: inputs on the left, results and cylinder layup table on the right</td><td align="center" width="33.3%"><img src="docs/softcopyright-layup.png" width="96%"/><br/>Layup plan editing and dome check views</td><td align="center" width="33.3%"><img src="docs/softcopyright-geometry.png" width="96%"/><br/>Volume/size conversion and winding line-type tangent design</td></tr>
<tr><td align="center" width="33.3%"><img src="docs/softcopyright-formula.png" width="96%"/><br/>Formula popup: variable meanings and formulas</td><td align="center" width="33.3%"><img src="docs/softcopyright-detail.png" width="96%"/><br/>Full-parameter cell-by-cell verification and detail audit</td><td width="33.3%"></td></tr>
</table>

## Features

| Module | Capability |
|---|---|
| Geometry | Cylinder radius R, pole radius (winding pole directly, or boss bore + liner thickness), dome depth b, cylinder length, design volume, liner thickness |
| Fiber and process | Linear density tex, fiber density ρ, band width b, yarns per band n, fiber volume fraction Vf, resin density; derives single-layer fiber thickness tf, composite layer thickness tc and total band width |
| Strength input | Mode A derives from NOL strength; Mode B takes values directly, with separate spiral and hoop strengths |
| Geodesics | Bidirectional pole radius / winding angle conversion, group-by-group expansion and pole consistency check |
| Cylinder check | Longitudinal and hoop burst pressure, minimum margin and total thickness for mixed-angle layups |
| Dome check | Point-wise thickness and burst pressure from the winding pattern, with the lowest-pressure radius range and weak-point hints |
| Auto-generation | Cylinder single-angle layer count and check first; read-only conclusion; expansion candidates connected by two band widths, any combination selectable |
| Layup table | Spirals and hoops share one ordered table; each row has type, angle and layer count, with drag reorder, disable, add and delete; hoop groups do not enter the dome calculation |
| Geometry module | Volume/size conversion, liner meridian profile, line-type winding tangency check, Type IV joint dimensions and constraint chain |
| Export | Excel calculation book (16 tables by default, live formulas), plan JSON import/export, print/PDF |

## Quick start

**Just use it**: download the single-file `index.html` from Releases and open it in a browser.

**Share it**: send `dist/index.html`.

**Modify it**:

```bash
npm install
npm run dev            # local development at http://localhost:5173
npm test               # baseline tests
npm run build:single   # build the single-file dist/index.html
```

## Project structure

```
src/core/       Pure calculation core (no UI dependency, unit-testable)
  types.ts        Input / plan / result types
  materials.ts    Process parameter chain, strength modes A/B
  geodesic.ts     Geodesics: angle and pole radius conversion, consistency check
  netting.ts      Cylinder burst pressure and initial estimate
  dome.ts         Dome thickness distribution and point-wise burst pressure
  checker.ts      Aggregated check: scope, weak points, weight reference, suggestions
  designer.ts     Automatic layup plan generation
  geometry.ts     Geometry: volume conversion, semi-ellipsoid profile, line-type tangency, joint dimension chain
  presets.ts      Default presets
src/ui/         Input panel / auto-design dialog / layup table / dome profile and burst curve / geometry panel / check details
src/state/      Single source of truth: input + plan -> full pure-function recomputation
tests/          Baseline tests
docs/           UI screenshots
```

## Notes

- The "winding pole radius" is the geodesic pole radius `r_cl`, not the Type IV boss bore radius. Both are shown side by side in the geometry panel.
- Inputs and formulas come from public course notes and baseline cases, for teaching and preliminary design. Engineering sign-off must follow GB/T 35544 and experimental verification.

## Contact

Please do not use this software for commercial purposes. For any issues, contact **Z25150070@s.upc.edu.cn** directly.

## Development

This project was developed and documented with AI-assisted programming (vibecoding).
