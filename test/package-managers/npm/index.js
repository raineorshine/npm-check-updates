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
})
