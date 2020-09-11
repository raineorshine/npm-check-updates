'use strict'

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const packageManagers = require('../../../lib/package-managers')

chai.should()
chai.use(chaiAsPromised)

describe('npm', function () {

  this.timeout(30000)

  it('list', async () => {
    const versionObject = await packageManagers.npm.list({ cwd: __dirname })
    versionObject.should.have.property('express')
  })

  it('latest', async () => {
    const version = await packageManagers.npm.latest('express', null, { cwd: __dirname })
    parseInt(version, 10).should.be.above(1)
  })

  it('deprecated excluded by default', async () => {
    const latest = await packageManagers.npm.latest('ncu-test-deprecated', null, { cwd: __dirname })
    latest.should.equal('1.0.0')
  })

  it('deprecated included with option', async () => {
    const latest = await packageManagers.npm.latest('ncu-test-deprecated', null, { deprecated: true, cwd: __dirname })
    latest.should.equal('2.0.0')
  })

  it('greatest', async () => {
    const version = await packageManagers.npm.greatest('ncu-test-greatest-not-newest', null, { pre: true, cwd: __dirname })
    version.should.equal('2.0.0-beta')
  })

  it('ownerChanged', async () => {
    await packageManagers.npm.packageAuthorChanged('mocha', '^7.1.0', '8.0.1').should.eventually.equal(true)
    await packageManagers.npm.packageAuthorChanged('htmlparser2', '^3.10.1', '^4.0.0').should.eventually.equal(false)
    await packageManagers.npm.packageAuthorChanged('ncu-test-v2', '^1.0.0', '2.2.0').should.eventually.be.null
  })
})
