'use strict'

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const packageManagers = require('../../../lib/package-managers')

chai.should()
chai.use(chaiAsPromised)

describe('npm', function () {

  this.timeout(30000)

  it('list', async () =>
    await packageManagers.npm.list({ cwd: __dirname })
      .should.eventually.have.property('express')
  )

  it('latest', async () =>
    await packageManagers.npm.latest('express', null, { cwd: __dirname })
      .then(parseInt)
      .should.eventually.be.above(1)
  )

  it('greatest', async () =>
    await packageManagers.npm.greatest('ncu-test-greatest-not-newest', null, { cwd: __dirname })
      .should.eventually.equal('2.0.0-beta')
  )

  it('ownerChanged', async () => {
    await packageManagers.npm.packageAuthorChanged('mocha', '^7.1.0', '8.0.1').should.eventually.equal(true)
    await packageManagers.npm.packageAuthorChanged('htmlparser2', '^3.10.1', '^4.0.0').should.eventually.equal(false)
    await packageManagers.npm.packageAuthorChanged('ncu-test-v2', '^1.0.0', '2.2.0').should.eventually.be.null
  })
})
