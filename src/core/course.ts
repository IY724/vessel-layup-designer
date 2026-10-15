/** 课件原表中的常数与半径列。保留原表混用 PI() / 3.1415926 的实际写法。 */
export const COURSE_PI = 3.1415926
export const CYLINDER_RAD = COURSE_PI / 180

/** 原表半径列：30.2、32、33…173、173.5；31 mm 行在原表中不存在。 */
export function courseGrid(rFirst: number, R: number): number[] {
  if (!(R > 0) || !(rFirst < R)) return []
  const first = Math.ceil(rFirst * 10) / 10
  const grid = first < R ? [first] : []
  for (let r = Math.floor(first) + 2; r < R; r++) grid.push(r)
  grid.push(R)
  return grid
}
