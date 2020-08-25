'use strict'

const fs = require('fs')
const path = require('path')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const spawn = require('spawn-please')
const rimraf = require('rimraf')

chai.should()
chai.use(chaiAsPromised)

/** Run the ncu CLI. */
const ncu = (args, options) => spawn(path.join(__dirname, '../bin/cli.js'), args, options)

describe('doctor', () => {

  it('throw an error if there is no package file', async () => {
    const cwd = path.join(__dirname, 'doctor/nopackagefile')
    return ncu(['--doctor'], { cwd })
      .should.eventually.be.rejectedWith('Missing or invalid package.json')
  })

  it('throw an error if there is no test script', async () => {
    const cwd = path.join(__dirname, 'doctor/notestscript')
    return ncu(['--doctor'], { cwd })
      .should.eventually.be.rejectedWith('No npm "test" script')
  })

  it('throw an error if --packageData or --packageFile are supplied', async () => {

    return Promise.all([
      ncu(['--doctor', '--packageFile', 'package.json'])
        .should.eventually.be.rejectedWith('--packageData and --packageFile are not allowed with --doctor'),
      ncu(['--doctor', '--packageData', '{}'])
        .should.eventually.be.rejectedWith('--packageData and --packageFile are not allowed with --doctor')
    ])

  })

  it('identify broken upgrade', async function() {

    this.timeout(30000)

    const cwd = path.join(__dirname, 'doctor/fail')
    const pkgPath = path.join(cwd, 'package.json')
    const lockfilePath = path.join(cwd, 'package-lock.json')
    const nodeModulesPath = path.join(cwd, 'node_modules')
    const pkgOriginal = fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')
    let stdout = ''
    let stderr = ''

    try {
      await ncu(['--doctor'], {
        cwd,
        stdout: function(data) {
          stdout += data
        },
        stderr: function(data) {
          stderr += data
        },
      })

      throw new Error('should not resolve')
    }
    catch (e) {}

    const pkgUpgraded = fs.readFileSync(pkgPath, 'utf-8')

    // cleanup before assertions in case they fail
    fs.writeFileSync(pkgPath, pkgOriginal)
    rimraf.sync(lockfilePath)
    rimraf.sync(nodeModulesPath)

    // stdout should include successful upgrades
    stdout.should.include('✓ ncu-test-v2 ~1.0.0 → ~2.0.0')

    // stderr should include first failing upgrade
    stderr.should.include('Breaks with v2.x')
    stderr.should.include('✗ ncu-test-return-version ~1.0.0 → ~2.0.0')

    // package file should only include successful upgrades
    pkgUpgraded.should.include('"ncu-test-v2": "~2.0.0"')
    pkgUpgraded.should.include('"ncu-test-return-version": "~1.0.0"')

  })

})
