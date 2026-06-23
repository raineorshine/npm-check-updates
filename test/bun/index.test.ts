import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as bun from '../../src/package-managers/bun.ts'
import { testFail, testPass } from '../helpers/doctorHelpers.ts'
import stubVersions from '../helpers/stubVersions.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const mockNpmVersions = {
  emitter20: '2.0.0',
  'ncu-test-return-version': '2.0.0',
  'ncu-test-tag': '1.1.0',
  'ncu-test-v2': '2.0.0',
}

describe('bun', () => {
  // Use a synchronous check to fail the suite immediately if bun is missing
  beforeAll(() => {
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
    expect(result).toHaveProperty('ncu-test-v2')
  })

  it('latest', async () => {
    const { version } = await bun.latest('ncu-test-v2', '1.0.0', { cwd: __dirname })
    expect(version).toBe('2.0.0')
  })

  describe('doctor', { timeout: 3 * 60 * 1000 }, () => {
    let stub: { restore: () => void }
    beforeAll(() => (stub = stubVersions(mockNpmVersions, { spawn: true })))
    afterAll(() => stub.restore())

    testPass({ packageManager: 'bun' })
    testFail({ packageManager: 'bun' })
  })
})
