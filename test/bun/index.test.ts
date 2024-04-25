import * as bun from '../../src/package-managers/bun'
import chaiSetup from '../helpers/chaiSetup'
import { testFail, testPass } from '../helpers/doctorHelpers'
import stubVersions from '../helpers/stubVersions'

chaiSetup()

const mockNpmVersions = {
  emitter20: '2.0.0',
  'ncu-test-return-version': '2.0.0',
  'ncu-test-tag': '1.1.0',
  'ncu-test-v2': '2.0.0',
}

describe('bun', function () {
  it('list', async () => {
    const result = await bun.list({ cwd: __dirname })
    result.should.have.property('ncu-test-v2')
  })

  it('latest', async () => {
    const { version } = await bun.latest('ncu-test-v2', '1.0.0', { cwd: __dirname })
    version!.should.equal('2.0.0')
  })

  describe('doctor', { timeout: 3 * 60 * 1000 }, function () {
    let stub: { restore: () => void }
    beforeEach(() => (stub = stubVersions(mockNpmVersions, { spawn: true })))
    afterEach(() => stub.restore())

    testPass({ packageManager: 'bun' })
    testFail({ packageManager: 'bun' })
  })
})
