/**
 * figures.ts — 计算书插图：把与界面同源的几何/线型图形生成 SVG，再在浏览器/Electron 里栅格化为 PNG。
 *
 * Node（vitest 单测）没有 DOM，调用方 writePresentation 里用 try/catch 跳过；
 * 网页版与桌面版导出时正常嵌入。所有坐标数据都来自 core 的纯函数，与界面同一口径。
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CheckResult, DesignInput } from '../core/types'
import { DomeContour } from '../ui/DomePanel'
import {
  allowedLineTypes,
  computeVolume,
  designCurve,
  intersectLineTypes,
  lambdaFromDepth,
  solveForTheta,
  type VolumeParams,
} from '../core/geometry'

export interface Figure {
  base64: string
  width: number
  height: number
}

/** 给 React 静态渲染出的 <svg> 根标签补 xmlns/尺寸/字体，独立文件才能被 Image 加载 */
function standalone(svg: string, w: number, h: number): string {
  return svg.replace(
    '<svg ',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="font-family:'Microsoft YaHei',sans-serif" `,
  )
}

async function rasterize(svg: string, w: number, h: number, scale = 2): Promise<Figure> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('当前环境不支持图形渲染')
  const image = new Image()
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('SVG 渲染失败'))
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 不可用')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return { base64: canvas.toDataURL('image/png').split(',')[1], width: canvas.width, height: canvas.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 封头厚度轮廓（半剖）：直接用界面组件静态渲染，保证与界面完全一致 */
export async function domeContourFigure(input: DesignInput, result: CheckResult, W = 640, H = 310): Promise<Figure> {
  const markup = renderToStaticMarkup(createElement(DomeContour, { input, result, W, H }))
  return rasterize(standalone(markup, W, H), W, H)
}

/** 线型切点图：Φ = f(D) 曲线与允许转角水平线求交（与界面「线型切点设计」同一算法） */
export async function lineTypeFigure(input: DesignInput, result: CheckResult, W = 720, H = 380): Promise<Figure> {
  const R = input.geometry.R
  const hAxis = input.geometry.headShortAxis || R
  const vp: VolumeParams = {
    R_in: R,
    l: input.geometry.cylLength,
    lambda: lambdaFromDepth(R, hAxis),
    r0: result.derived.r0,
    Kf: 0.8,
  }
  const vol = computeVolume(vp)
  const allowed = allowedLineTypes(450, 660, 4)
  const candidates = intersectLineTypes({ lambda: vp.lambda, r0: vp.r0, Kf: vp.Kf }, vol.totalL, allowed)
  const currentD = 2 * R

  const mt = 20
  const mb = 40
  const ml = 56
  const mr = 150
  const plotW = W - ml - mr
  const plotH = H - mt - mb
  const thetas = allowed.map((r) => r.theta)
  const thetaTop = (thetas.length ? Math.max(...thetas) : 660) * 1.04
  const thetaBot = (thetas.length ? Math.min(...thetas) : 450) * 0.96
  let dMin = 0
  let dMax = 0
  const hi = solveForTheta({ lambda: vp.lambda, r0: vp.r0, Kf: vp.Kf }, vol.totalL, thetaTop)
  const lo = solveForTheta({ lambda: vp.lambda, r0: vp.r0, Kf: vp.Kf }, vol.totalL, thetaBot)
  if (hi.ok) dMin = hi.D
  if (lo.ok) dMax = lo.D
  if (!(dMax > dMin)) {
    const c = designCurve({ lambda: vp.lambda, r0: vp.r0, Kf: vp.Kf }, vol.totalL, { samples: 10 })
    if (c.length) {
      dMin = c[c.length - 1].D
      dMax = c[0].D
    }
  }
  const curve = designCurve({ lambda: vp.lambda, r0: vp.r0, Kf: vp.Kf }, vol.totalL, { dMin, dMax, samples: 140 })
  const X = (D: number) => ml + ((D - dMin) / Math.max(1e-9, dMax - dMin)) * plotW
  const Y = (theta: number) => mt + ((thetaTop - theta) / Math.max(1e-9, thetaTop - thetaBot)) * plotH

  const el: string[] = []
  const dTicks = Array.from({ length: 5 }, (_, i) => dMin + ((dMax - dMin) * i) / 4)
  const tTicks = Array.from({ length: 5 }, (_, i) => thetaBot + ((thetaTop - thetaBot) * i) / 4)
  for (const t of tTicks) {
    el.push(`<line x1="${ml}" y1="${Y(t).toFixed(1)}" x2="${W - mr}" y2="${Y(t).toFixed(1)}" stroke="#eef2f6"/>`)
    el.push(`<text x="${ml - 6}" y="${(Y(t) + 3).toFixed(1)}" font-size="10" fill="#94a3b8" text-anchor="end">${t.toFixed(0)}°</text>`)
  }
  for (const d of dTicks) {
    el.push(`<line x1="${X(d).toFixed(1)}" y1="${mt}" x2="${X(d).toFixed(1)}" y2="${H - mb}" stroke="#f1f5f9"/>`)
    el.push(`<text x="${X(d).toFixed(1)}" y="${H - mb + 14}" font-size="10" fill="#94a3b8" text-anchor="middle">${d.toFixed(0)}</text>`)
  }
  el.push(`<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${H - mb}" stroke="#cbd5e1"/>`)
  el.push(`<line x1="${ml}" y1="${H - mb}" x2="${W - mr}" y2="${H - mb}" stroke="#cbd5e1"/>`)
  el.push(`<text x="${W - mr}" y="${H - mb + 28}" font-size="10" fill="#64748b" text-anchor="end">外径 D (mm)</text>`)
  el.push(`<text x="${ml - 46}" y="${mt + 2}" font-size="10" fill="#64748b">双程转角 Φ</text>`)
  for (const c of candidates) {
    const near = Math.abs(c.D - currentD) < 1.5
    el.push(
      `<line x1="${ml}" y1="${Y(c.theta).toFixed(1)}" x2="${W - mr}" y2="${Y(c.theta).toFixed(1)}" stroke="${near ? '#1f5fa8' : '#b7c6d8'}" stroke-width="${near ? 1.6 : 1}" stroke-dasharray="6,4"/>`,
    )
    el.push(
      `<text x="${W - mr + 6}" y="${(Y(c.theta) + 3).toFixed(1)}" font-size="10.5" fill="${near ? '#1f5fa8' : '#64748b'}">θ ${c.theta.toFixed(0)}° · ${c.n} 切点</text>`,
    )
  }
  if (curve.length) {
    el.push(
      `<polyline points="${curve.map((p) => `${X(p.D).toFixed(1)},${Y(p.theta).toFixed(1)}`).join(' ')}" fill="none" stroke="#1e3a5f" stroke-width="2.4"/>`,
    )
  }
  for (const c of candidates) {
    const near = Math.abs(c.D - currentD) < 1.5
    el.push(
      `<circle cx="${X(c.D).toFixed(1)}" cy="${Y(c.theta).toFixed(1)}" r="${near ? 5 : 3.6}" fill="${near ? '#1f5fa8' : '#ffffff'}" stroke="#1f5fa8" stroke-width="1.6"/>`,
    )
  }
  if (currentD >= dMin && currentD <= dMax) {
    el.push(`<line x1="${X(currentD).toFixed(1)}" y1="${mt}" x2="${X(currentD).toFixed(1)}" y2="${H - mb}" stroke="#b45309" stroke-width="1" stroke-dasharray="3,3"/>`)
    el.push(`<text x="${X(currentD).toFixed(1)}" y="${mt + 11}" font-size="10" fill="#b45309" text-anchor="middle">当前 D=${currentD.toFixed(0)}</text>`)
  }
  if (!candidates.length) {
    el.push(`<text x="${W / 2}" y="${H / 2}" font-size="12" fill="#b91c1c" text-anchor="middle">当前容积下 Φ(D) 曲线与允许转角无交点</text>`)
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="font-family:'Microsoft YaHei',sans-serif" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${el.join('')}</svg>`
  return rasterize(svg, W, H)
}
