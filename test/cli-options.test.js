'use strict'

const chai = require('chai')
const cliOptions = require('../lib/cli-options')

chai.should()

describe('cli-options', () => {

  it('require long and description properties', () => {
    cliOptions.forEach(option => {
      option.should.have.property('long')
      option.should.have.property('description')
    })
  })

})
