import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ncu from '../src/index.js'
import chaiSetup from './helpers/chaiSetup.js'

chaiSetup()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('peer dependencies', function () {
  it('peer dependencies are ignored by default', async () => {
    const cwd = path.join(__dirname, 'test-data/peer/')
    const upgrades = await ncu({ cwd })
    upgrades!.should.deep.equal({
      'ncu-test-return-version': '2.0.0',
    })
  })

  it('peer dependencies are checked when using option peer', async () => {
    const cwd = path.join(__dirname, 'test-data/peer/')
    const upgrades = await ncu({ cwd, peer: true })
    upgrades!.should.deep.equal({
      'ncu-test-return-version': '1.1.0',
    })
  })

  it('peer dependencies are checked iteratively when using option peer', async () => {
    const cwd = path.join(__dirname, 'test-data/peer-update/')
    const upgrades = await ncu({ cwd, peer: true })
    upgrades!.should.deep.equal({
      'ncu-test-return-version': '1.1.0',
      'ncu-test-peer-update': '1.1.0',
    })
  })

  it('circular peer dependencies are ignored', async () => {
    const cwd = path.join(__dirname, 'test-data/peer-lock/')
    const upgrades = await ncu({ cwd, peer: true })
    upgrades!.should.contain.keys('@vitest/ui', 'vitest')
  })
})
