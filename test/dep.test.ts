import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import * as ncu from '../src/'
import stubNpmView from './helpers/stubNpmView'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

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
    const stub = stubNpmView('99.9.9')

    const upgraded = await ncu.run({ packageData })

    upgraded!.should.have.property('ncu-test-v2')
    upgraded!.should.have.property('ncu-test-tag')
    upgraded!.should.not.have.property('ncu-test-10')

    stub.restore()
  })

  it('only upgrade devDependencies with --dep dev', async () => {
    const stub = stubNpmView('99.9.9')

    const upgraded = await ncu.run({ packageData, dep: 'dev' })

    upgraded!.should.not.have.property('ncu-test-v2')
    upgraded!.should.have.property('ncu-test-tag')
    upgraded!.should.not.have.property('ncu-test-10')

    stub.restore()
  })

  it('only upgrade devDependencies and peerDependencies with --dep dev,peer', async () => {
    const upgraded = await ncu.run({ packageData, dep: 'dev,peer' })

    upgraded!.should.not.have.property('ncu-test-v2')
    upgraded!.should.have.property('ncu-test-tag')
    upgraded!.should.have.property('ncu-test-10')
  })

  it('do not overwrite the same package in peerDependencies when upgrading devDependencies', async () => {
    const stub = stubNpmView('99.9.9')
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
      await ncu.run({
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
    const stub = stubNpmView('99.9.9')
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
      await ncu.run({
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
    const stub = stubNpmView('99.9.9')
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
      await ncu.run({
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
