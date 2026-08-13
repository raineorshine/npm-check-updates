import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import ncu from '../src/index.ts'
import removeDir from './helpers/removeDir.ts'
import stubVersions from './helpers/stubVersions.ts'

const packageData = JSON.stringify({
  dependencies: {
    'ncu-test-v2': '0.1.0',
  },
  devDependencies: {
    'ncu-test-tag': '0.1.0',
  },
  peerDependencies: {
    'ncu-test-10': '0.1.0',
  },
})

describe('--dep', () => {
  it('do not upgrade peerDependencies by default', async () => {
    const stub = stubVersions('99.9.9')

    const upgraded = await ncu({ packageData })

    expect(upgraded).toHaveProperty('ncu-test-v2')
    expect(upgraded).toHaveProperty('ncu-test-tag')
    expect(upgraded).not.toHaveProperty('ncu-test-10')

    stub.restore()
  })

  it('only upgrade devDependencies with --dep dev', async () => {
    const stub = stubVersions('99.9.9')

    const upgraded = await ncu({ packageData, dep: 'dev' })

    expect(upgraded).not.toHaveProperty('ncu-test-v2')
    expect(upgraded).toHaveProperty('ncu-test-tag')
    expect(upgraded).not.toHaveProperty('ncu-test-10')

    stub.restore()
  })

  it('only upgrade devDependencies and peerDependencies with --dep dev,peer', async () => {
    const stub = stubVersions('99.9.9')
    const upgraded = await ncu({ packageData, dep: 'dev,peer' })

    expect(upgraded).not.toHaveProperty('ncu-test-v2')
    expect(upgraded).toHaveProperty('ncu-test-tag')
    expect(upgraded).toHaveProperty('ncu-test-10')

    stub.restore()
  })

  describe('section isolation', () => {
    it('do not overwrite the same package in peerDependencies when upgrading devDependencies', async () => {
      const stub = stubVersions('99.9.9')
      const packageData = JSON.stringify({
        dependencies: {
          'ncu-test-v2': '0.1.0',
        },
        devDependencies: {
          'ncu-test-tag': '0.1.0',
        },
        peerDependencies: {
          'ncu-test-tag': '0.1.0',
        },
      })

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, packageData)

      try {
        await ncu({
          packageFile: pkgFile,
          jsonUpgraded: false,
          upgrade: true,
          dep: 'dev',
        })
        const pkgNew = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))

        expect(pkgNew).toStrictEqual({
          // unspecified dep sections are ignored
          dependencies: {
            'ncu-test-v2': '0.1.0',
          },
          // specified dep sections are upgraded
          devDependencies: {
            'ncu-test-tag': '99.9.9',
          },
          // unspecified dep sections are ignored, even if they have a package upgraded in another section
          peerDependencies: {
            'ncu-test-tag': '0.1.0',
          },
        })
      } finally {
        await removeDir(tempDir)
        stub.restore()
      }
    })

    it('do not overwrite the same package in devDependencies when upgrading peerDependencies', async () => {
      const stub = stubVersions('99.9.9')
      const packageData = JSON.stringify({
        dependencies: {
          'ncu-test-v2': '0.1.0',
        },
        devDependencies: {
          'ncu-test-tag': '0.1.0',
        },
        peerDependencies: {
          'ncu-test-tag': '0.1.0',
        },
      })

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, packageData)

      try {
        await ncu({
          packageFile: pkgFile,
          jsonUpgraded: false,
          upgrade: true,
          dep: 'peer',
        })
        const pkgNew = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))

        expect(pkgNew).toStrictEqual({
          // unspecified dep sections are ignored
          dependencies: {
            'ncu-test-v2': '0.1.0',
          },
          // unspecified dep sections are ignored, even if they have a package upgraded in another section
          devDependencies: {
            'ncu-test-tag': '0.1.0',
          },
          // specified dep sections are upgraded
          peerDependencies: {
            'ncu-test-tag': '99.9.9',
          },
        })
      } finally {
        await removeDir(tempDir)
        stub.restore()
      }
    })

    it('do not overwrite the same package in devDependencies when upgrading dependencies and peerDependencies', async () => {
      const stub = stubVersions('99.9.9')
      const packageData = JSON.stringify({
        dependencies: {
          'ncu-test-tag': '0.1.0',
        },
        devDependencies: {
          'ncu-test-tag': '0.1.0',
        },
        peerDependencies: {
          'ncu-test-tag': '0.1.0',
        },
      })

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, packageData)

      try {
        await ncu({
          packageFile: pkgFile,
          jsonUpgraded: false,
          upgrade: true,
          dep: 'prod,peer',
        })
        const pkgNew = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))

        expect(pkgNew).toStrictEqual({
          // specified dep sections are upgraded
          dependencies: {
            'ncu-test-tag': '99.9.9',
          },
          // unspecified dep sections are ignored, even if they have a package upgraded in another section
          devDependencies: {
            'ncu-test-tag': '0.1.0',
          },
          // specified dep sections are upgraded
          peerDependencies: {
            'ncu-test-tag': '99.9.9',
          },
        })
      } finally {
        await removeDir(tempDir)
        stub.restore()
      }
    })
  })

  // https://github.com/raineorshine/npm-check-updates/issues/1594
  describe('duplicate dependencies in different sections', () => {
    it('upgrade a package in multiple selected sections with different versions', async () => {
      const stub = stubVersions('99.9.9')
      const packageData = JSON.stringify({
        dependencies: {
          'ncu-test-v2': '^1.0.0',
        },
        peerDependencies: {
          'ncu-test-v2': '^1.1.0',
        },
      })

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, packageData)

      try {
        await ncu({ packageFile: pkgFile, jsonUpgraded: false, upgrade: true, dep: 'prod,peer' })
        const pkgNew = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))

        expect(pkgNew).toStrictEqual({
          dependencies: {
            'ncu-test-v2': '^99.9.9',
          },
          peerDependencies: {
            'ncu-test-v2': '^99.9.9',
          },
        })
      } finally {
        await removeDir(tempDir)
        stub.restore()
      }
    })

    it('preserve each section declaration style when upgrading', async () => {
      const stub = stubVersions('99.9.9')
      const packageData = JSON.stringify({
        dependencies: {
          'ncu-test-v2': '~1.0.0',
        },
        devDependencies: {
          'ncu-test-v2': '^1.1.0',
        },
      })

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, packageData)

      try {
        await ncu({ packageFile: pkgFile, jsonUpgraded: false, upgrade: true })
        const pkgNew = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))

        expect(pkgNew).toStrictEqual({
          dependencies: {
            'ncu-test-v2': '~99.9.9',
          },
          devDependencies: {
            'ncu-test-v2': '^99.9.9',
          },
        })
      } finally {
        await removeDir(tempDir)
        stub.restore()
      }
    })
  })

  describe('packageManager field', () => {
    it('upgrade packageManager field by default', async () => {
      const stub = stubVersions({
        'ncu-test-tag': '1.0.0',
        npm: '9.0.0',
      })
      const packageData = JSON.stringify(
        {
          packageManager: 'npm@6.0.0',
          dependencies: {
            'ncu-test-tag': '0.1.0',
          },
        },
        null,
        2,
      )

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, packageData)

      try {
        await ncu({
          packageFile: pkgFile,
          jsonUpgraded: false,
          upgrade: true,
        })
        const pkgDataNew = await fs.readFile(pkgFile, 'utf-8')
        const pkgNew = JSON.parse(pkgDataNew)

        expect(pkgNew).toStrictEqual({
          packageManager: 'npm@9.0.0',
          dependencies: {
            'ncu-test-tag': '1.0.0',
          },
        })
      } finally {
        await removeDir(tempDir)
        stub.restore()
      }
    })

    it('do not upgrade packageManager field if missing from --dep', async () => {
      const stub = stubVersions({
        'ncu-test-tag': '1.0.0',
        npm: '9.0.0',
      })
      const packageData = JSON.stringify(
        {
          packageManager: 'npm@6.0.0',
          dependencies: {
            'ncu-test-tag': '0.1.0',
          },
        },
        null,
        2,
      )

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, packageData)

      try {
        await ncu({
          packageFile: pkgFile,
          jsonUpgraded: false,
          upgrade: true,
          dep: ['prod'],
        })
        const pkgDataNew = await fs.readFile(pkgFile, 'utf-8')
        const pkgNew = JSON.parse(pkgDataNew)

        expect(pkgNew).toStrictEqual({
          packageManager: 'npm@6.0.0',
          dependencies: {
            'ncu-test-tag': '1.0.0',
          },
        })
      } finally {
        await removeDir(tempDir)
        stub.restore()
      }
    })

    it('do nothing if no packageManager field is present', async () => {
      const stub = stubVersions({
        'ncu-test-tag': '1.0.0',
        npm: '9.0.0',
      })
      const packageData = JSON.stringify(
        {
          dependencies: {
            'ncu-test-tag': '0.1.0',
          },
        },
        null,
        2,
      )

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, packageData)

      try {
        await ncu({
          packageFile: pkgFile,
          jsonUpgraded: false,
          upgrade: true,
        })
        const pkgDataNew = await fs.readFile(pkgFile, 'utf-8')
        const pkgNew = JSON.parse(pkgDataNew)

        expect(pkgNew).toStrictEqual({
          dependencies: {
            'ncu-test-tag': '1.0.0',
          },
        })
      } finally {
        await removeDir(tempDir)
        stub.restore()
      }
    })

    it('upgrade packageManager field if specified in --dep', async () => {
      const stub = stubVersions({
        'ncu-test-tag': '1.0.0',
        npm: '9.0.0',
      })
      const packageData = JSON.stringify(
        {
          packageManager: 'npm@6.0.0',
          dependencies: {
            'ncu-test-tag': '0.1.0',
          },
        },
        null,
        2,
      )

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, packageData)

      try {
        await ncu({
          packageFile: pkgFile,
          jsonUpgraded: false,
          upgrade: true,
          dep: ['prod', 'packageManager'],
        })
        const pkgDataNew = await fs.readFile(pkgFile, 'utf-8')
        const pkgNew = JSON.parse(pkgDataNew)

        expect(pkgNew).toStrictEqual({
          packageManager: 'npm@9.0.0',
          dependencies: {
            'ncu-test-tag': '1.0.0',
          },
        })
      } finally {
        await removeDir(tempDir)
        stub.restore()
      }
    })

    it('do not write a range into packageManager when devEngines declares the same package manager', async () => {
      const stub = stubVersions({ pnpm: '11.9.9' })
      const packageData = JSON.stringify(
        {
          packageManager: 'pnpm@11.3.0',
          devEngines: {
            packageManager: {
              name: 'pnpm',
              version: '^11.3.0',
              onFail: 'download',
            },
          },
        },
        null,
        2,
      )

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, packageData)

      try {
        await ncu({ packageFile: pkgFile, jsonUpgraded: false, upgrade: true })
        const pkgNew = JSON.parse(await fs.readFile(pkgFile, 'utf-8'))

        expect(pkgNew).toStrictEqual({
          packageManager: 'pnpm@11.9.9',
          devEngines: {
            packageManager: {
              name: 'pnpm',
              version: '^11.9.9',
              onFail: 'download',
            },
          },
        })
      } finally {
        await removeDir(tempDir)
        stub.restore()
      }
    })

    it('do nothing if packageManager is up-to-date', async () => {
      const stub = stubVersions({
        'ncu-test-tag': '1.0.0',
        npm: '9.0.0',
      })
      const packageData = JSON.stringify(
        {
          packageManager: 'npm@9.0.0',
          dependencies: {
            'ncu-test-tag': '0.1.0',
          },
        },
        null,
        2,
      )

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, packageData)

      try {
        await ncu({
          packageFile: pkgFile,
          jsonUpgraded: false,
          upgrade: true,
        })
        const pkgDataNew = await fs.readFile(pkgFile, 'utf-8')
        const pkgNew = JSON.parse(pkgDataNew)

        expect(pkgNew).toStrictEqual({
          packageManager: 'npm@9.0.0',
          dependencies: {
            'ncu-test-tag': '1.0.0',
          },
        })
      } finally {
        await removeDir(tempDir)
        stub.restore()
      }
    })
  })

  // https://github.com/raineorshine/npm-check-updates/issues/1504
  describe('devEngines field', () => {
    /** Runs ncu -u on a package file and returns the parsed result. */
    const upgrade = async (pkg: unknown, options?: Parameters<typeof ncu>[0]) => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, JSON.stringify(pkg, null, 2))
      try {
        await ncu({ packageFile: pkgFile, jsonUpgraded: false, upgrade: true, ...options })
        return JSON.parse(await fs.readFile(pkgFile, 'utf-8'))
      } finally {
        await removeDir(tempDir)
      }
    }

    it('upgrade devEngines.packageManager by default, preserving the range', async () => {
      const stub = stubVersions({ pnpm: '11.9.9' })

      try {
        expect(
          await upgrade({
            devEngines: {
              packageManager: { name: 'pnpm', version: '^11.3.0', onFail: 'download' },
            },
          }),
        ).toStrictEqual({
          devEngines: {
            packageManager: { name: 'pnpm', version: '^11.9.9', onFail: 'download' },
          },
        })
      } finally {
        stub.restore()
      }
    })

    it('upgrade each entry when devEngines.packageManager is an array', async () => {
      const stub = stubVersions({ npm: '12.0.0', pnpm: '11.9.9' })

      try {
        expect(
          await upgrade({
            devEngines: {
              packageManager: [
                { name: 'npm', version: '11.0.0' },
                { name: 'pnpm', version: '~11.3.0' },
              ],
            },
          }),
        ).toStrictEqual({
          devEngines: {
            packageManager: [
              { name: 'npm', version: '12.0.0' },
              { name: 'pnpm', version: '~11.9.9' },
            ],
          },
        })
      } finally {
        stub.restore()
      }
    })

    it('do not upgrade devEngines if missing from --dep', async () => {
      const stub = stubVersions({ pnpm: '11.9.9', 'ncu-test-v2': '1.0.0' })

      try {
        expect(
          await upgrade(
            {
              dependencies: { 'ncu-test-v2': '0.1.0' },
              devEngines: {
                packageManager: { name: 'pnpm', version: '^11.3.0' },
              },
            },
            { dep: ['prod'] },
          ),
        ).toStrictEqual({
          dependencies: { 'ncu-test-v2': '1.0.0' },
          devEngines: {
            packageManager: { name: 'pnpm', version: '^11.3.0' },
          },
        })
      } finally {
        stub.restore()
      }
    })

    it('leave devEngines.runtime alone', async () => {
      const stub = stubVersions({ node: '99.9.9', pnpm: '11.9.9' })

      try {
        expect(
          await upgrade({
            devEngines: {
              packageManager: { name: 'pnpm', version: '^11.3.0' },
              runtime: { name: 'node', version: '^24.15.0', onFail: 'error' },
            },
          }),
        ).toStrictEqual({
          devEngines: {
            packageManager: { name: 'pnpm', version: '^11.9.9' },
            runtime: { name: 'node', version: '^24.15.0', onFail: 'error' },
          },
        })
      } finally {
        stub.restore()
      }
    })

    it('ignore entries without a version', async () => {
      const stub = stubVersions({ pnpm: '11.9.9' })

      try {
        expect(
          await upgrade({
            devEngines: {
              packageManager: { name: 'pnpm', onFail: 'download' },
            },
          }),
        ).toStrictEqual({
          devEngines: {
            packageManager: { name: 'pnpm', onFail: 'download' },
          },
        })
      } finally {
        stub.restore()
      }
    })
  })
})
