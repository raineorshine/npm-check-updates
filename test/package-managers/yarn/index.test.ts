import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import * as yarn from '../../../src/package-managers/yarn.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isWindows = process.platform === 'win32'

// append the local node_modules bin directory to process.env.PATH so local yarn is used during tests
const localBin = path.resolve(__dirname.replace('build/', ''), '../../../node_modules/.bin')
const localYarnSpawnOptions = {
  env: {
    ...process.env,
    PATH: [process.env.PATH, localBin].join(path.delimiter),
  },
}

const filteredPath = (process.env.PATH || '')
  .split(path.delimiter)
  .filter(p => !p.includes(path.join('node_modules', '.bin'))) // Avoid running yarn form the node module bin
  .join(path.delimiter)
const cleanEnv = {
  ...process.env,
  PATH: filteredPath,
}

// skip getPeerDependencies tests if yarn is not available outside node_modules/.bin
const hasSystemYarn = (() => {
  try {
    execFileSync(isWindows ? 'where.exe' : 'which', ['yarn'], {
      env: { ...process.env, PATH: filteredPath },
      stdio: 'pipe',
    })
    return true
  } catch {
    return false
  }
})()
const itWithSystemYarn = hasSystemYarn ? it : it.skip

describe('yarn', () => {
  it('list', async () => {
    const testDir = path.join(__dirname, 'default')
    const { version } = await yarn.latest('chalk', '', { cwd: testDir })
    expect(parseInt(version!, 10)).toBeGreaterThan(3)
  })

  it('latest', async () => {
    const testDir = path.join(__dirname, 'default')
    const { version } = await yarn.latest('chalk', '', { cwd: testDir })
    expect(parseInt(version!, 10)).toBeGreaterThan(3)
  })

  it('greatest', async () => {
    const { version } = await yarn.greatest('ncu-test-greatest-not-newest', '', { pre: true, cwd: __dirname })
    expect(version).toBe('2.0.0-beta')
  })

  it('avoids deprecated', async () => {
    const testDir = path.join(__dirname, 'default')
    const { version } = await yarn.minor('popper.js', '1.15.0', { cwd: testDir, pre: true })
    expect(version).toBe('1.16.1-lts')
  })

  it('"No lockfile" error should be thrown on list command when there is no lockfile', async () => {
    const testDir = path.join(__dirname, 'nolockfile')
    const lockFileErrorMessage = 'No lockfile in this directory. Run `yarn install` to generate one.'
    await expect(yarn.list({ cwd: testDir }, localYarnSpawnOptions)).rejects.toThrow(lockFileErrorMessage)
  })

  itWithSystemYarn('getPeerDependencies v1', async () => {
    const testDir = path.join(__dirname, 'default')
    const spawnOptions = { cwd: testDir, env: cleanEnv }
    await expect(yarn.getPeerDependencies('ncu-test-return-version', '1.0.0', spawnOptions)).resolves.toStrictEqual({})
    await expect(yarn.getPeerDependencies('ncu-test-peer', '1.0.0', spawnOptions)).resolves.toStrictEqual({
      'ncu-test-return-version': '1.x',
    })
    await expect(yarn.getPeerDependencies('fffffffffffff', '1.0.0', spawnOptions)).resolves.toStrictEqual({})
  })

  itWithSystemYarn('getPeerDependencies v4', async () => {
    const testDir = path.join(__dirname, 'v4')
    const spawnOptions = { cwd: testDir, env: cleanEnv }
    await expect(yarn.getPeerDependencies('ncu-test-return-version', '1.0.0', spawnOptions)).resolves.toStrictEqual({})
    await expect(yarn.getPeerDependencies('ncu-test-peer', '1.0.0', spawnOptions)).resolves.toStrictEqual({
      'ncu-test-return-version': '1.x',
    })
    await expect(yarn.getPeerDependencies('fffffffffffff', '1.0.0', spawnOptions)).resolves.toStrictEqual({})
  })

  describe('npmAuthTokenKeyValue', () => {
    it('npmRegistryServer with trailing slash', () => {
      const authToken = yarn.npmAuthTokenKeyValue({})('fortawesome', {
        npmAlwaysAuth: true,
        npmAuthToken: 'MY-AUTH-TOKEN',
        npmRegistryServer: 'https://npm.fontawesome.com/',
      })

      expect(authToken).toStrictEqual({
        '//npm.fontawesome.com/:_authToken': 'MY-AUTH-TOKEN',
      })
    })

    it('npmRegistryServer without trailing slash', () => {
      const authToken = yarn.npmAuthTokenKeyValue({})('fortawesome', {
        npmAlwaysAuth: true,
        npmAuthToken: 'MY-AUTH-TOKEN',
        npmRegistryServer: 'https://npm.fontawesome.com',
      })

      expect(authToken).toStrictEqual({
        '//npm.fontawesome.com/:_authToken': 'MY-AUTH-TOKEN',
      })
    })

    it('returns null when no npmAlwaysAuth', () => {
      const authToken = yarn.npmAuthTokenKeyValue({})('fortawesome', {
        npmAlwaysAuth: true,
        // undefined: npmAuthToken: 'MY-AUTH-TOKEN',
        npmRegistryServer: 'https://npm.fontawesome.com/',
      })

      expect(authToken).toBeNull()
    })

    it('returns null when no registry server', () => {
      const authToken = yarn.npmAuthTokenKeyValue({})('fortawesome', {
        npmAlwaysAuth: true,
        npmAuthToken: 'MY-AUTH-TOKEN',
        // undefined: npmRegistryServer: 'https://npm.fontawesome.com/',
      })

      expect(authToken).toBeNull()
    })

    describe('environment variable interpolation', () => {
      const ENV_VAR = 'NCU_TEST_NPM_AUTH_TOKEN'

      afterEach(() => {
        delete process.env[ENV_VAR]
      })

      it('interpolates a set environment variable', () => {
        process.env[ENV_VAR] = 'TOKEN-FROM-ENV'
        const authToken = yarn.npmAuthTokenKeyValue({})('fortawesome', {
          npmAlwaysAuth: true,
          npmAuthToken: `\${${ENV_VAR}}`,
          npmRegistryServer: 'https://npm.fontawesome.com/',
        })

        expect(authToken).toStrictEqual({
          '//npm.fontawesome.com/:_authToken': 'TOKEN-FROM-ENV',
        })
      })

      it('uses the dash fallback when the variable is unset', () => {
        const authToken = yarn.npmAuthTokenKeyValue({})('fortawesome', {
          npmAlwaysAuth: true,
          npmAuthToken: `\${${ENV_VAR}-FALLBACK-TOKEN}`,
          npmRegistryServer: 'https://npm.fontawesome.com/',
        })

        expect(authToken).toStrictEqual({
          '//npm.fontawesome.com/:_authToken': 'FALLBACK-TOKEN',
        })
      })

      it('uses the colon-dash fallback when the variable is unset', () => {
        const authToken = yarn.npmAuthTokenKeyValue({})('fortawesome', {
          npmAlwaysAuth: true,
          npmAuthToken: `\${${ENV_VAR}:-FALLBACK-TOKEN}`,
          npmRegistryServer: 'https://npm.fontawesome.com/',
        })

        expect(authToken).toStrictEqual({
          '//npm.fontawesome.com/:_authToken': 'FALLBACK-TOKEN',
        })
      })

      it('prefers the set variable over the fallback', () => {
        process.env[ENV_VAR] = 'TOKEN-FROM-ENV'
        const authToken = yarn.npmAuthTokenKeyValue({})('fortawesome', {
          npmAlwaysAuth: true,
          npmAuthToken: `\${${ENV_VAR}:-FALLBACK-TOKEN}`,
          npmRegistryServer: 'https://npm.fontawesome.com/',
        })

        expect(authToken).toStrictEqual({
          '//npm.fontawesome.com/:_authToken': 'TOKEN-FROM-ENV',
        })
      })

      it('uses the colon-dash fallback when the variable is set but empty', () => {
        process.env[ENV_VAR] = ''
        const authToken = yarn.npmAuthTokenKeyValue({})('fortawesome', {
          npmAlwaysAuth: true,
          npmAuthToken: `\${${ENV_VAR}:-FALLBACK-TOKEN}`,
          npmRegistryServer: 'https://npm.fontawesome.com/',
        })

        expect(authToken).toStrictEqual({
          '//npm.fontawesome.com/:_authToken': 'FALLBACK-TOKEN',
        })
      })

      it('interpolates multiple variables in one token', () => {
        process.env[ENV_VAR] = 'FIRST'
        process.env[`${ENV_VAR}_2`] = 'SECOND'
        const authToken = yarn.npmAuthTokenKeyValue({})('fortawesome', {
          npmAlwaysAuth: true,
          npmAuthToken: `\${${ENV_VAR}}-\${${ENV_VAR}_2}`,
          npmRegistryServer: 'https://npm.fontawesome.com/',
        })
        delete process.env[`${ENV_VAR}_2`]

        expect(authToken).toStrictEqual({
          '//npm.fontawesome.com/:_authToken': 'FIRST-SECOND',
        })
      })
    })
  })

  describe('getPathToLookForLocalYarnrc', () => {
    it('returns the correct path when using Yarn workspaces', async () => {
      /** Mock for filesystem calls. */
      function readdirMock(path: string): Promise<string[]> {
        switch (path) {
          case '/home/test-repo/packages/package-a':
          case 'C:\\home\\test-repo\\packages\\package-a':
            return Promise.resolve(['index.ts'])
          case '/home/test-repo/packages':
          case 'C:\\home\\test-repo\\packages':
            return Promise.resolve([])
          case '/home/test-repo':
          case 'C:\\home\\test-repo':
            return Promise.resolve(['yarn.lock'])
        }

        throw new Error(`Mock cannot handle path: ${path}.`)
      }

      const yarnrcPath = await yarn.getPathToLookForYarnrc(
        {
          cwd: isWindows ? 'C:\\home\\test-repo\\packages\\package-a' : '/home/test-repo/packages/package-a',
        },
        readdirMock,
      )

      expect(yarnrcPath).toBeDefined()
      expect(yarnrcPath).toBe(isWindows ? 'C:\\home\\test-repo\\.yarnrc.yml' : '/home/test-repo/.yarnrc.yml')
    })
  })

  describe('getYarnMinimalAgeGate', () => {
    /** Creates a temp directory with a yarn.lock and a .yarnrc.yml for testing. */
    async function createTempYarnrc(yarnrcContent: string): Promise<{ tempDir: string; cleanup: () => Promise<void> }> {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-test-yarn-agegate-'))
      await fs.writeFile(path.join(tempDir, 'yarn.lock'), '')
      await fs.writeFile(path.join(tempDir, '.yarnrc.yml'), yarnrcContent)
      return {
        tempDir,
        cleanup: () => fs.rm(tempDir, { recursive: true, force: true }),
      }
    }

    it('parses a numeric npmMinimalAgeGate (minutes) from .yarnrc.yml', async () => {
      const { tempDir, cleanup } = await createTempYarnrc('npmMinimalAgeGate: 1440\n')
      try {
        const result = await yarn.yarnApi.getYarnMinimalAgeGate({ cwd: tempDir })
        expect(result).not.toBeNull()
        expect(result!.npmMinimalAgeGate).toBe(1440)
        expect(result!.npmPreapprovedPackages).toStrictEqual([])
      } finally {
        await cleanup()
      }
    })

    it('parses a duration string npmMinimalAgeGate ("3d") from .yarnrc.yml', async () => {
      const { tempDir, cleanup } = await createTempYarnrc('npmMinimalAgeGate: "3d"\n')
      try {
        const result = await yarn.yarnApi.getYarnMinimalAgeGate({ cwd: tempDir })
        expect(result).not.toBeNull()
        // "3d" → 3 days → 3 * 1440 = 4320 minutes
        expect(result!.npmMinimalAgeGate).toBe(3 * 1440)
        expect(result!.npmPreapprovedPackages).toStrictEqual([])
      } finally {
        await cleanup()
      }
    })

    it('parses a duration string npmMinimalAgeGate ("12h") from .yarnrc.yml', async () => {
      const { tempDir, cleanup } = await createTempYarnrc('npmMinimalAgeGate: "12h"\n')
      try {
        const result = await yarn.yarnApi.getYarnMinimalAgeGate({ cwd: tempDir })
        expect(result).not.toBeNull()
        // "12h" → 12/24 days → 0.5 * 1440 = 720 minutes
        expect(result!.npmMinimalAgeGate).toBe(720)
        expect(result!.npmPreapprovedPackages).toStrictEqual([])
      } finally {
        await cleanup()
      }
    })

    it('returns null for an invalid duration string from .yarnrc.yml', async () => {
      const { tempDir, cleanup } = await createTempYarnrc('npmMinimalAgeGate: "invalid"\n')
      try {
        const result = await yarn.yarnApi.getYarnMinimalAgeGate({ cwd: tempDir })
        expect(result).toBeNull()
      } finally {
        await cleanup()
      }
    })

    it('parses npmMinimalAgeGate with npmPreapprovedPackages from .yarnrc.yml', async () => {
      const { tempDir, cleanup } = await createTempYarnrc(
        'npmMinimalAgeGate: "7d"\nnpmPreapprovedPackages:\n  - "@my-org/*"\n',
      )
      try {
        const result = await yarn.yarnApi.getYarnMinimalAgeGate({ cwd: tempDir })
        expect(result).not.toBeNull()
        // "7d" → 7 * 1440 = 10080 minutes
        expect(result!.npmMinimalAgeGate).toBe(7 * 1440)
        expect(result!.npmPreapprovedPackages).toStrictEqual(['@my-org/*'])
      } finally {
        await cleanup()
      }
    })
  })
})
