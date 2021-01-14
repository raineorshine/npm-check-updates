'use strict'

const path = require('path')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const ncu = require('../lib/')
const spawn = require('spawn-please')

chai.should()
chai.use(chaiAsPromised)

const bin = path.join(__dirname, '../bin/cli.js')
const cwd = path.join(__dirname, 'monorepo')

process.env.NCU_TESTS = true

describe('monorepo', function () {
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
})
