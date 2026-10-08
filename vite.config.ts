import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// SINGLE_FILE=1 → 把所有 JS/CSS 内联进一个 index.html，拷走双击即可离线使用（分发给别人/开源发布用）
export default defineConfig({
  base: './',
  plugins: [react(), ...(process.env.SINGLE_FILE ? [viteSingleFile()] : [])],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
