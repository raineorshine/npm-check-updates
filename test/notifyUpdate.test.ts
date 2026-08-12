import type * as childProcess from 'node:child_process'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import latestVersion from 'latest-version'
import semver from 'semver'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import pkg from '../package.json' with { type: 'json' }
import notifyUpdate, { runUpdateCheck } from '../src/lib/notifyUpdate.ts'
import removeDir from './helpers/removeDir.ts'

vi.mock('latest-version', () => ({ default: vi.fn() }))

vi.mock('node:child_process', async importOriginal => ({
  ...(await importOriginal<typeof childProcess>()),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}))

const DAY = 1000 * 60 * 60 * 24
const currentMajor = semver.major(pkg.version)

let tmpDir: string
let configFile: string
let stderr: string[]

/** Writes the update check config that a previous run would have left behind. */
const writeConfig = async (config: Record<string, unknown>) => {
  await mkdir(path.dirname(configFile), { recursive: true })
  await writeFile(configFile, JSON.stringify(config))
}

/** Reads the update check config. */
const readConfig = async () => JSON.parse(await readFile(configFile, 'utf8'))

/** Strips the box borders and line wrapping so long urls can be matched. */
const unwrap = (message: string) => message.replace(/[\s│]/g, '')

/** Builds a cached update entry for the given latest version. */
const cachedUpdate = (latest: string) => ({
  latest,
  current: pkg.version,
  type: semver.diff(pkg.version, latest),
  name: pkg.name,
})

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ncu-notify-'))
  configFile = path.join(tmpDir, 'configstore', `update-notifier-${pkg.name}.json`)

  // the ambient environment must not leak into the disabled checks
  for (const key of Object.keys(process.env)) {
    if (key === 'CI' || key === 'CONTINUOUS_INTEGRATION' || key.startsWith('CI_')) {
      vi.stubEnv(key, undefined)
    }
  }
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('NO_UPDATE_NOTIFIER', undefined)
  vi.stubEnv('npm_config_user_agent', undefined)
  vi.stubEnv('npm_package_json', undefined)
  vi.stubEnv('XDG_CONFIG_HOME', tmpDir)

  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })

  stderr = []
  vi.spyOn(console, 'error').mockImplementation(message => {
    stderr.push(stripAnsi(String(message)))
  })
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.mocked(spawn).mockClear()
  vi.mocked(latestVersion).mockReset()
  delete (process.stdout as { isTTY?: boolean }).isTTY
  await removeDir(tmpDir)
})

describe('notifyUpdate', () => {
  describe('config store', () => {
    it('checks on the first run, when there is no config yet', async () => {
      await notifyUpdate()

      expect(spawn).toHaveBeenCalledTimes(1)
      expect(stderr).toEqual([])
    })

    it('recovers from an invalid config', async () => {
      await mkdir(path.dirname(configFile), { recursive: true })
      await writeFile(configFile, 'not json')

      await notifyUpdate()

      expect(spawn).toHaveBeenCalledTimes(1)
      expect(stderr).toEqual([])
    })

    it('does nothing when opted out', async () => {
      await writeConfig({ optOut: true, lastUpdateCheck: 0, update: cachedUpdate('99.0.0') })

      await notifyUpdate()

      expect(stderr).toEqual([])
      expect(spawn).not.toHaveBeenCalled()
    })
  })

  describe('background check', () => {
    it('spawns a detached check when the interval has elapsed', async () => {
      await writeConfig({ optOut: false, lastUpdateCheck: Date.now() - DAY - 1 })

      await notifyUpdate()

      expect(spawn).toHaveBeenCalledTimes(1)
      const [command, args, options] = vi.mocked(spawn).mock.calls[0] as [string, string[], any]
      expect(command).toBe(process.execPath)
      expect(args).toEqual([process.argv[1]])
      expect(options.detached).toBe(true)
      expect(options.stdio).toBe('ignore')
      expect(options.env.NCU_UPDATE_CHECK).toBe('1')
    })

    it('does not spawn a check within the interval', async () => {
      await writeConfig({ optOut: false, lastUpdateCheck: Date.now() - DAY + 60000 })

      await notifyUpdate()

      expect(spawn).not.toHaveBeenCalled()
    })

    it('spawns a check even when stdout is not a tty', async () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true })
      await writeConfig({ optOut: false, lastUpdateCheck: 0 })

      await notifyUpdate()

      expect(spawn).toHaveBeenCalledTimes(1)
    })
  })

  describe('notification', () => {
    it('prints the cached update and clears it so it is only shown once', async () => {
      const latest = `${currentMajor}.9999.0`
      await writeConfig({ optOut: false, lastUpdateCheck: Date.now(), update: cachedUpdate(latest) })

      await notifyUpdate()

      expect(stderr).toHaveLength(1)
      expect(unwrap(stderr[0])).toContain(unwrap(`Update available ${pkg.version} → ${latest}`))
      expect(unwrap(stderr[0])).toContain(unwrap(`Run npm i -g ${pkg.name} to update`))
      expect((await readConfig()).update).toBeUndefined()

      stderr = []
      await notifyUpdate()
      expect(stderr).toEqual([])
    })

    it('links to the compare url for a non-major update', async () => {
      const latest = `${currentMajor}.9999.0`
      await writeConfig({ optOut: false, lastUpdateCheck: Date.now(), update: cachedUpdate(latest) })

      await notifyUpdate()

      expect(unwrap(stderr[0])).toContain(`${pkg.homepage}/compare/v${pkg.version}...v${latest}`)
    })

    it('links to a release url for every major version in between', async () => {
      const latest = `${currentMajor + 2}.0.0`
      await writeConfig({ optOut: false, lastUpdateCheck: Date.now(), update: cachedUpdate(latest) })

      await notifyUpdate()

      expect(unwrap(stderr[0])).toContain(`${pkg.homepage}/releases/tag/v${currentMajor + 1}.0.0`)
      expect(unwrap(stderr[0])).toContain(`${pkg.homepage}/releases/tag/v${currentMajor + 2}.0.0`)
      expect(unwrap(stderr[0])).not.toContain('/compare/')
    })

    it('does not print when the cached version is not newer', async () => {
      await writeConfig({
        optOut: false,
        lastUpdateCheck: Date.now(),
        update: { latest: pkg.version, current: '0.0.1', type: 'major', name: pkg.name },
      })

      await notifyUpdate()

      expect(stderr).toEqual([])
      // the stale entry is still cleared
      expect((await readConfig()).update).toBeUndefined()
    })

    it('does not print when stdout is not a tty', async () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true })
      await writeConfig({ optOut: false, lastUpdateCheck: Date.now(), update: cachedUpdate('99.0.0') })

      await notifyUpdate()

      expect(stderr).toEqual([])
    })

    it.each([
      ['npm', 'npm_config_user_agent', 'npm/10.9.0 node/v22.0.0 win32 x64'],
      ['yarn', 'npm_config_user_agent', 'yarn/1.22.22 npm/? node/v22.0.0 win32 x64'],
      ['npm 7+', 'npm_package_json', '/home/user/project/package.json'],
    ])('does not print when run from a %s script', async (_name, key, value) => {
      vi.stubEnv(key, value)
      await writeConfig({ optOut: false, lastUpdateCheck: Date.now(), update: cachedUpdate('99.0.0') })

      await notifyUpdate()

      expect(stderr).toEqual([])
    })
  })

  describe('disabled', () => {
    /** Runs notifyUpdate with a stale cached update that would otherwise notify and check. */
    const runWithPendingUpdate = async () => {
      await writeConfig({ optOut: false, lastUpdateCheck: 0, update: cachedUpdate('99.0.0') })
      await notifyUpdate()
    }

    it.each([
      ['NO_UPDATE_NOTIFIER', ''],
      ['NODE_ENV', 'test'],
      ['CI', 'true'],
      ['CONTINUOUS_INTEGRATION', 'true'],
      ['CI_NAME', 'codeship'],
    ])('is disabled by %s', async (key, value) => {
      vi.stubEnv(key, value)

      await runWithPendingUpdate()

      expect(stderr).toEqual([])
      expect(spawn).not.toHaveBeenCalled()
    })

    it.each(['0', 'false'])('is not disabled by CI=%s', async value => {
      vi.stubEnv('CI', value)

      await runWithPendingUpdate()

      expect(stderr).toHaveLength(1)
      expect(spawn).toHaveBeenCalledTimes(1)
    })
  })
})

describe('runUpdateCheck', () => {
  it('caches an available update', async () => {
    const latest = `${currentMajor + 1}.0.0`
    vi.mocked(latestVersion).mockResolvedValue(latest)
    await writeConfig({ optOut: false, lastUpdateCheck: 0 })

    await runUpdateCheck()

    const config = await readConfig()
    expect(config.lastUpdateCheck).toBeGreaterThan(Date.now() - DAY)
    expect(config.update).toEqual({ latest, current: pkg.version, type: 'major', name: pkg.name })
  })

  it('caches no update when already on the latest version', async () => {
    vi.mocked(latestVersion).mockResolvedValue(pkg.version)
    await writeConfig({ optOut: false, lastUpdateCheck: 0 })

    await runUpdateCheck()

    const config = await readConfig()
    expect(config.lastUpdateCheck).toBeGreaterThan(Date.now() - DAY)
    expect(config.update).toBeUndefined()
  })

  it('leaves lastUpdateCheck alone when the registry is unreachable', async () => {
    vi.mocked(latestVersion).mockRejectedValue(new Error('offline'))
    await writeConfig({ optOut: false, lastUpdateCheck: 0 })

    await runUpdateCheck()

    expect((await readConfig()).lastUpdateCheck).toBe(0)
  })
})
