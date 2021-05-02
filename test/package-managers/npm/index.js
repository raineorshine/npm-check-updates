'use strict'

const path = require('path')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const packageManagers = require('../../../src/package-managers')

chai.should()
chai.use(chaiAsPromised)

const npmTestDir = path.join(__dirname, '../../../../test/package-managers/npm')

describe('npm', function () {

  this.timeout(30000)

  it('list', async () => {
    const versionObject = await packageManagers.npm.list({ cwd: npmTestDir })
    versionObject.should.have.property('express')
  })

  it('latest', async () => {
    const version = await packageManagers.npm.latest('express', null, { cwd: npmTestDir })
    parseInt(version, 10).should.be.above(1)
  })

  it('greatest', async () => {
    const version = await packageManagers.npm.greatest('ncu-test-greatest-not-newest', null, { pre: true, cwd: npmTestDir })
    version.should.equal('2.0.0-beta')
  })

  it('ownerChanged', async () => {
    await packageManagers.npm.packageAuthorChanged('mocha', '^7.1.0', '8.0.1').should.eventually.equal(true)
    await packageManagers.npm.packageAuthorChanged('htmlparser2', '^3.10.1', '^4.0.0').should.eventually.equal(false)
    await packageManagers.npm.packageAuthorChanged('ncu-test-v2', '^1.0.0', '2.2.0').should.eventually.be.null
  })

  it('getPeerDependencies', async () => {
    await packageManagers.npm.getPeerDependencies('ncu-test-return-version', '1.0').should.eventually.deep.equal({})
    await packageManagers.npm.getPeerDependencies('ncu-test-peer', '1.0').should.eventually.deep.equal({
      'ncu-test-return-version': '1.x'
    })
  })
})
