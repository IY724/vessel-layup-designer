import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { readFileSync } from 'node:fs'

// SINGLE_FILE=1 → 把所有 JS/CSS 内联进一个 index.html，拷走双击即可离线使用（分发给别人/开源发布用）
export default defineConfig({
  base: './',
  plugins: [react(), ...(process.env.SINGLE_FILE ? [viteSingleFile()] : []), {
    name: 'report-font-license',
    transformIndexHtml: { order: 'post', handler: html => html.replace('</head>', `<!-- PDF report font: subset of Noto Serif SC, renamed Vessel Report Serif.\n${readFileSync(new URL('./src/assets/report-font/OFL.txt', import.meta.url), 'utf8')}\n-->\n</head>`) },
  }],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
