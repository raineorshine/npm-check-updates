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
    const result = spawnSync('bun --version', {
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

  it('packageAuthorChanged', async () => {
    await expect(bun.packageAuthorChanged('mocha', '^7.1.0', '8.0.1', { cwd: __dirname })).resolves.toBe(true)
    await expect(bun.packageAuthorChanged('htmlparser2', '^3.10.1', '^4.0.0', { cwd: __dirname })).resolves.toBe(false)
    await expect(bun.packageAuthorChanged('ncu-test-v2', '^1.0.0', '2.2.0', { cwd: __dirname })).resolves.toBe(false)
  })

  it('getPeerDependencies', async () => {
    const spawnOptions = { cwd: __dirname }
    await expect(bun.getPeerDependencies('ncu-test-return-version', '1.0.0', spawnOptions)).resolves.toStrictEqual({})
    await expect(bun.getPeerDependencies('ncu-test-peer', '1.0.0', spawnOptions)).resolves.toStrictEqual({
      'ncu-test-return-version': '1.x',
    })
  })

  it('getEngines', async () => {
    await expect(bun.getEngines('del', '2.0.0', { cwd: __dirname })).resolves.toStrictEqual({ node: '>=0.10.0' })
    await expect(bun.getEngines('ncu-test-return-version', '1.0.0', { cwd: __dirname })).resolves.toStrictEqual({})
    await expect(bun.getEngines('ncu-test-return-version', '9999.0.0', { cwd: __dirname })).rejects.toThrow()
  })

  describe('doctor', { timeout: 3 * 60 * 1000 }, () => {
    let stub: { restore: () => void }
    beforeAll(() => (stub = stubVersions(mockNpmVersions, { spawn: true })))
    afterAll(() => stub.restore())

    testPass({ packageManager: 'bun' })
    testFail({ packageManager: 'bun' })
  })
})
