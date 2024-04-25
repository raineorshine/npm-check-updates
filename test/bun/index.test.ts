import * as bun from '../../src/package-managers/bun'
import chaiSetup from '../helpers/chaiSetup'

chaiSetup()

describe('bun', function () {
  it('list', async () => {
    const result = await bun.list({ cwd: __dirname })
    result.should.have.property('ncu-test-v2')
  })

  it('latest', async () => {
    const { version } = await bun.latest('ncu-test-v2', '1.0.0', { cwd: __dirname })
    version!.should.equal('2.0.0')
  })
})
