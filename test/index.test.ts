import fs from 'fs/promises'
import os from 'os'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
import ncu from '../src/'
import { type MockedVersions } from '../src/types/MockedVersions'
import removeDir from './helpers/removeDir'
import stubVersions from './helpers/stubVersions'
import ncuMockPreData from './test-data/packages/ncu-mock-pre.json'

const __dirname = dirname(fileURLToPath(import.meta.url))

const ncuMockPre = ncuMockPreData as MockedVersions

describe('run', function () {
  let stub: { mockRestore: () => void }
  afterEach(() => {
    if (stub) stub.mockRestore()
  })

  it('return jsonUpgraded by default', async () => {
    stub = stubVersions('99.9.9')

    const output = await ncu({
      packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package.json'), 'utf-8'),
    })
    output!.should.deep.equal({
      express: '^99.9.9',
    })
  })

  it('pass object as packageData', async () => {
    stub = stubVersions('99.9.9')

    const output = await ncu({
      packageData: {
        dependencies: {
          MOCK_PACKAGE: '1.0.0',
        },
      },
    })
    output!.should.have.property('MOCK_PACKAGE')
  })

  it('do not suggest upgrades to versions within the specified version range if jsonUpgraded is true and minimal is true', async () => {
    stub = stubVersions('2.1.1')

    const upgraded = await ncu({
      packageData: { dependencies: { MOCK_PACKAGE: '^2.1.0' } },
      jsonUpgraded: true,
      minimal: true,
    })

    upgraded!.should.not.have.property('MOCK_PACKAGE')
  })

  it('write to --packageFile and output jsonUpgraded', async () => {
    stub = stubVersions('99.9.9')
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(pkgFile, '{ "dependencies": { "express": "1" } }', 'utf-8')

    try {
      const result = await ncu({
        packageFile: pkgFile,
        jsonUpgraded: true,
        upgrade: true,
      })
      result!.should.have.property('express')

      const upgradedPkg = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
    } finally {
      await removeDir(tempDir)
    }
  })

  it('exclude -alpha, -beta, -rc', async () => {
    stub = stubVersions(ncuMockPre)
    const data = await ncu({
      jsonAll: true,
      cooldown: 5,
      packageData: {
        dependencies: {
          'ncu-mock-pre': '1.0.0',
        },
      },
    })
    data!.should.eql({
      dependencies: {
        'ncu-mock-pre': '1.0.0',
      },
    })
  })

  it('upgrade prereleases to newer prereleases', async () => {
    stub = stubVersions({
      name: 'ncu-test-alpha-latest',
      version: '1.0.0-alpha.1',
      'dist-tags': { latest: '1.0.0-alpha.2' },
      versions: {
        '1.0.0-alpha.1': { version: '1.0.0-alpha.1' },
        '1.0.0-alpha.2': { version: '1.0.0-alpha.2' },
      },
    } as MockedVersions)

    const data = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-alpha-latest': '1.0.0-alpha.1',
        },
      },
    })
    data!.should.eql({
      'ncu-test-alpha-latest': '1.0.0-alpha.2',
    })
  })

  it('do not upgrade prereleases to newer prereleases with --pre 0', async () => {
    stub = stubVersions({
      name: 'ncu-test-alpha-latest',
      version: '1.0.0-alpha.1',
      'dist-tags': { latest: '1.0.0-alpha.2' },
      versions: {
        '1.0.0-alpha.1': { version: '1.0.0-alpha.1' },
        '1.0.0-alpha.2': { version: '1.0.0-alpha.2' },
      },
    } as MockedVersions)

    const data = await ncu({
      pre: false,
      packageData: {
        dependencies: {
          'ncu-test-alpha-latest': '1.0.0-alpha.1',
        },
      },
    })
    data!.should.eql({})
  })

  it('include -alpha, -beta, -rc with --pre option', async () => {
    stub = stubVersions(ncuMockPre)
    const data = await ncu({
      jsonAll: true,
      packageData: {
        dependencies: {
          'ncu-mock-pre': '1.0.0',
        },
      },
      pre: true,
    })
    data!.should.eql({
      dependencies: {
        'ncu-mock-pre': '2.0.0-alpha.0',
      },
    })
  })

  describe('deprecated', () => {
    it('deprecated included by default', async () => {
      stub = stubVersions({ name: 'ncu-test-deprecated', version: '2.0.0', deprecated: true })
      const upgrades = await ncu({
        packageData: {
          dependencies: {
            'ncu-test-deprecated': '1.0.0',
          },
        },
      })
      upgrades!.should.deep.equal({
        'ncu-test-deprecated': '2.0.0',
      })
    })

    it('deprecated included with --deprecated', async () => {
      stub = stubVersions({ name: 'ncu-test-deprecated', version: '2.0.0', deprecated: true })
      const upgrades = await ncu({
        deprecated: true,
        packageData: {
          dependencies: {
            'ncu-test-deprecated': '1.0.0',
          },
        },
      })
      upgrades!.should.deep.equal({
        'ncu-test-deprecated': '2.0.0',
      })
    })

    it('deprecated excluded with --no-deprecated', async () => {
      stub = stubVersions({ name: 'ncu-test-deprecated', version: '2.0.0', deprecated: true })
      const upgrades = await ncu({
        deprecated: false,
        packageData: {
          dependencies: {
            'ncu-test-deprecated': '1.0.0',
          },
        },
      })
      upgrades!.should.deep.equal({})
    })
  })

  it('ignore non-string versions (sometimes used as comments)', async () => {
    stub = stubVersions({ name: '//', version: 'This is a comment' })
    const upgrades = await ncu({
      packageData: {
        dependencies: {
          '//': 'This is a comment',
        },
      },
    })
    upgrades!.should.deep.equal({})
  })

  it('update devDependency when duplicate dependency is up-to-date', async () => {
    stub = stubVersions('2.0.0')
    const upgrades = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-v2': '^2.0.0',
        },
        devDependencies: {
          'ncu-test-v2': '^1.0.0',
        },
      },
    })
    upgrades!.should.deep.equal({
      'ncu-test-v2': '^2.0.0',
    })
  })

  it('update dependency when duplicate devDependency is up-to-date', async () => {
    stub = stubVersions('2.0.0')
    const upgrades = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-v2': '^1.0.0',
        },
        devDependencies: {
          'ncu-test-v2': '^2.0.0',
        },
      },
    })
    upgrades!.should.deep.equal({
      'ncu-test-v2': '^2.0.0',
    })
  })

  // https://github.com/raineorshine/npm-check-updates/issues/1129
  it('ignore invalid semver version', async () => {
    stub = stubVersions({
      name: 'grunt-contrib-requirejs',
      version: '0.3.0',
      versions: {
        '0.3.0': { version: '0.3.0' },
        '0.3.4': { version: '0.3.4' },
        // this is not a valid semver version and should be ignored
        '0.4.0rc7': { version: '0.4.0rc7' },
      },
    } as MockedVersions)
    const upgrades = await ncu({
      // needed to cause the npm package handler to use greatest or newest and compare all published versions
      pre: true,
      target: 'minor',
      packageData: {
        dependencies: {
          'grunt-contrib-requirejs': '0.3.0',
        },
      },
    })
    upgrades!.should.deep.equal({
      'grunt-contrib-requirejs': '0.3.4',
    })
  })

  it('ignore file: and link: protocols', async () => {
    const output = await ncu({
      packageData: {
        dependencies: {
          editor: 'file:../editor',
          event: 'link:../link',
        },
      },
    })
    output!.should.deep.equal({})
  })

  describe('overrides', () => {
    it('upgrade overrides', async () => {
      stub = stubVersions('99.9.9')
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const packageFile = path.join(tempDir, 'package.json')
      await fs.writeFile(
        packageFile,
        JSON.stringify(
          {
            dependencies: {
              'ncu-test-v2': '^1.0.0',
            },
            overrides: {
              'ncu-test-v2': '^1.0.0',
            },
          },
          null,
          2,
        ),
        'utf-8',
      )

      try {
        await ncu({ packageFile, upgrade: true })

        const upgradedPkg = JSON.parse(await fs.readFile(packageFile, 'utf-8'))
        upgradedPkg.should.deep.equal({
          dependencies: {
            'ncu-test-v2': '^99.9.9',
          },
          overrides: {
            'ncu-test-v2': '^99.9.9',
          },
        })
      } finally {
        await removeDir(tempDir)
      }
    })

    it('upgrade self override', async () => {
      stub = stubVersions('99.9.9')
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const packageFile = path.join(tempDir, 'package.json')
      await fs.writeFile(
        packageFile,
        JSON.stringify(
          {
            dependencies: {
              'ncu-test-v2': '^1.0.0',
            },
            overrides: {
              'ncu-test-v2': {
                '.': '^1.0.0',
                'ncu-test-tag': '^1.0.0',
              },
            },
          },
          null,
          2,
        ),
        'utf-8',
      )

      try {
        await ncu({ packageFile, upgrade: true })

        const pkgDataNew = await fs.readFile(packageFile, 'utf-8')
        const upgradedPkg = JSON.parse(pkgDataNew)
        upgradedPkg.should.deep.equal({
          dependencies: {
            'ncu-test-v2': '^99.9.9',
          },
          overrides: {
            'ncu-test-v2': {
              '.': '^99.9.9',
              'ncu-test-tag': '^1.0.0',
            },
          },
        })
      } finally {
        await removeDir(tempDir)
      }
    })

    it('upgrade child override', async () => {
      stub = stubVersions('99.9.9')
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const packageFile = path.join(tempDir, 'package.json')
      await fs.writeFile(
        packageFile,
        JSON.stringify(
          {
            dependencies: {
              'ncu-test-v2': '^1.0.0',
            },
            overrides: {
              'ncu-test-tag': {
                'ncu-test-v2': '^1.0.0',
              },
            },
          },
          null,
          2,
        ),
        'utf-8',
      )

      try {
        await ncu({ packageFile, upgrade: true })

        const pkgDataNew = await fs.readFile(packageFile, 'utf-8')
        const upgradedPkg = JSON.parse(pkgDataNew)
        upgradedPkg.should.deep.equal({
          dependencies: {
            'ncu-test-v2': '^99.9.9',
          },
          overrides: {
            'ncu-test-tag': {
              'ncu-test-v2': '^99.9.9',
            },
          },
        })
      } finally {
        await removeDir(tempDir)
      }
    })

    it('upgrade nested override', async () => {
      stub = stubVersions('99.9.9')
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const packageFile = path.join(tempDir, 'package.json')
      await fs.writeFile(
        packageFile,
        JSON.stringify(
          {
            dependencies: {
              'ncu-test-v2': '^1.0.0',
            },
            overrides: {
              foo: {
                bar: {
                  'ncu-test-v2': '^1.0.0',
                },
              },
            },
          },
          null,
          2,
        ),
        'utf-8',
      )

      try {
        await ncu({ packageFile, upgrade: true })

        const pkgDataNew = await fs.readFile(packageFile, 'utf-8')
        const upgradedPkg = JSON.parse(pkgDataNew)
        upgradedPkg.should.deep.equal({
          dependencies: {
            'ncu-test-v2': '^99.9.9',
          },
          overrides: {
            foo: {
              bar: {
                'ncu-test-v2': '^99.9.9',
              },
            },
          },
        })
      } finally {
        await removeDir(tempDir)
      }
    })
  })

  it('does not throw when run from a subdirectory without a package.json (find-up behavior)', async () => {
    const stub = stubVersions('99.9.9')
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    const subDir = path.join(tempDir, 'subdir')
    await fs.writeFile(pkgFile, '{ "dependencies": { "express": "1.0.0" } }', 'utf-8')
    await fs.mkdir(subDir)

    try {
      // When running from a subdirectory without a package.json, ncu should use find-up to locate
      // the parent's package.json and upgrade it without throwing:
      // TypeError [ERR_INVALID_ARG_TYPE]: The "paths[0]" argument must be of type string. Received undefined
      const result = await ncu({ cwd: subDir, upgrade: true })
      result!.should.have.property('express')
    } finally {
      await removeDir(tempDir)
      stub.mockRestore()
    }
  })
})
