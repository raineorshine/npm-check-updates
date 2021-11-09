'use strict'

const fs = require('fs')
const path = require('path')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const ncu = require('../src/')
const spawn = require('spawn-please')
const mergeOptions = require('../src/lib/mergeOptions').default

chai.should()
chai.use(chaiAsPromised)

process.env.NCU_TESTS = true

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('--deep', function () {

  const cwd = path.join(__dirname, 'deep')

  this.timeout(60000)

  let last = 0

  /** Gets information about the temporary package file. */
  function getTempPackage() {
    ++last
    const pkgDir = path.join(cwd, `tmp/tmp-pkg-${last}`)
    const rel = `./tmp/tmp-pkg-${last}/package.json`
    const pkgJson = path.join(cwd, rel)
    return {
      dir: pkgDir,
      file: pkgJson,
      rel: rel,
      data: {
        name: `tmp-pkg-${last}`,
        dependencies: {
          express: '1',
        }
      }
    }
  }

  it('do not allow --packageFile and --deep together', () => {
    ncu.run({ packageFile: './package.json', deep: true })
      .should.eventually.be.rejectedWith('Cannot specify both')
  })

  it('output json with --jsonAll', async () => {
    const deepJsonOut = await spawn('node', [bin, '--jsonAll', '--deep'], { cwd }).then(JSON.parse)
    deepJsonOut.should.have.property('package.json')
    deepJsonOut.should.have.property('pkg/sub1/package.json')
    deepJsonOut.should.have.property('pkg/sub2/package.json')
    deepJsonOut['package.json'].dependencies.should.have.property('express')
    deepJsonOut['pkg/sub1/package.json'].dependencies.should.have.property('express')
    deepJsonOut['pkg/sub2/package.json'].dependencies.should.have.property('express')
  })

  it('ignore stdin if --packageFile glob is specified', async () => {
    const pkg = getTempPackage()
    fs.mkdirSync(pkg.dir, { recursive: true })
    fs.writeFileSync(pkg.file, JSON.stringify(pkg.data))
    try {
      await spawn('node', [bin, '-u', '--packageFile', './tmp/**/package.json'], '{ "dependencies": {}}', { cwd })
      const upgradedPkg = JSON.parse(fs.readFileSync(pkg.file, 'utf-8'))
      upgradedPkg.should.have.property('dependencies')
      upgradedPkg.dependencies.should.have.property('express')
      upgradedPkg.dependencies.express.should.not.equal('1')
    }
    finally {
      fs.unlinkSync(pkg.file)
      fs.rmdirSync(pkg.dir, { recursive: true })
      fs.rmdirSync(path.join(cwd, 'tmp'), { recursive: true })
    }
  })

  it('update multiple packages', async () => {
    const pkg1 = getTempPackage()
    fs.mkdirSync(pkg1.dir, { recursive: true })
    fs.writeFileSync(pkg1.file, JSON.stringify(pkg1.data))
    const pkg2 = getTempPackage()
    fs.mkdirSync(pkg2.dir, { recursive: true })
    fs.writeFileSync(pkg2.file, JSON.stringify(pkg2.data))
    try {
      const output = await spawn('node', [bin, '-u', '--jsonUpgraded', '--packageFile', './tmp/**/package.json'], '{ "dependencies": {}}', { cwd })

      const upgradedPkg1 = JSON.parse(fs.readFileSync(pkg1.file, 'utf-8'))
      upgradedPkg1.should.have.property('dependencies')
      upgradedPkg1.dependencies.should.have.property('express')
      upgradedPkg1.dependencies.express.should.not.equal('1')

      const upgradedPkg2 = JSON.parse(fs.readFileSync(pkg2.file, 'utf-8'))
      upgradedPkg2.should.have.property('dependencies')
      upgradedPkg2.dependencies.should.have.property('express')
      upgradedPkg2.dependencies.express.should.not.equal('1')

      const json = JSON.parse(output)
      json.should.have.property(pkg1.rel)
      json.should.have.property(pkg2.rel)
      json.should.not.have.property('package.json')
    }
    finally {
      fs.unlinkSync(pkg1.file)
      fs.unlinkSync(pkg2.file)
      fs.rmdirSync(pkg1.dir, { recursive: true })
      fs.rmdirSync(pkg2.dir, { recursive: true })
      fs.rmdirSync(path.join(cwd, 'tmp'), { recursive: true })
    }
  })

  it('using --cwd is checking files from right location', async () => {
    return spawn('node', [bin, '--jsonAll', '--deep', '--cwd', './test/deep/pkg'])
      .then(JSON.parse)
      .then(deepJsonOut => {
        deepJsonOut.should.not.have.property('package.json')
        deepJsonOut.should.have.property('sub1/package.json')
        deepJsonOut.should.have.property('sub2/package.json')
      })
  })
})

describe('--deep with nested ncurc files', function () {

  const cwd = path.join(__dirname, 'deep-ncurc')

  this.timeout(60000)

  it('use ncurc of nested packages', async () => {

    const deepJsonOut = await spawn('node', [bin, '--jsonUpgraded', '--deep'], { cwd }).then(JSON.parse)

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

    const deepJsonOut = await spawn('node', [bin, '--jsonUpgraded', '--deep', '--mergeConfig'], { cwd }).then(JSON.parse)

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

  it('merge options', () => {

    /** Asserts that merging two options object deep equals the given result object. */
    const eq = (o1, o2, result, opts) => chai.expect(mergeOptions(o1, o2)).to.deep.equal(result)

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
      { a: [1, 2], b: false, c: ['1'], d1: 'd1', d2: 'd2' }
    )
  })

})
