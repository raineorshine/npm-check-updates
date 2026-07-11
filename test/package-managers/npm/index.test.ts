import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as npm from '../../../src/package-managers/npm.ts'
import removeDir from '../../helpers/removeDir.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('npm', () => {
  it('list', async () => {
    const versionObject = await npm.list({ cwd: __dirname })
    expect(versionObject).toHaveProperty('express')
  })

  it('latest', async () => {
    const { version } = await npm.latest('express', '', { cwd: __dirname })
    expect(parseInt(version!, 10)).toBeGreaterThan(1)
  })

  it('greatest', async () => {
    const { version } = await npm.greatest('ncu-test-greatest-not-newest', '', { pre: true, cwd: __dirname })
    expect(version).toBe('2.0.0-beta')
  })

  it('ownerChanged', async () => {
    await expect(npm.packageAuthorChanged('mocha', '^7.1.0', '8.0.1')).resolves.toBe(true)
    await expect(npm.packageAuthorChanged('htmlparser2', '^3.10.1', '^4.0.0')).resolves.toBe(false)
    await expect(npm.packageAuthorChanged('ncu-test-v2', '^1.0.0', '2.2.0')).resolves.toBe(false)
  })

  it('getPeerDependencies', async () => {
    const spawnOptions = { cwd: __dirname }
    await expect(npm.getPeerDependencies('ncu-test-return-version', '1.0.0', spawnOptions)).resolves.toStrictEqual({})
    await expect(npm.getPeerDependencies('ncu-test-peer', '1.0.0', spawnOptions)).resolves.toStrictEqual({
      'ncu-test-return-version': '1.x',
    })
  })

  it('getEngines', async () => {
    await expect(npm.getEngines('del', '2.0.0')).resolves.toStrictEqual({ node: '>=0.10.0' })
    await expect(npm.getEngines('ncu-test-return-version', '1.0.0')).resolves.toStrictEqual({})
    await expect(npm.getEngines('ncu-test-return-version', '1.0')).rejects.toThrow(
      '404 Not Found - GET https://registry.npmjs.org/ncu-test-return-version/1.0',
    )
  })

  // getEngines must respect a scoped registry from the project .npmrc, not default to npmjs
  // https://github.com/raineorshine/npm-check-updates/issues/1506
  it('getEngines uses a scoped registry configured in the project .npmrc', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    await fs.writeFile(
      path.join(tempDir, '.npmrc'),
      '@enginestest:registry=https://registry.npmjs.org/ncu-1506-probe/\n',
    )

    try {
      // 404 confirms the request went to the configured registry path rather than the default
      await expect(npm.getEngines('@enginestest/foo', '1.0.0', { cwd: tempDir })).rejects.toThrow(
        'https://registry.npmjs.org/ncu-1506-probe/',
      )
    } finally {
      await removeDir(tempDir)
    }
  })

  // the leading @ must not be encoded to %40, which some registries reject with a 404
  // https://github.com/raineorshine/npm-check-updates/issues/1330
  it('does not percent-encode the @ of a scoped package name', async () => {
    await expect(npm.getEngines('@angular/core', '0.0.0-nonexistent')).rejects.toThrow(
      '404 Not Found - GET https://registry.npmjs.org/@angular%2Fcore/0.0.0-nonexistent',
    )
  })

  it('interpolate every env var reference in a config value, not just the first', () => {
    process.env.NCU_TEST_ENV_A = 'aaa'
    process.env.NCU_TEST_ENV_B = 'bbb'

    try {
      const result = npm.normalizeNpmConfig({
        // eslint-disable-next-line no-template-curly-in-string
        '//registry.example.com/:_authToken': '${NCU_TEST_ENV_A}-${NCU_TEST_ENV_B}',
      })
      expect(result['//registry.example.com/:_authToken']).toBe('aaa-bbb')
    } finally {
      delete process.env.NCU_TEST_ENV_A
      delete process.env.NCU_TEST_ENV_B
    }
  })
})
