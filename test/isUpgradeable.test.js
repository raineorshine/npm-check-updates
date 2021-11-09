'use strict'

const chai = require('chai')
const isUpgradeable = require('../src/lib/isUpgradeable').default

chai.should()
process.env.NCU_TESTS = true

describe('isUpgradeable', () => {

  it('do not upgrade pure wildcards', () => {
    isUpgradeable('*', '0.5.1').should.equal(false)
  })

  it('upgrade versions that do not satisfy latest versions', () => {
    isUpgradeable('0.1.x', '0.5.1').should.equal(true)
  })

  it('do not upgrade invalid versions', () => {
    isUpgradeable('https://github.com/strongloop/express', '4.11.2').should.equal(false)
  })

  it('do not upgrade versions beyond the latest', () => {
    isUpgradeable('5.0.0', '4.11.2').should.equal(false)
  })

  it('handle comparison constraints', () => {
    isUpgradeable('>1.0', '0.5.1').should.equal(false)
    isUpgradeable('<3.0 >0.1', '0.5.1').should.equal(false)
    isUpgradeable('>0.1.x', '0.5.1').should.equal(true)
    isUpgradeable('<7.0.0', '7.2.0').should.equal(true)
    isUpgradeable('<7.0', '7.2.0').should.equal(true)
    isUpgradeable('<7', '7.2.0').should.equal(true)
  })

  it('upgrade simple versions', () => {
    isUpgradeable('v1', 'v2').should.equal(true)
  })

})
