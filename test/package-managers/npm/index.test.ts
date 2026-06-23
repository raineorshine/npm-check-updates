import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as npm from '../../../src/package-managers/npm.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('npm', () => {
  it('list', async () => {
    const versionObject = await npm.list({ cwd: __dirname })
    expect(versionObject).toHaveProperty('express')
  })

  it('latest', async () => {
    const { version } = await npm.latest('express', '', { cwd: __dirname })
    expect(Number.parseInt(version!, 10)).toBeGreaterThan(1)
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
})
