'use strict'

const fs = require('fs')
const path = require('path')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const spawn = require('spawn-please')
const rimraf = require('rimraf')
const { doctorHelpText } = require('../lib/constants.js')

chai.should()
chai.use(chaiAsPromised)

/** Run the ncu CLI. */
const ncu = (args, options) => spawn('node', [path.join(__dirname, '../bin/cli.js'), ...args], options)

describe('doctor', function() {

  // 3 min timeout
  this.timeout(3 * 60 * 1000)

  it('print instructions when -u is not specified', async () => {
    const cwd = path.join(__dirname, 'doctor/nopackagefile')
    return ncu(['--doctor'], { cwd })
      .should.eventually.equal(doctorHelpText + '\n')
  })

  it('throw an error if there is no package file', async () => {
    const cwd = path.join(__dirname, 'doctor/nopackagefile')
    return ncu(['--doctor', '-u'], { cwd })
      .should.eventually.be.rejectedWith('Missing or invalid package.json')
  })

  it('throw an error if there is no test script', async () => {
    const cwd = path.join(__dirname, 'doctor/notestscript')
    return ncu(['--doctor', '-u'], { cwd })
      .should.eventually.be.rejectedWith('No npm "test" script')
  })

  it('upgrade dependencies when tests pass', async function () {

    const cwd = path.join(__dirname, 'doctor/pass')
    const pkgPath = path.join(cwd, 'package.json')
    const lockfilePath = path.join(cwd, 'package-lock.json')
    const nodeModulesPath = path.join(cwd, 'node_modules')
    const pkgOriginal = fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')
    let stdout = ''
    let stderr = ''

    try {
      await ncu(['--doctor', '-u'], {
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
    stdout.should.include('Tests pass')
    stdout.should.include('ncu-test-v2  ~1.0.0  →  ~2.0.0')

    // stderr should include first failing upgrade
    stderr.should.equal('')

    // package file should include upgrades
    pkgUpgraded.should.include('"ncu-test-v2": "~2.0.0"')
  })

  it('pass through options', async function () {

    const cwd = path.join(__dirname, 'doctor/options')
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
    stdout.should.include('Tests pass')
    stdout.should.include('ncu-test-v2  ~1.0.0  →  ~2.0.0')

    // stderr should include first failing upgrade
    stderr.should.equal('')

    // package file should include upgrades
    pkgUpgraded.should.include('"ncu-test-v2": "~2.0.0"')
  })

  it('throw an error if --packageData or --packageFile are supplied', async () => {

    return Promise.all([
      ncu(['--doctor', '-u', '--packageFile', 'package.json'])
        .should.eventually.be.rejectedWith('--packageData and --packageFile are not allowed with --doctor'),
      ncu(['--doctor', '-u', '--packageData', '{}'])
        .should.eventually.be.rejectedWith('--packageData and --packageFile are not allowed with --doctor')
    ])

  })

  it('identify broken upgrade', async function() {

    const cwd = path.join(__dirname, 'doctor/fail')
    const pkgPath = path.join(cwd, 'package.json')
    const lockfilePath = path.join(cwd, 'package-lock.json')
    const nodeModulesPath = path.join(cwd, 'node_modules')
    const pkgOriginal = fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')
    let stdout = ''
    let stderr = ''
    let pkgUpgraded

    try {
      await ncu(['--doctor', '-u'], {
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
      rimraf.sync(lockfilePath)
      rimraf.sync(nodeModulesPath)
    }

    // stdout should include successful upgrades
    stdout.should.include('ncu-test-v2 ~1.0.0 →')
    stdout.should.not.include('ncu-test-return-version ~1.0.0 →')
    stdout.should.include('fp-and-or 0.1.1 →')

    // stderr should include first failing upgrade
    stderr.should.include('Breaks with v2.x')
    stderr.should.not.include('ncu-test-v2 ~1.0.0 →')
    stderr.should.include('ncu-test-return-version ~1.0.0 →')
    stderr.should.not.include('fp-and-or 0.1.1 →')

    // package file should only include successful upgrades
    pkgUpgraded.should.include('"ncu-test-v2": "~2.0.0"')
    pkgUpgraded.should.include('"ncu-test-return-version": "~1.0.0"')
    pkgUpgraded.should.not.include('"fp-and-or": "0.1.1"') // assert the negation since fp-and-or is a live package and I don't feel like mocking it
  })

})
