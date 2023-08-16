import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import * as bun from '../../../src/package-managers/bun'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

describe('bun', function () {
  it('list', async () => {
    const versionObject = await bun.list({ cwd: __dirname })
    versionObject.should.have.property('express')
  })

  it('latest', async () => {
    const { version } = await bun.latest('express', '', { cwd: __dirname })
    parseInt(version!, 10).should.be.above(1)
  })
})
