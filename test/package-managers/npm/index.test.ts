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

  // end-to-end check that the escaped name reaches the registry as npm would send it
  // https://github.com/raineorshine/npm-check-updates/issues/1456
  it('requests a scoped package the same way npm does', async () => {
    await expect(npm.getEngines('@angular/core', '0.0.0-nonexistent')).rejects.toThrow(
      '404 Not Found - GET https://registry.npmjs.org/@angular%2fcore/0.0.0-nonexistent',
    )
  })

  describe('escapePackageName', () => {
    // an encoded @ (%40) or uppercase %2F is rejected by some registries and proxies that
    // let npm's own requests through
    // https://github.com/raineorshine/npm-check-updates/issues/1330
    it('leaves an unscoped name untouched', () => {
      expect(npm.escapePackageName('lodash')).toBe('lodash')
    })

    it('preserves the leading @ and lowercases the scope slash', () => {
      expect(npm.escapePackageName('@angular/core')).toBe('@angular%2fcore')
    })

    it('does not encode dots, dashes, underscores, or tildes', () => {
      expect(npm.escapePackageName('@foo-bar/baz.qux_1~2')).toBe('@foo-bar%2fbaz.qux_1~2')
    })

    // only the leading @ marks a scope; any other @ must stay encoded
    it('encodes an @ that is not the scope prefix', () => {
      expect(npm.escapePackageName('foo@bar')).toBe('foo%40bar')
    })

    // a literal %2f in the name must not survive as a decodable slash
    it('double-encodes a percent already present in the name', () => {
      expect(npm.escapePackageName('foo%2fbar')).toBe('foo%252fbar')
    })

    // a crafted name must not be able to steer the request off the registry origin
    it.each(['//evil.com/x', '\\\\evil.com\\x', '../../etc/passwd', 'foo?x=1', 'foo#bar'])(
      'keeps %j on the registry origin',
      name => {
        expect(new URL(npm.escapePackageName(name), 'https://registry.npmjs.org/').origin).toBe(
          'https://registry.npmjs.org',
        )
      },
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
