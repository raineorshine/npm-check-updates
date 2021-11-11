import fs from 'fs'
import path from 'path'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import * as ncu from '../../src/'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

describe('timeout (with --exit)', function () {

  // this must be executed as a separate process with --exit to prevent delayed test completion
  // https://github.com/raineorshine/npm-check-updates/issues/721
  it('throw an exception instead of printing to the console when timeout is exceeded', () => {
    const pkgPath = path.join(__dirname, '../ncu/package-large.json')
    return ncu.run({
      packageData: fs.readFileSync(pkgPath, 'utf-8'),
      timeout: 1
    })
      .should.eventually.be.rejectedWith('Exceeded global timeout of 1ms')
  })

})
