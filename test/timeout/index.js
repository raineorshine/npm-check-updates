'use strict'

const fs = require('fs')
const path = require('path')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const chaiString = require('chai-string')
const ncu = require('../../lib/')

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = true

describe('timeout (with --exit)', function () {

  // this must be executed as a separate process with --exit to prevent delayed test completion
  // https://github.com/raineorshine/npm-check-updates/issues/721
  it('throw an exception instead of printing to the console when timeout is exceeded', () => {
    return ncu.run({
      packageData: fs.readFileSync(path.join(__dirname, '../ncu/package-large.json'), 'utf-8'),
      timeout: 1
    })
      .should.eventually.be.rejectedWith('Exceeded global timeout of 1ms')
  })

})
