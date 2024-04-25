import { expect } from 'chai'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import ncu from '../src/'
import mergeOptions from '../src/lib/mergeOptions'
import chaiSetup from './helpers/chaiSetup'
import stubVersions from './helpers/stubVersions'

chaiSetup()

const bin = path.join(__dirname, '../build/cli.js')

/** Creates a temp directory with nested package files for --deep testing. Returns the temp directory name (should be removed by caller).
 *
 * The file tree that is created is:
 * |- package.json
 * |- packages/
 * |  - sub1/
 * |    - package.json
 * |  - sub2/
 * |    - package.json
 */
const setupDeepTest = async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
  await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
  const pkgData = JSON.stringify({
    dependencies: {
      express: '1',
    },
  })

  // write root package file
  await fs.writeFile(path.join(tempDir, 'package.json'), pkgData, 'utf-8')

  // write sub-project package files
  await fs.mkdir(path.join(tempDir, 'packages/sub1'), { recursive: true })
  await fs.writeFile(path.join(tempDir, 'packages/sub1/package.json'), pkgData, 'utf-8')
  await fs.mkdir(path.join(tempDir, 'packages/sub2'), { recursive: true })
  await fs.writeFile(path.join(tempDir, 'packages/sub2/package.json'), pkgData, 'utf-8')

  return tempDir
}

describe('--deep', { timeout: 60000 }, function () {
  let stub: { restore: () => void }
  beforeEach(() => {
    stub = stubVersions('99.9.9', { spawn: true })
  })
  afterEach(() => stub.restore())

  it('do not allow --packageFile and --deep together', async () => {
    await ncu({ packageFile: './package.json', deep: true }).should.eventually.be.rejectedWith('Cannot specify both')
  })

  it('output json with --jsonAll', async () => {
    const tempDir = await setupDeepTest()
    try {
      const { stdout } = await spawn('node', [bin, '--jsonAll', '--deep'], {}, { cwd: tempDir })
      const deepJsonOut = JSON.parse(stdout)
      deepJsonOut.should.have.property('package.json')
      deepJsonOut.should.have.property('packages/sub1/package.json')
      deepJsonOut.should.have.property('packages/sub2/package.json')
      deepJsonOut['package.json'].dependencies.should.have.property('express')
      deepJsonOut['packages/sub1/package.json'].dependencies.should.have.property('express')
      deepJsonOut['packages/sub2/package.json'].dependencies.should.have.property('express')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('ignore stdin if --packageFile glob is specified', async () => {
    const tempDir = await setupDeepTest()
    try {
      await spawn(
        'node',
        [bin, '-u', '--packageFile', path.join(tempDir, '/**/package.json')],
        { stdin: '{ "dependencies": {}}' },
        {
          cwd: tempDir,
        },
      )
      const upgradedPkg = JSON.parse(await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('update multiple packages', async () => {
    const tempDir = await setupDeepTest()
    try {
      const { stdout } = await spawn(
        'node',
        [bin, '-u', '--jsonUpgraded', '--packageFile', path.join(tempDir, '**/package.json')],
        { stdin: '{ "dependencies": {}}' },
        { cwd: tempDir },
      )

      const upgradedPkg1 = JSON.parse(await fs.readFile(path.join(tempDir, 'packages/sub1/package.json'), 'utf-8'))
      upgradedPkg1.should.have.property('dependencies')
      upgradedPkg1.dependencies.should.have.property('express')
      upgradedPkg1.dependencies.express.should.not.equal('1')

      const upgradedPkg2 = JSON.parse(await fs.readFile(path.join(tempDir, 'packages/sub2/package.json'), 'utf-8'))
      upgradedPkg2.should.have.property('dependencies')
      upgradedPkg2.dependencies.should.have.property('express')
      upgradedPkg2.dependencies.express.should.not.equal('1')

      const json = JSON.parse(stdout)
      // Make sure to fix windows paths with replace
      json.should.have.property(path.join(tempDir, 'packages/sub1/package.json').replace(/\\/g, '/'))
      json.should.have.property(path.join(tempDir, 'packages/sub2/package.json').replace(/\\/g, '/'))
      json.should.have.property(path.join(tempDir, 'package.json').replace(/\\/g, '/'))
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})

describe('--deep with nested ncurc files', { timeout: 60000 }, function () {
  const cwd = path.join(__dirname, 'test-data/deep-ncurc')

  let stub: { restore: () => void }
  beforeEach(() => {
    stub = stubVersions('99.9.9', { spawn: true })
  })
  afterEach(() => stub.restore())

  it('use ncurc of nested packages', async () => {
    const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--deep'], {}, { cwd })
    const deepJsonOut = JSON.parse(stdout)

    // root: reject: ['cute-animals']
    deepJsonOut.should.have.property('package.json')
    deepJsonOut['package.json'].should.not.have.property('cute-animals')
    deepJsonOut['package.json'].should.have.property('fp-and-or')

    // pkg1: reject: ['fp-ando-or']
    deepJsonOut.should.have.property('pkg/sub1/package.json')
    deepJsonOut['pkg/sub1/package.json'].should.have.property('cute-animals')
    deepJsonOut['pkg/sub1/package.json'].should.not.have.property('fp-and-or')
    deepJsonOut['pkg/sub1/package.json'].should.have.property('ncu-test-return-version')

    // pkg2: reject: ['cute-animals']
    deepJsonOut.should.have.property('pkg/sub2/package.json')
    deepJsonOut['pkg/sub2/package.json'].should.not.have.property('cute-animals')
    deepJsonOut['pkg/sub2/package.json'].should.have.property('fp-and-or')
    deepJsonOut['pkg/sub2/package.json'].should.have.property('ncu-test-v2')

    // pkg3: reject: ['cute-animals']
    deepJsonOut.should.have.property('pkg/sub3/package.json')
    deepJsonOut['pkg/sub3/package.json'].should.not.have.property('cute-animals')
    deepJsonOut['pkg/sub3/package.json'].should.have.property('fp-and-or')
    deepJsonOut['pkg/sub3/package.json'].should.have.property('ncu-test-v2')
  })

  it('use ncurc of nested packages with --mergeConfig option', async () => {
    const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--deep', '--mergeConfig'], {}, { cwd })
    const deepJsonOut = JSON.parse(stdout)

    // root: reject: ['cute-animals']
    deepJsonOut.should.have.property('package.json')
    deepJsonOut['package.json'].should.not.have.property('cute-animals')
    deepJsonOut['package.json'].should.have.property('fp-and-or')

    // pkg1: reject: ['fp-ando-or', 'cute-animals']
    deepJsonOut.should.have.property('pkg/sub1/package.json')
    deepJsonOut['pkg/sub1/package.json'].should.not.have.property('cute-animals')
    deepJsonOut['pkg/sub1/package.json'].should.not.have.property('fp-and-or')
    deepJsonOut['pkg/sub1/package.json'].should.have.property('ncu-test-return-version')

    // pkg2: reject: ['cute-animals']
    deepJsonOut.should.have.property('pkg/sub2/package.json')
    deepJsonOut['pkg/sub2/package.json'].should.not.have.property('cute-animals')
    deepJsonOut['pkg/sub2/package.json'].should.have.property('fp-and-or')
    deepJsonOut['pkg/sub2/package.json'].should.have.property('ncu-test-v2')

    // pkg21: explicit reject: ['fp-ando-or'] and implicit reject ['cute-animals']
    deepJsonOut.should.have.property('pkg/sub2/sub21/package.json')
    deepJsonOut['pkg/sub2/sub21/package.json'].should.not.have.property('cute-animals')
    deepJsonOut['pkg/sub2/sub21/package.json'].should.not.have.property('fp-and-or')
    deepJsonOut['pkg/sub2/sub21/package.json'].should.have.property('ncu-test-return-version')

    // pkg22: implicit reject: ['cute-animals']
    deepJsonOut.should.have.property('pkg/sub2/sub22/package.json')
    deepJsonOut['pkg/sub2/sub22/package.json'].should.not.have.property('cute-animals')
    deepJsonOut['pkg/sub2/sub22/package.json'].should.have.property('fp-and-or')
    deepJsonOut['pkg/sub2/sub22/package.json'].should.have.property('ncu-test-v2')

    // pkg3: reject: ['cute-animals']
    deepJsonOut.should.have.property('pkg/sub3/package.json')
    deepJsonOut['pkg/sub3/package.json'].should.not.have.property('cute-animals')
    deepJsonOut['pkg/sub3/package.json'].should.have.property('fp-and-or')
    deepJsonOut['pkg/sub3/package.json'].should.have.property('ncu-test-v2')

    // pkg31: explicit reject: ['fp-ando-or'] and implicit reject ['cute-animals']
    deepJsonOut.should.have.property('pkg/sub3/sub31/package.json')
    deepJsonOut['pkg/sub3/sub31/package.json'].should.not.have.property('cute-animals')
    deepJsonOut['pkg/sub3/sub31/package.json'].should.not.have.property('fp-and-or')
    deepJsonOut['pkg/sub3/sub31/package.json'].should.have.property('ncu-test-return-version')

    // pkg32: implicit reject: ['cute-animals']
    deepJsonOut.should.have.property('pkg/sub3/sub32/package.json')
    deepJsonOut['pkg/sub3/sub32/package.json'].should.not.have.property('cute-animals')
    deepJsonOut['pkg/sub3/sub32/package.json'].should.have.property('fp-and-or')
    deepJsonOut['pkg/sub3/sub32/package.json'].should.have.property('ncu-test-v2')
  })
})

describe('mergeOptions', function () {
  it('merge options', () => {
    /** Asserts that merging two options object deep equals the given result object. */
    const eq = (
      o1: Record<string, unknown> | null,
      o2: Record<string, unknown> | null,
      result: Record<string, unknown>,
    ) => expect(mergeOptions(o1, o2)).to.deep.equal(result)

    // trivial cases
    eq(null, null, {})
    eq({}, {}, {})

    // standard merge not broken
    eq({ a: 1 }, {}, { a: 1 })
    eq({}, { a: 1 }, { a: 1 })
    eq({ a: 1 }, { a: 2 }, { a: 2 })

    // merge arrays (non standard behavior)
    eq({ a: [1] }, { a: [2] }, { a: [1, 2] })
    eq({ a: [1, 2] }, { a: [2, 3] }, { a: [1, 2, 3] })

    // if property types different, then apply standard merge behavior
    eq({ a: 1 }, { a: [2] }, { a: [2] })

    // all together
    eq(
      { a: [1], b: true, c: 1, d1: 'd1' },
      { a: [2], b: false, c: ['1'], d2: 'd2' },
      { a: [1, 2], b: false, c: ['1'], d1: 'd1', d2: 'd2' },
    )
  })
})
