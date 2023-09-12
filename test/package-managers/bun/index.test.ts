import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import os from 'os'
import * as bun from '../../../src/package-managers/bun'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

// Bun not yet supported on Windows
const describeSkipWindows = os.platform() === 'win32' ? describe.skip : describe
describeSkipWindows('bun', function () {
  it('list', async () => {
    const result = await bun.list({ cwd: __dirname })
    result.should.have.property('ncu-test-v2')
  })

  it('latest', async () => {
    const { version } = await bun.latest('ncu-test-v2', '1.0.0', { cwd: __dirname })
    version!.should.equal('2.0.0')
  })
})
