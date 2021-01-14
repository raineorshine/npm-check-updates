'use strict'

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const ncu = require('../lib/')

chai.should()
chai.use(chaiAsPromised)

process.env.NCU_TESTS = true

describe('monorepo', function () {
  it('do not allow --packageFile and --deep together', () => {
    ncu.run({ packageFile: './package.json', deep: true })
      .should.eventually.be.rejectedWith('Cannot specify both')
  })
})
