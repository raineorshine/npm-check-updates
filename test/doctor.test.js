'use strict'

const fs = require('fs')
const path = require('path')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const spawn = require('spawn-please')
const rimraf = require('rimraf')
const stripAnsi = require('strip-ansi')
const { doctorHelpText } = require('../src/constants')

chai.should()
chai.use(chaiAsPromised)
process.env.NCU_TESTS = 'true'

const bin = path.join(__dirname, '../build/src/bin/cli.js')
const doctorTests = path.join(__dirname, 'doctor')

/** Run the ncu CLI. */
const ncu = (args, options) => spawn('node', [bin, ...args], options)

/** Assertions for npm or yarn when tests pass. */
const testPass = ({ packageManager }) => {

  it('upgrade dependencies when tests pass', async function () {

    const cwd = path.join(doctorTests, 'pass')
    const pkgPath = path.join(cwd, 'package.json')
    const nodeModulesPath = path.join(cwd, 'node_modules')
    const lockfilePath = path.join(cwd, packageManager === 'npm' ? 'package-lock.json' : 'yarn.lock')
    const pkgOriginal = fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')
    let stdout = ''
    let stderr = ''

    // touch yarn.lock (see pass/README)
    if (packageManager === 'yarn') {
      fs.writeFileSync(lockfilePath, '')
    }

    try {
      // explicitly set packageManager to avoid auto yarn detection
      await ncu(['--doctor', '-u', '-p', packageManager], {
        cwd,
        stdout: function (data) {
          stdout += data
        },
        stderr: function (data) {
          stderr += data
        },
      })
    }
    catch (e) {}

    const pkgUpgraded = fs.readFileSync(pkgPath, 'utf-8')

    // cleanup before assertions in case they fail
    fs.writeFileSync(pkgPath, pkgOriginal)
    rimraf.sync(nodeModulesPath)
    rimraf.sync(lockfilePath)

    // delete yarn cache
    if (packageManager === 'yarn') {
      rimraf.sync(path.join(cwd, '.yarn'))
      rimraf.sync(path.join(cwd, '.pnp.js'))
    }

    // stdout should include normal output
    stderr.should.equal('')
    stripAnsi(stdout).should.include('Tests pass')
    stripAnsi(stdout).should.include('ncu-test-v2  ~1.0.0  →  ~2.0.0')

    // stderr should include first failing upgrade
    stderr.should.equal('')

    // package file should include upgrades
    pkgUpgraded.should.include('"ncu-test-v2": "~2.0.0"')
  })

}

/** Assertions for npm or yarn when tests fail. */
const testFail = ({ packageManager }) => {

  it('identify broken upgrade', async function() {

    const cwd = path.join(doctorTests, 'fail')
    const pkgPath = path.join(cwd, 'package.json')
    const nodeModulesPath = path.join(cwd, 'node_modules')
    const lockfilePath = path.join(cwd, packageManager === 'npm' ? 'package-lock.json' : 'yarn.lock')
    const pkgOriginal = fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')
    let stdout = ''
    let stderr = ''
    let pkgUpgraded

    // touch yarn.lock (see fail/README)
    if (packageManager === 'yarn') {
      fs.writeFileSync(lockfilePath, '')
    }

    try {
      // explicitly set packageManager to avoid auto yarn detection
      await ncu(['--doctor', '-u', '-p', packageManager], {
        cwd,
        stdout: function (data) {
          stdout += data
        },
        stderr: function (data) {
          stderr += data
        },
      })
    }
    finally {
      pkgUpgraded = fs.readFileSync(pkgPath, 'utf-8')
      fs.writeFileSync(pkgPath, pkgOriginal)
      rimraf.sync(nodeModulesPath)
      rimraf.sync(lockfilePath)

      // delete yarn cache
      if (packageManager === 'yarn') {
        rimraf.sync(path.join(cwd, '.yarn'))
        rimraf.sync(path.join(cwd, '.pnp.js'))
      }
    }

    // stdout should include successful upgrades
    stdout.should.include('ncu-test-v2 ~1.0.0 →')
    stdout.should.not.include('ncu-test-return-version ~1.0.0 →')
    stdout.should.include('emitter20 1.0.0 →')

    // stderr should include first failing upgrade
    stderr.should.include('Breaks with v2.x')
    stderr.should.not.include('ncu-test-v2 ~1.0.0 →')
    stderr.should.include('ncu-test-return-version ~1.0.0 →')
    stderr.should.not.include('emitter20 1.0.0 →')

    // package file should only include successful upgrades
    pkgUpgraded.should.include('"ncu-test-v2": "~2.0.0"')
    pkgUpgraded.should.include('"ncu-test-return-version": "~1.0.0"')
    pkgUpgraded.should.not.include('"emitter20": "1.0.0"') // assert the negation since emitter20 is a live package and the latest version could change (it would be better to mock this)
  })
}

describe('doctor', function() {

  // 3 min timeout
  this.timeout(3 * 60 * 1000)

  describe('npm', () => {

    it('print instructions when -u is not specified', async () => {
      const cwd = path.join(doctorTests, 'nopackagefile')
      return ncu(['--doctor'], { cwd })
        .should.eventually.equal(doctorHelpText + '\n')
    })

    it('throw an error if there is no package file', async () => {
      const cwd = path.join(doctorTests, 'nopackagefile')
      return ncu(['--doctor', '-u'], { cwd })
        .should.eventually.be.rejectedWith('Missing or invalid package.json')
    })

    it('throw an error if there is no test script', async () => {
      const cwd = path.join(doctorTests, 'notestscript')
      return ncu(['--doctor', '-u'], { cwd })
        .should.eventually.be.rejectedWith('No npm "test" script')
    })

    it('throw an error if --packageData or --packageFile are supplied', async () => {

      return Promise.all([
        ncu(['--doctor', '-u', '--packageFile', 'package.json'])
          .should.eventually.be.rejectedWith('--packageData and --packageFile are not allowed with --doctor'),
        ncu(['--doctor', '-u', '--packageData', '{}'])
          .should.eventually.be.rejectedWith('--packageData and --packageFile are not allowed with --doctor')
      ])

    })

    testPass({ packageManager: 'npm' })
    testFail({ packageManager: 'npm' })

    it('pass through options', async function () {

      const cwd = path.join(doctorTests, 'options')
      const pkgPath = path.join(cwd, 'package.json')
      const lockfilePath = path.join(cwd, 'package-lock.json')
      const nodeModulesPath = path.join(cwd, 'node_modules')
      const pkgOriginal = fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')
      let stdout = ''
      let stderr = ''

      try {
        // check only ncu-test-v2 (excluding ncu-return-version)
        await ncu(['--doctor', '-u', '--filter', 'ncu-test-v2'], {
          cwd,
          stdout: function (data) {
            stdout += data
          },
          stderr: function (data) {
            stderr += data
          },
        })
      }
      catch (e) {}

      const pkgUpgraded = fs.readFileSync(pkgPath, 'utf-8')

      // cleanup before assertions in case they fail
      fs.writeFileSync(pkgPath, pkgOriginal)
      rimraf.sync(lockfilePath)
      rimraf.sync(nodeModulesPath)

      // stdout should include normal output
      stderr.should.equal('')
      stripAnsi(stdout).should.include('Tests pass')
      stripAnsi(stdout).should.include('ncu-test-v2  ~1.0.0  →  ~2.0.0')

      // stderr should include first failing upgrade
      stderr.should.equal('')

      // package file should include upgrades
      pkgUpgraded.should.include('"ncu-test-v2": "~2.0.0"')
    })

  })

  describe('yarn', () => {

    testPass({ packageManager: 'yarn' })
    testFail({ packageManager: 'yarn' })

  })

})
