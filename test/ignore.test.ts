import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import spawn from 'spawn-please'
import { type MockInstance, afterEach, describe, expect, it, vi } from 'vitest'
import ncu, { type IgnoreRules } from '../src/index.ts'
import getIgnoreRules from '../src/lib/getIgnoreRules.ts'
import getIgnoredUpgradesDueToPeerDeps from '../src/lib/getIgnoredUpgradesDueToPeerDeps.ts'
import { toDependencyTable } from '../src/lib/logging.ts'
import { type Packument } from '../src/types/Packument.ts'
import createMockVersion from './helpers/createMockVersion.ts'
import makeTempDir from './helpers/makeTempDir.ts'
import removeDir from './helpers/removeDir.ts'
import { silenceProgressBar } from './helpers/silenceProgressBar.ts'
import stubVersions from './helpers/stubVersions.ts'

const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/bin/cli.ts')

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()
/** Returns an ISO date n days before now. */
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString()

/** @mui/icons-material with 7.3.0, 8.0.0 and 9.1.0 published and 9.1.0 tagged latest. */
const muiPackument = (extraVersions: Record<string, string> = {}, distTags: Record<string, string> = {}) =>
  createMockVersion({
    name: '@mui/icons-material',
    versions: {
      '9.1.0': daysAgo(10),
      '8.0.0': daysAgo(40),
      '7.3.0': daysAgo(50),
      '7.2.0': daysAgo(60),
      ...extraVersions,
    },
    distTags: { latest: '9.1.0', ...distTags },
  })

/** Console output with ANSI codes removed and whitespace collapsed, one entry per line. */
const getNormalizedLogs = (logSpy: MockInstance<(...args: any[]) => void>): string[] =>
  logSpy.mock.calls
    .flat()
    .filter((arg): arg is string => typeof arg === 'string')
    .join('\n')
    .split('\n')
    .map(line => stripVTControlCharacters(line).replace(/\s+/g, ' ').trim())
    .filter(Boolean)

/** Runs ncu with printing enabled and returns the normalized console output. */
const runAndLog = async (options: Parameters<typeof ncu>[0]) => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  silenceProgressBar()
  try {
    await ncu({ jsonUpgraded: false, loglevel: 'warn', ...options })
    return getNormalizedLogs(logSpy)
  } finally {
    logSpy.mockRestore()
  }
}

const muiIgnore: IgnoreRules = { '@mui/*': { versions: '^8 || ^9', reason: 'Waiting for react-admin support' } }

describe('ignore', () => {
  describe('rules', () => {
    it('normalizes a range string and a { versions, reason } object', () => {
      const match = getIgnoreRules({
        ignore: { react: '^18', vue: { versions: '^3', reason: 'Waiting for plugins' } },
      })!
      expect(match(['react'])).toEqual([{ range: '^18' }])
      expect(match(['vue'])).toEqual([{ range: '^3', reason: 'Waiting for plugins' }])
      expect(match(['lodash'])).toEqual([])
    })

    it('returns null when there are no rules', () => {
      expect(getIgnoreRules({})).toBeNull()
    })

    it('matches scope globs and exact names', () => {
      const match = getIgnoreRules({ ignore: { '@mui/*': '^8', 'eslint-config-prettier': '9.1.1' } })!
      expect(match(['@mui/material'])).toEqual([{ range: '^8' }])
      expect(match(['react'])).toEqual([])
      expect(match(['eslint-config-prettier'])).toEqual([{ range: '9.1.1' }])
      expect(match(['eslint-config-prettier-foo'])).toEqual([])
    })

    it('matches any of the given names, such as an npm alias and its real package name', () => {
      const match = getIgnoreRules({ ignore: { '@mui/material': '^9' } })!
      expect(match(['mui', '@mui/material'])).toEqual([{ range: '^9' }])
    })

    it('returns every matching rule', () => {
      const match = getIgnoreRules({
        ignore: { '@mui/*': { versions: '^9', reason: 'A' }, '@mui/material': { versions: '9.1.0', reason: 'B' } },
      })!
      expect(match(['@mui/material'])).toEqual([
        { range: '^9', reason: 'A' },
        { range: '9.1.0', reason: 'B' },
      ])
    })

    it('rejects an invalid range, naming the key', () => {
      expect(() => getIgnoreRules({ ignore: { react: 'not a range' } })).toThrow(/react/)
    })

    it('rejects a rule without versions, naming the key', () => {
      expect(() => getIgnoreRules({ ignore: { react: { reason: 'x' } } as unknown as IgnoreRules })).toThrow(/react/)
    })

    it('rejects a rule that is not a string or object, naming the key', () => {
      expect(() => getIgnoreRules({ ignore: { react: 5 } as unknown as IgnoreRules })).toThrow(/react/)
    })

    it('rejects a non-string reason, naming the key', () => {
      expect(() =>
        getIgnoreRules({ ignore: { react: { versions: '^18', reason: 5 } } as unknown as IgnoreRules }),
      ).toThrow(/react/)
    })

    it('rejects a string, as passed on the command line, with a config-only message', () => {
      expect(() => getIgnoreRules({ ignore: 'react@18' as unknown as IgnoreRules })).toThrow(/config/)
    })
  })

  describe('version selection', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('falls back to the greatest version that is not ignored under --target latest', async () => {
      // Covers AE1.
      const stub = stubVersions(muiPackument())
      const result = await ncu({
        packageData: { dependencies: { '@mui/icons-material': '7.2.0' } },
        ignore: muiIgnore,
      })
      expect(result).toEqual({ '@mui/icons-material': '7.3.0' })
      stub.restore()
    })

    it('does not upgrade when the tagged version is ignored under --target @latest', async () => {
      // Covers AE2.
      const stub = stubVersions(muiPackument())
      const result = await ncu({
        packageData: { dependencies: { '@mui/icons-material': '7.2.0' } },
        ignore: muiIgnore,
        target: '@latest',
      })
      expect(result).toEqual({})
      stub.restore()
    })

    it('does not upgrade when another tag points to an ignored version', async () => {
      const stub = stubVersions(muiPackument({ '9.2.0': daysAgo(5) }, { next: '9.2.0' }))
      const result = await ncu({
        packageData: { dependencies: { '@mui/icons-material': '7.2.0' } },
        ignore: muiIgnore,
        target: '@next',
      })
      expect(result).toEqual({})
      stub.restore()
    })

    it('skips ignored versions under --target greatest', async () => {
      const stub = stubVersions(muiPackument())
      const result = await ncu({
        packageData: { dependencies: { '@mui/icons-material': '7.2.0' } },
        ignore: muiIgnore,
        target: 'greatest',
      })
      expect(result).toEqual({ '@mui/icons-material': '7.3.0' })
      stub.restore()
    })

    it('skips ignored versions under --target minor, patch and semver', async () => {
      const stub = stubVersions(muiPackument({ '7.4.0': daysAgo(20), '7.2.2': daysAgo(30), '7.2.1': daysAgo(35) }))
      const packageData = { dependencies: { '@mui/icons-material': '^7.2.0' } }
      const ignore = { '@mui/icons-material': '7.4.0 || 7.2.2' }
      expect(await ncu({ packageData, ignore, target: 'minor' })).toEqual({ '@mui/icons-material': '^7.3.0' })
      expect(await ncu({ packageData, ignore, target: 'patch' })).toEqual({ '@mui/icons-material': '^7.2.1' })
      expect(await ncu({ packageData, ignore, target: 'semver' })).toEqual({ '@mui/icons-material': '^7.3.0' })
      stub.restore()
    })

    it('picks the most recently published version that is not ignored under --target newest', async () => {
      const stub = stubVersions(muiPackument({ '7.3.1': daysAgo(5) }))
      const result = await ncu({
        packageData: { dependencies: { '@mui/icons-material': '7.2.0' } },
        ignore: { '@mui/icons-material': '7.3.1' },
        target: 'newest',
      })
      expect(result).toEqual({ '@mui/icons-material': '9.1.0' })
      stub.restore()
    })

    it('falls back below one ignored release', async () => {
      // Covers AE5.
      const stub = stubVersions(
        createMockVersion({
          name: 'eslint-config-prettier',
          versions: { '9.1.1': daysAgo(1), '9.1.0': daysAgo(20), '9.0.0': daysAgo(40) },
          distTags: { latest: '9.1.1' },
        }),
      )
      const result = await ncu({
        packageData: { dependencies: { 'eslint-config-prettier': '9.0.0' } },
        ignore: { 'eslint-config-prettier': '9.1.1' },
      })
      expect(result).toEqual({ 'eslint-config-prettier': '9.1.0' })
      stub.restore()
    })

    it('leaves a current version inside the ignored range alone and still offers versions outside it', async () => {
      // Covers AE6.
      const packageData = { dependencies: { '@mui/icons-material': '9.0.0' } }
      const stub = stubVersions(muiPackument({ '9.0.0': daysAgo(30) }))
      expect(await ncu({ packageData, ignore: muiIgnore })).toEqual({})
      stub.restore()

      const stub2 = stubVersions(muiPackument({ '9.0.0': daysAgo(30), '10.0.0': daysAgo(1) }, { latest: '10.0.0' }))
      expect(await ncu({ packageData, ignore: muiIgnore })).toEqual({ '@mui/icons-material': '10.0.0' })
      stub2.restore()
    })

    it('can fall back to an untagged stable version above the ignored latest', async () => {
      // Covers AE8.
      const stub = stubVersions(muiPackument({ '10.0.0': daysAgo(2) }, { next: '10.0.0' }))
      const result = await ncu({
        packageData: { dependencies: { '@mui/icons-material': '7.2.0' } },
        ignore: muiIgnore,
      })
      expect(result).toEqual({ '@mui/icons-material': '10.0.0' })
      stub.restore()
    })

    it('honors ignore and cooldown together', async () => {
      // Covers AE7: 9.1.0 is ignored, 7.3.0 is in cooldown, so 7.2.5 is chosen.
      const stub = stubVersions(
        createMockVersion({
          name: '@mui/icons-material',
          versions: { '9.1.0': daysAgo(30), '7.3.0': daysAgo(2), '7.2.5': daysAgo(20), '7.2.0': daysAgo(60) },
          distTags: { latest: '9.1.0' },
        }),
      )
      const result = await ncu({
        packageData: { dependencies: { '@mui/icons-material': '7.2.0' } },
        ignore: muiIgnore,
        cooldown: 7,
      })
      expect(result).toEqual({ '@mui/icons-material': '7.2.5' })
      stub.restore()
    })

    it('falls back past a deprecated latest and an ignored greatest', async () => {
      const packument = muiPackument({ '9.2.0': daysAgo(3) })
      ;(packument.versions!['9.1.0'] as Partial<Packument>).deprecated = 'do not use'
      const stub = stubVersions(packument)
      const result = await ncu({
        packageData: { dependencies: { '@mui/icons-material': '7.2.0' } },
        ignore: { '@mui/icons-material': '9.2.0 || ^8' },
        deprecated: false,
      })
      expect(result).toEqual({ '@mui/icons-material': '7.3.0' })
      stub.restore()
    })

    it('holds back prereleases inside the range when the current version is a prerelease', async () => {
      const stub = stubVersions(muiPackument({ '9.2.0-beta.1': daysAgo(2), '7.4.0-beta.1': daysAgo(3) }))
      const result = await ncu({
        packageData: { dependencies: { '@mui/icons-material': '7.3.0-beta.0' } },
        ignore: muiIgnore,
        target: 'greatest',
      })
      expect(result).toEqual({ '@mui/icons-material': '7.4.0-beta.1' })
      stub.restore()
    })

    it('does not upgrade when every newer version is ignored', async () => {
      const stub = stubVersions(muiPackument())
      const result = await ncu({
        packageData: { dependencies: { '@mui/icons-material': '7.2.0' } },
        ignore: { '@mui/icons-material': '>7.2.0' },
      })
      expect(result).toEqual({})
      stub.restore()
    })

    it('matches a rule against an npm alias and its real package name', async () => {
      const stub = stubVersions(muiPackument())
      const packageData = { dependencies: { icons: 'npm:@mui/icons-material@7.2.0' } }
      expect(await ncu({ packageData, ignore: { icons: '^8 || ^9' } })).toEqual({
        icons: 'npm:@mui/icons-material@7.3.0',
      })
      expect(await ncu({ packageData, ignore: muiIgnore })).toEqual({ icons: 'npm:@mui/icons-material@7.3.0' })
      stub.restore()
    })

    it('rejects an invalid rule before checking versions', async () => {
      // Covers AE9.
      const stub = stubVersions('1.0.0')
      await expect(
        ncu({ packageData: { dependencies: { react: '1.0.0' } }, ignore: { react: 'not a range' } }),
      ).rejects.toThrow(/react/)
      stub.restore()
    })

    it('does not use a cached version that a rule ignores', async () => {
      const tempDir = await makeTempDir()
      const cacheFile = path.join(tempDir, 'cache.json')
      const packageData = { dependencies: { '@mui/icons-material': '7.2.0' } }
      const stub = stubVersions(muiPackument())
      try {
        expect(await ncu({ packageData, cache: true, cacheFile })).toEqual({ '@mui/icons-material': '9.1.0' })
        expect(await ncu({ packageData, cache: true, cacheFile, ignore: muiIgnore })).toEqual({
          '@mui/icons-material': '7.3.0',
        })
        const cache = JSON.parse(await fs.readFile(cacheFile, 'utf-8'))
        expect(JSON.stringify(cache)).not.toContain('7.3.0')
      } finally {
        stub.restore()
        await removeDir(tempDir)
      }
    })

    it('gives no upgrade when a static registry version is ignored', async () => {
      const result = await ncu({
        packageData: { dependencies: { 'ncu-test-v2': '1.0.0' } },
        registryType: 'json',
        registry: './test/test-data/registry.json',
        ignore: { 'ncu-test-v2': '99.9.9' },
      })
      expect(result).toEqual({})
    })

    it('reads rules from .ncurc.json and .ncurc.yml files', async () => {
      const tempDir = await makeTempDir()
      const stub = stubVersions(muiPackument(), { spawn: true })
      const stdin = JSON.stringify({ dependencies: { '@mui/icons-material': '7.2.0' } })
      try {
        await fs.writeFile(path.join(tempDir, '.ncurc.json'), JSON.stringify({ ignore: muiIgnore }), 'utf-8')
        const { stdout } = await spawn('node', [bin, '--stdin', '--jsonUpgraded', '--configFilePath', tempDir], {
          stdin,
        })
        expect(JSON.parse(stdout)).toEqual({ '@mui/icons-material': '7.3.0' })

        await fs.writeFile(path.join(tempDir, '.ncurc.yml'), 'ignore:\n  "@mui/*": "^8 || ^9"\n', 'utf-8')
        const { stdout: stdoutYaml } = await spawn(
          'node',
          [bin, '--stdin', '--jsonUpgraded', '--configFilePath', tempDir, '--configFileName', '.ncurc.yml'],
          { stdin },
        )
        expect(JSON.parse(stdoutYaml)).toEqual({ '@mui/icons-material': '7.3.0' })
      } finally {
        stub.restore()
        await removeDir(tempDir)
      }
    })

    it('writes the fallback version with --upgrade', async () => {
      const tempDir = await makeTempDir()
      const packageFile = path.join(tempDir, 'package.json')
      await fs.writeFile(packageFile, JSON.stringify({ dependencies: { '@mui/icons-material': '^7.2.0' } }), 'utf-8')
      const stub = stubVersions(muiPackument())
      try {
        await ncu({ packageFile, upgrade: true, ignore: muiIgnore })
        const written = JSON.parse(await fs.readFile(packageFile, 'utf-8'))
        expect(written.dependencies['@mui/icons-material']).toBe('^7.3.0')
      } finally {
        stub.restore()
        await removeDir(tempDir)
      }
    })

    it('applies a workspace .ncurc rule to that workspace only, and rejects an invalid one', async () => {
      const tempDir = await makeTempDir()
      const stub = stubVersions(muiPackument())
      const dependencies = { '@mui/icons-material': '7.2.0' }
      try {
        await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }))
        for (const name of ['a', 'b']) {
          await fs.mkdir(path.join(tempDir, 'packages', name), { recursive: true })
          await fs.writeFile(
            path.join(tempDir, 'packages', name, 'package.json'),
            JSON.stringify({ name, dependencies }),
          )
        }
        const rcFile = path.join(tempDir, 'packages', 'a', '.ncurc.json')
        await fs.writeFile(rcFile, JSON.stringify({ ignore: muiIgnore }))

        const result = await ncu({ cwd: tempDir, workspaces: true })
        expect(result).toEqual({
          'package.json': {},
          'packages/a/package.json': { '@mui/icons-material': '7.3.0' },
          'packages/b/package.json': { '@mui/icons-material': '9.1.0' },
        })

        await fs.writeFile(rcFile, JSON.stringify({ ignore: { '@mui/icons-material': 'not a range' } }))
        await expect(ncu({ cwd: tempDir, workspaces: true })).rejects.toThrow(/@mui\/icons-material/)
      } finally {
        stub.restore()
        await removeDir(tempDir)
      }
    })

    it('never lists an ignored version among the upgrades held back by peer dependencies', async () => {
      const stub = stubVersions({
        'test-package': createMockVersion({
          name: 'test-package',
          versions: { '2.0.0': daysAgo(1), '1.1.0': daysAgo(10), '1.0.0': daysAgo(20) },
          distTags: { latest: '2.0.0' },
        }),
        'test-peer': createMockVersion({
          name: 'test-peer',
          versions: { '1.1.0': daysAgo(10), '1.0.0': daysAgo(20) },
          distTags: { latest: '1.1.0' },
        }),
      })
      const args = [
        { 'test-package': '1.0.0', 'test-peer': '1.0.0' },
        { 'test-package': '1.1.0', 'test-peer': '1.1.0' },
        { 'test-peer': { 'test-package': '1.1.x' } },
      ] as const
      expect(await getIgnoredUpgradesDueToPeerDeps(...args, {})).toHaveProperty('test-package.to', '2.0.0')
      expect(await getIgnoredUpgradesDueToPeerDeps(...args, { ignore: { 'test-package': '2.0.0' } })).toEqual({})
      stub.restore()
    })
  })

  describe('reporting', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    const packageData = { dependencies: { '@mui/icons-material': '7.2.0' } }

    it('shows held-back versions and reasons with --format skipped', async () => {
      // Covers AE3.
      const stub = stubVersions(muiPackument())
      const logs = await runAndLog({ packageData, ignore: muiIgnore, format: ['skipped'] })
      expect(logs).toContain('Skipped')
      expect(logs).toContain('@mui/icons-material 7.3.0 → 9.1.0 ignored: Waiting for react-admin support')
      expect(logs).toContain('@mui/icons-material 7.2.0 → 7.3.0 [ignored] 9.1.0')
      expect(logs.join('\n')).not.toContain('[missing time]')
      stub.restore()
    })

    it('shows nothing about ignore rules without --format skipped', async () => {
      // Covers AE4.
      const stub = stubVersions(muiPackument())
      const logs = (await runAndLog({ packageData, ignore: muiIgnore, format: [] })).join('\n')
      expect(logs).toContain('7.2.0 → 7.3.0')
      expect(logs).not.toContain('[ignored]')
      expect(logs).not.toContain('Skipped')
      expect(logs).not.toContain('Waiting for react-admin support')
      stub.restore()
    })

    it('treats --format cooldown as an alias for --format skipped', async () => {
      const stub = stubVersions(muiPackument())
      const skipped = await runAndLog({ packageData, ignore: muiIgnore, format: ['skipped'] })
      const cooldown = await runAndLog({ packageData, ignore: muiIgnore, format: ['cooldown'] })
      expect(cooldown).toEqual(skipped)
      stub.restore()
    })

    it('lists one row per cause when ignore and cooldown hold back the same package', async () => {
      // Covers AE7.
      const stub = stubVersions(
        createMockVersion({
          name: '@mui/icons-material',
          versions: { '9.1.0': daysAgo(30), '7.3.0': daysAgo(2), '7.2.5': daysAgo(20), '7.2.0': daysAgo(60) },
          distTags: { latest: '9.1.0' },
        }),
      )
      const logs = await runAndLog({ packageData, ignore: muiIgnore, cooldown: 7, format: ['skipped'] })
      expect(logs).toContain('@mui/icons-material 7.2.0 → 7.2.5 [cooldown] 7.3.0 [ignored] 9.1.0')
      expect(logs).toContain('@mui/icons-material 7.2.5 → 7.3.0 7-day cooldown 2 days ago')
      expect(logs).toContain('@mui/icons-material 7.2.5 → 9.1.0 ignored: Waiting for react-admin support')
      stub.restore()
    })

    it('does not blame the registry when every dependency is held back', async () => {
      const stub = stubVersions(muiPackument())
      const logs = (await runAndLog({ packageData, ignore: muiIgnore, target: '@latest', format: [] })).join('\n')
      expect(logs).not.toContain('No package versions were returned')
      stub.restore()
    })

    it('shows "ignored" alone for a rule without a reason', async () => {
      const stub = stubVersions(muiPackument())
      const logs = await runAndLog({ packageData, ignore: { '@mui/*': '^8 || ^9' }, format: ['skipped'] })
      expect(logs).toContain('@mui/icons-material 7.3.0 → 9.1.0 ignored')
      stub.restore()
    })

    it('accepts skipped as a --format value', async () => {
      await expect(ncu({ packageData: { dependencies: {} }, format: ['skippd'] })).rejects.toThrow(/skipped/)
    })

    it('shows the inline ignore marker in tables, such as interactive choices, only with --format skipped', async () => {
      const args = {
        from: { x: '1.0.0' },
        to: { x: '1.1.0' },
        skippedByIgnore: { x: { name: 'x', currentVersion: '1.0.0', version: '2.0.0' } },
      }
      expect(await toDependencyTable({ ...args, format: ['skipped'] })).toContain('[ignored]')
      expect(await toDependencyTable({ ...args, format: [] })).not.toContain('[ignored]')
    })

    it('does not record versions outside the target, or prereleases without --pre', async () => {
      const stub = stubVersions(muiPackument({ '9.2.0-beta.1': daysAgo(1) }))
      const minor = (await runAndLog({ packageData, ignore: muiIgnore, target: 'minor', format: ['skipped'] })).join(
        '\n',
      )
      expect(minor).not.toContain('[ignored]')
      const latest = (await runAndLog({ packageData, ignore: muiIgnore, format: ['skipped'] })).join('\n')
      expect(latest).not.toContain('beta')
      stub.restore()
    })

    it('shows ignore rows when a workspace .ncurc sets format cooldown', async () => {
      const tempDir = await makeTempDir()
      const stub = stubVersions(muiPackument())
      try {
        await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }))
        await fs.mkdir(path.join(tempDir, 'packages', 'a'), { recursive: true })
        await fs.writeFile(path.join(tempDir, 'packages', 'a', 'package.json'), JSON.stringify(packageData))
        await fs.writeFile(
          path.join(tempDir, 'packages', 'a', '.ncurc.json'),
          JSON.stringify({ ignore: muiIgnore, format: ['cooldown'] }),
        )
        const logs = await runAndLog({ cwd: tempDir, workspaces: true })
        expect(logs).toContain('@mui/icons-material 7.3.0 → 9.1.0 ignored: Waiting for react-admin support')
      } finally {
        stub.restore()
        await removeDir(tempDir)
      }
    })
  })
})
