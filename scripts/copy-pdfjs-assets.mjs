import { cp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const src = path.join(root, 'node_modules', 'pdfjs-dist')
const dest = path.join(root, 'public', 'pdfjs')

if (!existsSync(src)) {
  console.warn('pdfjs-dist not found in node_modules, skipping asset copy')
  process.exit(0)
}

const assetDirs = ['cmaps', 'standard_fonts', 'wasm', 'iccs']

await rm(dest, { recursive: true, force: true })

for (const dir of assetDirs) {
  const from = path.join(src, dir)
  if (!existsSync(from)) continue
  await cp(from, path.join(dest, dir), { recursive: true })
}

console.log(`Copied pdfjs-dist assets (${assetDirs.join(', ')}) to public/pdfjs/`)
