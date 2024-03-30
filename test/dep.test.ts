import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import ncu from '../src/index.js'
import chaiSetup from './helpers/chaiSetup.js'
import stubVersions from './helpers/stubVersions.js'

chaiSetup()

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

    upgraded!.should.have.property('ncu-test-v2')
    upgraded!.should.have.property('ncu-test-tag')
    upgraded!.should.not.have.property('ncu-test-10')

    stub.restore()
  })

  it('only upgrade devDependencies with --dep dev', async () => {
    const stub = stubVersions('99.9.9')

    const upgraded = await ncu({ packageData, dep: 'dev' })

    upgraded!.should.not.have.property('ncu-test-v2')
    upgraded!.should.have.property('ncu-test-tag')
    upgraded!.should.not.have.property('ncu-test-10')

    stub.restore()
  })

  it('only upgrade devDependencies and peerDependencies with --dep dev,peer', async () => {
    const stub = stubVersions('99.9.9')
    const upgraded = await ncu({ packageData, dep: 'dev,peer' })

    upgraded!.should.not.have.property('ncu-test-v2')
    upgraded!.should.have.property('ncu-test-tag')
    upgraded!.should.have.property('ncu-test-10')

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

        pkgNew.should.deep.equal({
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
        await fs.rm(tempDir, { recursive: true, force: true })
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

        pkgNew.should.deep.equal({
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
        await fs.rm(tempDir, { recursive: true, force: true })
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

        pkgNew.should.deep.equal({
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
        await fs.rm(tempDir, { recursive: true, force: true })
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

        pkgNew.should.deep.equal({
          packageManager: 'npm@9.0.0',
          dependencies: {
            'ncu-test-tag': '1.0.0',
          },
        })
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
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

        pkgNew.should.deep.equal({
          packageManager: 'npm@6.0.0',
          dependencies: {
            'ncu-test-tag': '1.0.0',
          },
        })
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
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

        pkgNew.should.deep.equal({
          dependencies: {
            'ncu-test-tag': '1.0.0',
          },
        })
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
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

        pkgNew.should.deep.equal({
          packageManager: 'npm@9.0.0',
          dependencies: {
            'ncu-test-tag': '1.0.0',
          },
        })
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
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

        pkgNew.should.deep.equal({
          packageManager: 'npm@9.0.0',
          dependencies: {
            'ncu-test-tag': '1.0.0',
          },
        })
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
        stub.restore()
      }
    })
  })
})
