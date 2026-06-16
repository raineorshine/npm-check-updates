import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect } from 'chai'
import chaiSetup from './helpers/chaiSetup.ts'

// Resolve the builds at module load so the globals they set (e.g. zod's) land
// before mocha's check-leaks baseline.

chaiSetup()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const esm = await import(pathToFileURL(path.join(__dirname, '../build/index.js')).href)
const cjs = require('../build/index.cjs')

describe('package exports', () => {
  it('ESM build: default export is callable and namespaced', () => {
    expect(esm.default).to.be.a('function')
    expect(esm.default.run).to.equal(esm.default)
    expect(esm.default.defineConfig).to.be.a('function')
    expect(esm.run).to.be.a('function')
    expect(esm.defineConfig).to.be.a('function')
  })

  it('CJS build: require() returns the callable run function', () => {
    expect(cjs).to.be.a('function')
    expect(cjs.run).to.equal(cjs)
    expect(cjs.defineConfig).to.be.a('function')
  })
})
