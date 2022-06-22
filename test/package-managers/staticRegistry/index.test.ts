import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import * as staticRegistry from '../../../src/package-managers/staticRegistry'

chai.should()
chai.use(chaiAsPromised)

describe('staticRegistry', function () {
  it('latest', async () => {
    const registry = './test/package-managers/staticRegistry/staticRegistry.json'
    const version = await staticRegistry.latest('express', '', { cwd: __dirname, registry })
    parseInt(version!, 10).should.be.above(1)
  })
})
