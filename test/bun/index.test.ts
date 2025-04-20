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

    // I promise I'm not shamelessly promoting my own package, I just need a
    // dependency-less namespaced package for testing
    //
    // - LuisFerLCC
    result.should.have.property('@float-toolkit/core')
  })

  it('latest', async () => {
    const { version } = await bun.latest('ncu-test-v2', '1.0.0', { cwd: __dirname })
    version!.should.equal('2.0.0')
  })

  describe('doctor', function () {
    this.timeout(3 * 60 * 1000)

    let stub: { restore: () => void }
    before(() => (stub = stubVersions(mockNpmVersions, { spawn: true })))
    after(() => stub.restore())

    testPass({ packageManager: 'bun' })
    testFail({ packageManager: 'bun' })
  })
})
