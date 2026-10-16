import { copyFile, mkdir, readFile, stat, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// 只更新网页、桌面包与三个案例；不触碰仍在编辑的软著材料。
const root = fileURLToPath(new URL('../', import.meta.url))
const destination = path.resolve(root, '../交付')
const packageVersion = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version
// 对外版本标识 = 主.次（1.0.0 → 1.0），与界面、安装包文件名保持一致。
const version = packageVersion.split('.').slice(0, 2).join('.')
const releaseDirectory = process.argv[2] ?? 'release'
const files = [
  ['dist/index.html', '气瓶铺层设计软件-网页版.html'],
  ...['安装包', '免安装'].map((kind) => {
    const name = `气瓶铺层设计-${version}-Windows-x64-${kind}.exe`
    return [path.join(releaseDirectory, name), name]
  }),
  ...['案例-0参考铺层.xlsx', '案例-A自动生成.xlsx', '案例-B定稿.xlsx'].map((name) => [`../_work/design_case/${name}`, name]),
]
for (const [source] of files) {
  if (!(await stat(path.resolve(root, source))).isFile()) throw new Error(`缺少构建产物：${source}`)
}
await mkdir(destination, { recursive: true })
for (const [source, name] of files) {
  const src = path.resolve(root, source), dst = path.join(destination, name)
  await copyFile(src, dst)
  const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex')
  if (await hash(src) !== await hash(dst)) throw new Error(`文件复制校验失败：${name}`)
  console.log(`已更新：${name}`)
}
// 同步工作区网站文件中的本地页面；保留既有站点和远程发布标识。
const html=await readFile(path.join(root,'dist/index.html'))
for(const name of (await readdir(root)).filter(name=>name.endsWith('.qoder.site'))){
  const file=path.join(root,name),meta=JSON.parse(await readFile(file,'utf8'))
  meta.indexHtml=html.toString('base64')
  meta.indexSha256=createHash('sha256').update(html).digest('hex')
  await writeFile(file,JSON.stringify(meta))
  console.log(`已同步本地网站页面：${name}`)
}
