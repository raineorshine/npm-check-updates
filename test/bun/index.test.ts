import { spawnSync } from 'node:child_process'
import * as bun from '../../src/package-managers/bun.js'
import chaiSetup, { getDirname } from '../helpers/chaiSetup'
import { testFail, testPass } from '../helpers/doctorHelpers'
import stubVersions from '../helpers/stubVersions'

chaiSetup()
const __dirname = getDirname(import.meta.url)

const mockNpmVersions = {
  emitter20: '2.0.0',
  'ncu-test-return-version': '2.0.0',
  'ncu-test-tag': '1.1.0',
  'ncu-test-v2': '2.0.0',
}

describe('bun', function () {
  // Use a synchronous check to fail the suite immediately if bun is missing
  before('check-environment', function () {
    const result = spawnSync('bun', ['--version'], {
      shell: true,
      encoding: 'utf8',
    })

    // On Windows, if 'bun' is missing, status is 1 and error is null.
    // On Linux, if 'bun' is missing, status is 127 and error is null.
    if (result.status !== 0 || result.error) {
      const details = result.stderr?.trim() || result.error?.message || 'Unknown error'

      throw new Error(
        `Required executable 'bun' not found in PATH.\n` +
          `To run these tests, please install Bun: https://bun.sh/docs/installation\n` +
          `System Error: ${details}`,
      )
    }
  })

  it('list', async () => {
    const result = await bun.list({ cwd: __dirname })
    result.should.have.property('ncu-test-v2')
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
