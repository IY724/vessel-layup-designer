import { build } from 'vite'
import { fileURLToPath } from 'node:url'

process.env.SINGLE_FILE = '1'
await build({ root: fileURLToPath(new URL('../', import.meta.url)) })
