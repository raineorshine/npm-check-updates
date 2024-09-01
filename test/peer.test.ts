import path from 'path'
import ncu from '../src/'
import { Packument } from '../src/types/Packument'
import chaiSetup from './helpers/chaiSetup'
import stubVersions from './helpers/stubVersions'

chaiSetup()

describe('peer dependencies', function () {
  it('peer dependencies are ignored by default', async () => {
    const upgrades = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-peer': '1.0.0',
          'ncu-test-return-version': '1.0.0',
        },
      },
    })
    upgrades!.should.deep.equal({
      'ncu-test-return-version': '2.0.0',
    })
  })

  it('peer dependencies are checked when using option peer', async () => {
    const upgrades = await ncu({
      peer: true,
      packageData: {
        dependencies: {
          'ncu-test-peer': '1.0.0',
          'ncu-test-return-version': '1.0.0',
        },
      },
    })
    upgrades!.should.deep.equal({
      'ncu-test-return-version': '1.1.0',
    })
  })

  it('peer dependencies are checked iteratively when using option peer', async () => {
    const upgrades = await ncu({
      peer: true,
      packageData: {
        dependencies: {
          'ncu-test-peer-update': '1.0.0',
          'ncu-test-return-version': '1.0.0',
        },
      },
    })
    upgrades!.should.deep.equal({
      'ncu-test-return-version': '1.1.0',
      'ncu-test-peer-update': '1.1.0',
    })
  })

  it('circular peer dependencies are ignored', async () => {
    const upgrades = await ncu({
      peer: true,
      packageData: {
        dependencies: {
          '@vitest/ui': '^1.3.1',
          vitest: '^1.3.1',
        },
      },
    })
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

  it('ignores if post upgrade peers are unmet', async () => {
    const stub = stubVersions({
      '@vitest/ui': {
        version: '1.6.0',
        versions: {
          '1.3.1': {
            version: '1.3.1',
          } as Packument,
          '1.6.0': {
            version: '1.6.0',
          } as Packument,
        },
      },
      vitest: {
        version: '1.6.0',
        versions: {
          '1.3.1': {
            version: '1.3.1',
          } as Packument,
          '1.6.0': {
            version: '1.6.0',
          } as Packument,
        },
      },
      eslint: {
        version: '9.0.0',
        versions: {
          '8.57.0': {
            version: '8.57.0',
          } as Packument,
          '9.0.0': {
            version: '9.0.0',
          } as Packument,
        },
      },
      'eslint-plugin-import': {
        version: '2.29.1',
        versions: {
          '2.29.1': {
            version: '2.29.1',
          } as Packument,
        },
      },
      'eslint-plugin-unused-imports': {
        version: '4.0.0',
        versions: {
          '4.0.0': {
            version: '4.0.0',
          } as Packument,
          '3.0.0': {
            version: '3.0.0',
          } as Packument,
        },
      },
    })
    const cwd = path.join(__dirname, 'test-data/peer-post-upgrade/')
    const upgrades = await ncu({
      cwd,
      peer: true,
      target: packageName => {
        return packageName === 'eslint-plugin-unused-imports' ? 'greatest' : 'minor'
      },
    })
    upgrades!.should.have.all.keys('@vitest/ui', 'vitest')
    stub.restore()
  })

  it('ignores if post upgrade peers are unmet - no upgrades', async () => {
    const stub = stubVersions({
      eslint: {
        version: '9.0.0',
        versions: {
          '8.57.0': {
            version: '8.57.0',
          } as Packument,
          '9.0.0': {
            version: '9.0.0',
          } as Packument,
        },
      },
      'eslint-plugin-import': {
        version: '2.29.1',
        versions: {
          '2.29.1': {
            version: '2.29.1',
          } as Packument,
        },
      },
      'eslint-plugin-unused-imports': {
        version: '4.0.0',
        versions: {
          '4.0.0': {
            version: '4.0.0',
          } as Packument,
          '3.0.0': {
            version: '3.0.0',
          } as Packument,
        },
      },
    })
    const cwd = path.join(__dirname, 'test-data/peer-post-upgrade-no-upgrades/')
    const upgrades = await ncu({
      cwd,
      peer: true,
      target: packageName => {
        return packageName === 'eslint-plugin-unused-imports' ? 'greatest' : 'minor'
      },
    })
    upgrades!.should.deep.equal({})
    stub.restore()
  })
})
