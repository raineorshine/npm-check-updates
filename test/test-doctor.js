'use strict'

const fs = require('fs')
const path = require('path')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const spawn = require('spawn-please')
const rimraf = require('rimraf')

chai.should()
chai.use(chaiAsPromised)

describe('doctor', () => {

  it('throw an error if there is no package file', async () => {
    const cwd = path.join(__dirname, 'doctor/nopackagefile')
    return spawn('node', [path.join(__dirname, '../bin/cli.js'), '--doctor'], { cwd })
      .should.eventually.be.rejectedWith('Missing or invalid package.json')
  })

  it('throw an error if there is no test script', async () => {
    const cwd = path.join(__dirname, 'doctor/notestscript')
    return spawn('node', [path.join(__dirname, '../bin/cli.js'), '--doctor'], { cwd })
      .should.eventually.be.rejectedWith('No npm "test" script')
  })

  it('throw an error if --packageData or --packageFile are supplied', async () => {

    return Promise.all([
      spawn('node', [path.join(__dirname, '../bin/cli.js'), '--doctor', '--packageFile', 'package.json'])
        .should.eventually.be.rejectedWith('--packageData and --packageFile are not allowed with --doctor'),
      spawn('node', [path.join(__dirname, '../bin/cli.js'), '--doctor', '--packageData', '{}'])
        .should.eventually.be.rejectedWith('--packageData and --packageFile are not allowed with --doctor')
    ])

  })

  it('identify broken upgrade', async function() {

    this.timeout(30000)

    const cwd = path.join(__dirname, 'doctor/fail')
    const pkgPath = path.join(cwd, 'package.json')
    const lockfilePath = path.join(cwd, 'package-lock.json')
    const nodeModulesPath = path.join(cwd, 'node_modules')
    const pkgOriginal = fs.readFileSync(path.join(cwd, 'package-original.json'), 'utf-8')
    let stdout = ''
    let stderr = ''

    try {
      await spawn('node', [path.join(__dirname, '../bin/cli.js'), '--doctor'], {
        cwd,
        stdout: function(data) {
          stdout += data
        },
        stderr: function(data) {
          stderr += data
        },
      })
    }
    catch (e) {
      stdout.should.include('✓ ncu-test-v2 1.0.0 → 2.0.0')
      stdout.should.include('Breaks with v2.x')
      stderr.should.include('✗ ncu-test-return-version 1.0.0 → 2.0.0')
    }
    finally {
      fs.writeFileSync(pkgPath, pkgOriginal)
      fs.unlinkSync(lockfilePath)
      rimraf.sync(nodeModulesPath)
    }

  })

})
