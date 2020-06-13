'use strict'

const path = require('path')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const packageManagers = require('../../lib/package-managers')

chai.should()
chai.use(chaiAsPromised)

// the directory with the test package.json
const testDir = path.resolve(path.join(__dirname, '/../ncu'))

describe('package-managers', function () {
  this.timeout(30000)

  describe('npm', () => {
    it('list', () =>
      packageManagers.npm.list({ prefix: testDir }).should.eventually.have.property('express')
    )

    it('latest', () =>
      packageManagers.npm.latest('express', null, { prefix: testDir }).then(parseInt).should.eventually.be.above(1)
    )

    it('greatest', () =>
      packageManagers.npm.greatest('ncu-test-greatest-not-newest', null, { prefix: testDir }).should.eventually.equal('2.0.0-beta')
    )
  })
})
