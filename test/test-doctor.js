'use strict'

const fs = require('fs')
const path = require('path')
const chai = require('chai')
const chalk = require('chalk')
const chaiAsPromised = require('chai-as-promised')
const spawn = require('spawn-please')

const should = chai.should()
chai.use(chaiAsPromised)

describe.only('doctor', () => {

  it('run npm install if there is no lockfile', async () => {

    const lockfilePath = path.join(__dirname, 'doctor/nolockfile/package-lock.json')
    const cwd = path.join(__dirname, 'doctor/nolockfile')

    try
    {
      fs.existsSync(lockfilePath).should.equal(false)
      const output = await spawn('node', [path.join(__dirname, '../bin/cli.js'), '--doctor'], { cwd })
      output.should.include('No package-lock.json found')
      fs.existsSync(lockfilePath).should.equal(true)
    }
    finally {
      fs.unlinkSync(lockfilePath)
    }

  })

})
