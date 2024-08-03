import path from 'path'
import ncu from '../src/'
import chaiSetup from './helpers/chaiSetup'

chaiSetup()

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

  // https://github.com/raineorshine/npm-check-updates/issues/1437
  it('git urls are ignored', async () => {
    const upgrades = await ncu({
      peer: true,
      packageData: {
        dependencies: {
          '@libraries/project-4-utils': 'git+gitlab.com/projects/libraries/project-4-utils.git',
        },
      },
    })
    upgrades!.should.deep.equal({})
  })
})
