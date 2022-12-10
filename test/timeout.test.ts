import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import path from 'path'
import ncu from '../src/'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

describe('timeout (with --exit)', function () {
  it('throw an exception instead of printing to the console when timeout is exceeded', async () => {
    const pkgPath = path.join(__dirname, './test-data/ncu/package-large.json')
    return ncu({
      packageData: await fs.readFile(pkgPath, 'utf-8'),
      timeout: 1,
    }).should.eventually.be.rejectedWith('Exceeded global timeout of 1ms')
  })
})
