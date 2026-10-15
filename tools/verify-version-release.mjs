// 版本一致性检查：对外标识 V1.0 是否贯穿版本源、界面、安装包、交付与文档。
// 用法：npm run build:single && npm run build:win && node tools/publish-local.mjs && node tools/verify-version-release.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { extractFile } from '@electron/asar'

const root = fileURLToPath(new URL('../', import.meta.url))
const deliver = path.resolve(root, '../交付')
const out = path.resolve(root, '../_版本统一_20261015')
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

const checks = []
const step = async (name, fn) => {
  const value = await fn()
  checks.push({ name, ...(value === undefined ? {} : { value }) })
}

// 1. 版本源：package.json 的 semver 是唯一来源，对外标识取主.次
const packageVersion = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version
const label = packageVersion.split('.').slice(0, 2).join('.')
const display = `V${label}`
await step('版本源 package.json', () => (assert.match(packageVersion, /^\d+\.\d+\.\d+$/), packageVersion))
await step('对外标识', () => display)

// 2. builder.json 里硬编码的文件名版本必须与版本源的主.次一致（防止升版漏改）
const builder = JSON.parse(await fs.readFile(path.join(root, 'desktop/builder.json'), 'utf8'))
await step('安装包命名与版本源一致', () => {
  for (const [kind, cfg] of [['安装包', builder.nsis], ['免安装', builder.portable]]) {
    assert.ok(cfg.artifactName.includes(`-${label}-`), `${kind} 的 artifactName 未使用 ${label}：${cfg.artifactName}`)
  }
  return label
})

// 3. 界面与桌面都从版本源派生标识，不写死构建号
const mainCjs = await fs.readFile(path.join(root, 'desktop/main.cjs'), 'utf8')
const appTsx = await fs.readFile(path.join(root, 'src/App.tsx'), 'utf8')
await step('界面与桌面派生版本标识', () => {
  assert.ok(/releaseLabel/.test(appTsx) && /V\$\{packageVersion\.split/.test(appTsx), 'src/App.tsx 未从 package.json 派生标识')
  assert.ok(/releaseLabel/.test(mainCjs) && !/V\$\{app\.getVersion\(\)\}/.test(mainCjs), 'desktop/main.cjs 仍在直接显示三段式版本')
})

// 4. 单文件页面：内嵌版本源、无旧构建号残留
const sharedHtml = await fs.readFile(path.join(root, 'dist/index.html'))
const htmlSha = sha(sharedHtml)
await step('页面内嵌版本源', () => {
  const text = sharedHtml.toString()
  assert.ok(text.includes(packageVersion), `dist/index.html 未内嵌 ${packageVersion}`)
  assert.doesNotMatch(text, /V1\.[1-9]/, 'dist/index.html 残留旧对外标识 V1.1')
  // 只盯上一版构建号；包体里 1.1.x 形式的依赖版本号（OID、semver 区间）不算残留
  assert.ok(!text.includes('1.1.2'), 'dist/index.html 残留上一版构建号 1.1.2')
})
await step('页面 SHA-256', () => htmlSha)

// 5. 安装包产物按 1.0 命名，且构建目录与交付目录不留旧版本包
const artifacts = ['安装包', '免安装'].map((kind) => `气瓶铺层设计-${label}-Windows-x64-${kind}.exe`)
await step('安装包产物齐备', async () => {
  for (const name of artifacts) {
    assert.ok((await fs.stat(path.join(root, 'release', name))).isFile(), `缺少 release/${name}`)
    assert.ok((await fs.stat(path.join(deliver, name))).isFile(), `缺少 交付/${name}`)
    assert.ok((await fs.stat(path.join(root, 'release', name))).size > 1e8, `${name} 体积异常，可能只是便携版外壳`)
  }
  return artifacts
})
await step('无旧版本产物残留', async () => {
  for (const dir of [path.join(root, 'release'), deliver]) {
    const stale = (await fs.readdir(dir)).filter((name) => /气瓶铺层设计-1\.(?!0-)|V1\.[1-9]/.test(name))
    assert.deepEqual(stale, [], `${path.relative(root, dir)} 残留旧版本文件：${stale.join('、')}`)
  }
})

// 6. 四处页面身份必须逐字节一致：构建页 = 桌面包内页 = 交付网页 = 站点内嵌页
const asar = path.join(root, 'release/win-unpacked/resources/app.asar')
await step('桌面包内页面一致', () => assert.equal(sha(extractFile(asar, 'dist/index.html')), htmlSha))
await step('桌面包内版本源一致', () => {
  const packaged = JSON.parse(extractFile(asar, 'package.json').toString())
  assert.equal(packaged.version, packageVersion)
  return packaged.version
})
await step('交付网页版一致', async () =>
  assert.equal(sha(await fs.readFile(path.join(deliver, '气瓶铺层设计软件-网页版.html'))), htmlSha))
const siteName = (await fs.readdir(root)).find((name) => name.endsWith('.qoder.site'))
await step('站点内嵌页面一致', async () => {
  const site = JSON.parse(await fs.readFile(path.join(root, siteName), 'utf8'))
  assert.equal(site.indexSha256, htmlSha)
  assert.equal(sha(Buffer.from(site.indexHtml, 'base64')), htmlSha)
  return site.name
})

// 7. 软著与交付材料：文件名与正文都不得停留在旧版本号
await step('软著材料标识', async () => {
  const seen = []
  for (const dir of [path.join(root, 'docs'), deliver]) {
    for (const name of await fs.readdir(dir)) {
      if (!/软著/.test(name)) continue
      seen.push(name)
      assert.doesNotMatch(name, /V1\.[1-9]/, `${name} 仍是旧版本号`)
      if (name.endsWith('.md')) {
        const text = await fs.readFile(path.join(dir, name), 'utf8')
        assert.doesNotMatch(text, /V1\.1/, `${name} 正文仍写 V1.1`)
        assert.ok(text.includes(display), `${name} 正文未出现 ${display}`)
      }
    }
  }
  assert.ok(seen.length >= 6, `软著材料数量异常：${seen.length}`)
  return `${seen.length} 份`
})

const report = {
  packageVersion,
  releaseLabel: display,
  sharedHtmlSha256: htmlSha,
  artifacts,
  passed: checks.map((c) => c.name),
  checkedAt: new Date().toISOString(),
}
await fs.mkdir(out, { recursive: true })
await fs.writeFile(path.join(out, '版本一致性检查.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
console.log(`全部通过：${checks.length} 项`)
