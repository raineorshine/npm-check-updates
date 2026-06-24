import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as bun from '../../src/package-managers/bun'
import { testFail, testPass } from '../helpers/doctorHelpers'
import stubVersions from '../helpers/stubVersions'
import { doctorSpawnHandler } from '../helpers/stubs/stubDoctor'
import { stubSpawnPlease } from '../helpers/stubs/stubSpawnPlease'

const __dirname = dirname(fileURLToPath(import.meta.url))

const mockNpmVersions = {
  emitter20: '2.0.0',
  'ncu-test-return-version': '2.0.0',
  'ncu-test-tag': '1.1.0',
  'ncu-test-v2': '2.0.0',
}

describe('bun', function () {
  let versionStub: { mockRestore: () => void }

  // Use a synchronous check to fail the suite immediately if bun is missing
  beforeAll(function () {
    const result = spawnSync('bun', ['--version'], {
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

  beforeEach(async () => {
    versionStub = stubVersions(mockNpmVersions, { spawn: true })
  })

  afterEach(async () => {
    versionStub?.mockRestore()
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
    beforeAll(async () => {
      stubSpawnPlease.useFirst(doctorSpawnHandler)
    })

    testPass({ packageManager: 'bun' })
    testFail({ packageManager: 'bun' })
  })
})
