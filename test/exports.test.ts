import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const esm = await import(pathToFileURL(path.join(__dirname, '../build/index.js')).href)
const cjs = require('../build/index.js')

describe('package exports', () => {
  it('ESM: default export is callable and namespaced', () => {
    expect(esm.default).toBeTypeOf('function')
    expect(esm.default.run).toBe(esm.default)
    expect(esm.default.defineConfig).toBeTypeOf('function')
    expect(esm.run).toBeTypeOf('function')
    expect(esm.defineConfig).toBeTypeOf('function')
  })

  it('CJS: require(ESM) exposes the callable on .default plus named exports', () => {
    expect(cjs.default).toBeTypeOf('function')
    expect(cjs.default.run).toBe(cjs.default)
    expect(cjs.run).toBeTypeOf('function')
    expect(cjs.defineConfig).toBeTypeOf('function')
  })
})
