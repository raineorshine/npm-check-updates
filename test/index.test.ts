import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import ncu from '../src/'
import chaiSetup from './helpers/chaiSetup'
import stubVersions from './helpers/stubVersions'

chaiSetup()

describe('run', function () {
  it('return jsonUpgraded by default', async () => {
    const stub = stubVersions('99.9.9')

    const output = await ncu({
      packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package.json'), 'utf-8'),
    })
    output!.should.deep.equal({
      express: '^99.9.9',
    })

    stub.restore()
  })

  it('pass object as packageData', async () => {
    const stub = stubVersions('99.9.9')

    const output = await ncu({
      packageData: {
        dependencies: {
          MOCK_PACKAGE: '1.0.0',
        },
      },
    })
    output!.should.have.property('MOCK_PACKAGE')

    stub.restore()
  })

  it('do not suggest upgrades to versions within the specified version range if jsonUpgraded is true and minimal is true', async () => {
    const stub = stubVersions('2.1.1')

    const upgraded = await ncu({
      packageData: { dependencies: { MOCK_PACKAGE: '^2.1.0' } },
      jsonUpgraded: true,
      minimal: true,
    })

    upgraded!.should.not.have.property('MOCK_PACKAGE')

    stub.restore()
  })

  it('write to --packageFile and output jsonUpgraded', async () => {
    const stub = stubVersions('99.9.9')
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
      await fs.rm(tempDir, { recursive: true, force: true })
      stub.restore()
    }
  })

  it('exclude -alpha, -beta, -rc', () => {
    return ncu({
      jsonAll: true,
      packageData: {
        dependencies: {
          'ncu-mock-pre': '1.0.0',
        },
      },
    }).then(data => {
      return data!.should.eql({
        dependencies: {
          'ncu-mock-pre': '1.0.0',
        },
      })
    })
  })

  it('upgrade prereleases to newer prereleases', () => {
    return ncu({
      packageData: {
        dependencies: {
          'ncu-test-alpha-latest': '1.0.0-alpha.1',
        },
      },
    }).then(data => {
      return data!.should.eql({
        'ncu-test-alpha-latest': '1.0.0-alpha.2',
      })
    })
  })

  it('do not upgrade prereleases to newer prereleases with --pre 0', () => {
    return ncu({
      pre: false,
      packageData: {
        dependencies: {
          'ncu-test-alpha-latest': '1.0.0-alpha.1',
        },
      },
    }).then(data => {
      return data!.should.eql({})
    })
  })

  it('include -alpha, -beta, -rc with --pre option', () => {
    return ncu({
      jsonAll: true,
      packageData: {
        dependencies: {
          'ncu-mock-pre': '1.0.0',
        },
      },
      pre: true,
    }).then(data => {
      return data!.should.eql({
        dependencies: {
          'ncu-mock-pre': '2.0.0-alpha.0',
        },
      })
    })
  })

  describe('deprecated', () => {
    it('deprecated included by default', async () => {
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
    const stub = stubVersions('2.0.0')
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
    stub.restore()
  })

  it('update dependency when duplicate devDependency is up-to-date', async () => {
    const stub = stubVersions('2.0.0')
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
    stub.restore()
  })

  // https://github.com/raineorshine/npm-check-updates/issues/1129
  it('ignore invalid semver version', async () => {
    const upgrades = await ncu({
      // needed to cause the npm package handler to use greatest or newest and compare all published versions
      target: 'minor',
      packageData: {
        dependencies: {
          // grunt-contrib-requirejs contains 0.4.0rc7 which is not valid semver
          'grunt-contrib-requirejs': '0.3.0',
        },
      },
    })
    upgrades!.should.haveOwnProperty('grunt-contrib-requirejs')
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
      const stub = stubVersions('99.9.9')
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
        await fs.rm(tempDir, { recursive: true, force: true })
        stub.restore()
      }
    })

    it('upgrade self override', async () => {
      const stub = stubVersions('99.9.9')
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
        await fs.rm(tempDir, { recursive: true, force: true })
        stub.restore()
      }
    })

    it('upgrade child override', async () => {
      const stub = stubVersions('99.9.9')
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
        await fs.rm(tempDir, { recursive: true, force: true })
        stub.restore()
      }
    })

    it('upgrade nested override', async () => {
      const stub = stubVersions('99.9.9')
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
        await fs.rm(tempDir, { recursive: true, force: true })
        stub.restore()
      }
    })
  })
})
