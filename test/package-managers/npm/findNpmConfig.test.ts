import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import removeDir from '../../helpers/removeDir.ts'

/** Re-imports the module so findNpmConfig's memoization cache starts fresh in each test. */
const loadFindNpmConfig = async () => {
  vi.resetModules()
  const mod = await import('../../../src/package-managers/npm.ts')
  return mod.npmApi.findNpmConfig
}

describe('findNpmConfig', () => {
  const savedEnv = { ...process.env }
  const savedPlatform = process.platform

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(process, 'platform', { value: savedPlatform, configurable: true })
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key]
    }
    Object.assign(process.env, savedEnv)
  })

  /** Removes ambient npm_config_* and prefix vars so each test starts from a known state. */
  const clearNpmEnv = () => {
    for (const key of Object.keys(process.env)) {
      if (/^npm_config_/i.test(key)) delete process.env[key]
    }
    delete process.env.PREFIX
    delete process.env.DESTDIR
  }

  it('merges global and user .npmrc plus npm_config_* env vars with correct precedence', async () => {
    clearNpmEnv()
    const prefixDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ncu-prefix-'))
    const userDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ncu-user-'))
    const userConfigFile = path.join(userDir, '.npmrc')

    // the global npmrc lives at <prefix>/etc/npmrc
    await fsp.mkdir(path.join(prefixDir, 'etc'), { recursive: true })
    await fsp.writeFile(
      path.join(prefixDir, 'etc', 'npmrc'),
      '@precedence:registry=https://global.example.com/\n@global-only:registry=https://globalonly.example.com/\n',
    )
    await fsp.writeFile(userConfigFile, '@precedence:registry=https://user.example.com/\n')

    process.env.PREFIX = prefixDir
    process.env.npm_config_userconfig = userConfigFile
    process.env.npm_config_foo_bar = 'baz'
    process.env.NPM_CONFIG_SOME_KEY = 'qux'

    try {
      const findNpmConfig = await loadFindNpmConfig()
      const config = await findNpmConfig()

      // npm_config_ prefix stripped, then camelCased by normalizeNpmConfig
      expect(config.fooBar).toBe('baz')
      expect(config.someKey).toBe('qux')
      // user .npmrc wins over global
      expect(config['@precedence:registry']).toBe('https://user.example.com/')
      // global-only key survives the merge
      expect(config['@global-only:registry']).toBe('https://globalonly.example.com/')
      // findNpmConfig always disables the cache
      expect(config.cache).toBe(false)
    } finally {
      await removeDir(prefixDir)
      await removeDir(userDir)
    }
  })

  it('normalizes npm_config_* keys, preserving a leading underscore', async () => {
    clearNpmEnv()
    process.env.npm_config__auth = 'token'
    process.env.npm_config_init_author_name = 'me'
    process.env.npm_config_save_exact = 'true'

    const findNpmConfig = await loadFindNpmConfig()
    const config = await findNpmConfig()

    // leading underscore is kept and the key is not camelCased
    expect(config._auth).toBe('token')
    // interior underscores become hyphens, then camelCased
    expect(config.initAuthorName).toBe('me')
    // save-exact is a known boolean, coerced from its string value
    expect(config.saveExact).toBe(true)
  })

  it('falls back to the home directory .npmrc when npm_config_userconfig is unset', async () => {
    clearNpmEnv()
    const homeDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ncu-home-'))
    await fsp.writeFile(path.join(homeDir, '.npmrc'), '@home:registry=https://home.example.com/\n')

    const savedHome = process.env.HOME
    delete process.env.HOME
    vi.spyOn(os, 'homedir').mockReturnValue(homeDir)

    try {
      const findNpmConfig = await loadFindNpmConfig()
      const config = await findNpmConfig()
      expect(config['@home:registry']).toBe('https://home.example.com/')
    } finally {
      if (savedHome === undefined) delete process.env.HOME
      else process.env.HOME = savedHome
      await removeDir(homeDir)
    }
  })

  it('does not read the project .npmrc twice when it is also the user config', async () => {
    clearNpmEnv()
    // point userconfig at the repo .npmrc, which findUp also discovers as the project config
    const repoNpmrc = path.resolve(process.cwd(), '.npmrc')
    process.env.npm_config_userconfig = repoNpmrc

    const readFileSpy = vi.spyOn(fs.promises, 'readFile')
    const findNpmConfig = await loadFindNpmConfig()
    const config = await findNpmConfig()

    // the repo .npmrc sets engine-strict=true
    expect(config.engineStrict).toBe(true)
    // read once, not twice, for the shared user/project path
    const repoReads = readFileSpy.mock.calls.filter(([file]) => file === repoNpmrc)
    expect(repoReads).toHaveLength(1)
  })

  it('propagates a non-ENOENT error when reading the user .npmrc', async () => {
    clearNpmEnv()
    // a directory cannot be read as a file, so readFile rejects with EISDIR
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ncu-baduser-'))
    process.env.npm_config_userconfig = dir

    try {
      const findNpmConfig = await loadFindNpmConfig()
      await expect(findNpmConfig()).rejects.toThrow()
    } finally {
      await removeDir(dir)
    }
  })

  it('derives the global npmrc from the node binary path on Windows', async () => {
    clearNpmEnv()
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    const readFileSpy = vi.spyOn(fs.promises, 'readFile')

    const findNpmConfig = await loadFindNpmConfig()
    await findNpmConfig()

    const expected = path.join(path.dirname(process.execPath), 'etc', 'npmrc')
    expect(readFileSpy).toHaveBeenCalledWith(expected, 'utf-8')
  })

  it('derives the global npmrc from the node binary path on non-Windows', async () => {
    clearNpmEnv()
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    const readFileSpy = vi.spyOn(fs.promises, 'readFile')

    const findNpmConfig = await loadFindNpmConfig()
    await findNpmConfig()

    const expected = path.join(path.dirname(path.dirname(process.execPath)), 'etc', 'npmrc')
    expect(readFileSpy).toHaveBeenCalledWith(expected, 'utf-8')
  })

  it('honors DESTDIR when locating the global npmrc on non-Windows', async () => {
    clearNpmEnv()
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    const destdir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ncu-destdir-'))
    process.env.DESTDIR = destdir
    const readFileSpy = vi.spyOn(fs.promises, 'readFile')

    try {
      const findNpmConfig = await loadFindNpmConfig()
      await findNpmConfig()

      const prefix = path.dirname(path.dirname(process.execPath))
      const expected = path.join(destdir, prefix, 'etc', 'npmrc')
      expect(readFileSpy).toHaveBeenCalledWith(expected, 'utf-8')
    } finally {
      await removeDir(destdir)
    }
  })

  it('honors the PREFIX environment variable when locating the global npmrc', async () => {
    clearNpmEnv()
    const prefixDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ncu-prefixenv-'))
    process.env.PREFIX = prefixDir
    const readFileSpy = vi.spyOn(fs.promises, 'readFile')

    try {
      const findNpmConfig = await loadFindNpmConfig()
      await findNpmConfig()

      const expected = path.join(prefixDir, 'etc', 'npmrc')
      expect(readFileSpy).toHaveBeenCalledWith(expected, 'utf-8')
    } finally {
      await removeDir(prefixDir)
    }
  })
})
