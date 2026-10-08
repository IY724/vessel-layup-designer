/** colors.ts — 角度组配色（与 GUI 设计图一致，超出预置角度时按色环取色） */
const BASE: Record<number, string> = {
  10: '#3b82f6',
  12: '#0ea5e9',
  15: '#14b8a6',
  17: '#10b981',
  20: '#84cc16',
  25: '#f59e0b',
  30: '#f97316',
  37: '#ef4444',
  40: '#8b5cf6',
  45: '#06b6d4',
  50: '#a855f7',
  55: '#ec4899',
  60: '#6366f1',
  90: '#64748b',
}

const FALLBACK = ['#0891b2', '#7c3aed', '#db2777', '#65a30d', '#ca8a04', '#0d9488', '#4f46e5', '#be123c']

export const CYL_COLOR: Record<number, string> = BASE

export function angleColor(angle: number, index = 0): string {
  const key = Math.round(angle * 100) / 100
  return BASE[key] ?? FALLBACK[index % FALLBACK.length]
}
