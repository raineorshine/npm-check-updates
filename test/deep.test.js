'use strict'

const fs = require('fs')
const path = require('path')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const ncu = require('../lib/')
const spawn = require('spawn-please')

chai.should()
chai.use(chaiAsPromised)

const bin = path.join(__dirname, '../bin/cli.js')
const cwd = path.join(__dirname, 'deep')

process.env.NCU_TESTS = true

describe('deep', function () {

  this.timeout(30000)

  let last = 0

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

  it('output json with --jsonAll', () => {
    return spawn('node', [bin, '--jsonAll', '--deep'], { cwd: cwd })
      .then(JSON.parse)
      .then(deepJsonOut => {
        deepJsonOut.should.have.property('package.json')
        deepJsonOut.should.have.property('pkg/sub1/package.json')
        deepJsonOut.should.have.property('pkg/sub2/package.json')
        deepJsonOut['package.json'].dependencies.should.have.property('express')
      })
  })

  it('ignore stdin if --packageFile glob is specified', async () => {
    const pkg = getTempPackage()
    fs.mkdirSync(pkg.dir, { recursive: true })
    fs.writeFileSync(pkg.file, JSON.stringify(pkg.data))
    try {
      await spawn('node', [bin, '-u', '--packageFile', './tmp/**/package.json'], '{ "dependencies": {}}', { cwd: cwd })
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
      const output = await spawn('node', [bin, '-u', '--jsonUpgraded', '--packageFile', './tmp/**/package.json'], '{ "dependencies": {}}', { cwd: cwd })

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
