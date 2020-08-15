'use strict'

const fs = require('fs')
const path = require('path')
const chai = require('chai')
const chalk = require('chalk')
const chaiAsPromised = require('chai-as-promised')
const spawn = require('spawn-please')
const rimraf = require('rimraf')

const should = chai.should()
chai.use(chaiAsPromised)

describe.only('doctor', () => {

  it('throw an error if there is no package file', async () => {

    const cwd = path.join(__dirname, 'doctor/nopackagefile')
    const pkgPath = path.join(cwd, 'package.json')

    return spawn('node', [path.join(__dirname, '../bin/cli.js'), '--doctor'], { cwd })
      .should.eventually.be.rejectedWith('Missing or invalid package.json')

  })

  it('throw an error if there is no test script', async () => {

    const cwd = path.join(__dirname, 'doctor/notestscript')
    const pkgPath = path.join(cwd, 'package.json')

    return spawn('node', [path.join(__dirname, '../bin/cli.js'), '--doctor'], { cwd })
      .should.eventually.be.rejectedWith('No npm "test" script')

  })

  it('use npm install to restore lockfile if missing', async () => {

    const cwd = path.join(__dirname, 'doctor/nolockfile')
    const lockfilePath = path.join(cwd, 'package-lock.json')
    const nodeModulesPath = path.join(cwd, 'node_modules')

    try
    {
      fs.existsSync(lockfilePath).should.equal(false)
      const output = await spawn('node', [path.join(__dirname, '../bin/cli.js'), '--doctor'], { cwd })
      output.should.include('No package-lock.json found')
      fs.existsSync(lockfilePath).should.equal(true)
    }
    finally {
      fs.unlinkSync(lockfilePath)
      rimraf.sync(nodeModulesPath)
    }

  })

})
