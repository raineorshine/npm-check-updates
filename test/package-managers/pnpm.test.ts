import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pnpmApi } from '../../src/package-managers/pnpm.ts'
import makeTempDir from '../helpers/makeTempDir.ts'
import removeDir from '../helpers/removeDir.ts'

describe('pnpm', () => {
  describe('buildArgs', () => {
    it('accepts a single arg', () => {
      expect(pnpmApi.buildArgs('ls', {})).toStrictEqual(['ls'])
    })

    it('prepends global and appends prefix', () => {
      expect(pnpmApi.buildArgs(['install'], { global: true, prefix: '/usr/local' })).toStrictEqual([
        'global',
        'install',
        '--prefix=/usr/local',
      ])
    })
  })

  describe('parseList', () => {
    const command = 'pnpm ls -g --json'

    it('maps dependencies to versions', () => {
      const stdout = JSON.stringify([
        {
          path: '/home/user/.local/share/pnpm/global/5',
          private: true,
          dependencies: {
            'npm-check-updates': { from: 'npm-check-updates', version: '17.1.0', resolved: '' },
            typescript: { from: 'typescript', version: '5.6.2', resolved: '' },
          },
        },
      ])
      expect(pnpmApi.parseList(stdout, command)).toStrictEqual({
        'npm-check-updates': '17.1.0',
        typescript: '5.6.2',
      })
    })

    it('returns an empty list when no global packages are installed', () => {
      expect(pnpmApi.parseList('[]', command)).toStrictEqual({})
      expect(pnpmApi.parseList('[{"path": "/root", "private": true}]', command)).toStrictEqual({})
    })

    it('reports the command when the output is not json', () => {
      expect(() => pnpmApi.parseList('', command)).toThrow(
        'Expected JSON from "pnpm ls -g --json". Received empty response.',
      )
      expect(() => pnpmApi.parseList('ERR_PNPM_NO_GLOBAL_DIR', command)).toThrow(
        'Expected JSON from "pnpm ls -g --json". Instead received: ERR_PNPM_NO_GLOBAL_DIR',
      )
    })

    it('appends stderr to the error', () => {
      expect(() => pnpmApi.parseList('', command, 'ERR_PNPM_NO_GLOBAL_DIR')).toThrow(
        'Expected JSON from "pnpm ls -g --json". Received empty response.\n\nERR_PNPM_NO_GLOBAL_DIR',
      )
    })
  })

  describe('getPnpmWorkspaceMinimumReleaseAge', () => {
    let tempDir: string
    let originalCwd: string
    let originalXdgConfigHome: string | undefined

    beforeEach(async () => {
      originalCwd = process.cwd()
      originalXdgConfigHome = process.env.XDG_CONFIG_HOME
      tempDir = await makeTempDir('ncu-test-pnpm-')
      // isolate the global config layers from the machine running the tests
      process.env.XDG_CONFIG_HOME = path.join(tempDir, 'xdg')
    })

    afterEach(async () => {
      process.chdir(originalCwd)
      if (originalXdgConfigHome === undefined) {
        delete process.env.XDG_CONFIG_HOME
      } else {
        process.env.XDG_CONFIG_HOME = originalXdgConfigHome
      }
      await removeDir(tempDir)
    })

    /** Writes a pnpm-workspace.yaml into the temp dir and switches cwd to it. */
    async function writeWorkspace(content: string): Promise<void> {
      await fs.writeFile(path.join(tempDir, 'pnpm-workspace.yaml'), content)
      process.chdir(tempDir)
    }

    /** Writes a file into the pnpm global config directory. */
    async function writeGlobalConfig(filename: string, content: string): Promise<void> {
      const globalConfigDir = path.join(tempDir, 'xdg', 'pnpm')
      await fs.mkdir(globalConfigDir, { recursive: true })
      await fs.writeFile(path.join(globalConfigDir, filename), content)
    }

    it('returns null when no config defines minimumReleaseAge', async () => {
      await writeWorkspace('packages:\n  - "packages/*"\n')
      expect(await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()).toBeNull()
    })

    it('reads minimumReleaseAge and exclude patterns from pnpm-workspace.yaml', async () => {
      await writeWorkspace(`minimumReleaseAge: 1440
minimumReleaseAgeExclude:
  - "react"
  - "@myorg/*"
`)
      expect(await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()).toStrictEqual({
        minimumReleaseAge: 1440,
        minimumReleaseAgeExclude: ['react', '@myorg/*'],
      })
    })

    it('coerces a numeric string minimumReleaseAge', async () => {
      await writeWorkspace('minimumReleaseAge: "720"\n')
      const result = await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()
      expect(result?.minimumReleaseAge).toBe(720)
    })

    it('ignores a negative minimumReleaseAge', async () => {
      await writeWorkspace('minimumReleaseAge: -5\n')
      expect(await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()).toBeNull()
    })

    it('parses a JSON-encoded string minimumReleaseAgeExclude', async () => {
      await writeWorkspace('minimumReleaseAge: 60\nminimumReleaseAgeExclude: \'["react", "vue"]\'\n')
      const result = await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()
      expect(result?.minimumReleaseAgeExclude).toStrictEqual(['react', 'vue'])
    })

    it('treats a plain string minimumReleaseAgeExclude as a single pattern', async () => {
      await writeWorkspace('minimumReleaseAge: 60\nminimumReleaseAgeExclude: "react"\n')
      const result = await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()
      expect(result?.minimumReleaseAgeExclude).toStrictEqual(['react'])
    })

    it('ignores a pnpm-workspace.yaml that is not valid yaml', async () => {
      await writeWorkspace('minimumReleaseAge: 60\n  minimumReleaseAgeExclude: [\n')
      expect(await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()).toBeNull()
    })

    // pnpm >= 11
    it('reads minimumReleaseAge from the global config.yaml', async () => {
      await writeGlobalConfig('config.yaml', 'minimumReleaseAge: 2880\nminimumReleaseAgeExclude:\n  - "vue"\n')
      process.chdir(tempDir)
      expect(await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()).toStrictEqual({
        minimumReleaseAge: 2880,
        minimumReleaseAgeExclude: ['vue'],
      })
    })

    // pnpm <= 10 stores arrays in the ini-formatted rc file as JSON, and uses kebab-case keys
    it('reads minimumReleaseAge from the global rc file', async () => {
      await writeGlobalConfig('rc', 'minimum-release-age=4320\nminimum-release-age-exclude=["vue"]\n')
      process.chdir(tempDir)
      expect(await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()).toStrictEqual({
        minimumReleaseAge: 4320,
        minimumReleaseAgeExclude: ['vue'],
      })
    })

    it('falls back to the platform-specific global config directory when XDG_CONFIG_HOME is unset', async () => {
      delete process.env.XDG_CONFIG_HOME
      await writeWorkspace('minimumReleaseAge: 90\n')
      // only assert the workspace value, since the global layers are the machine's real pnpm config here
      const result = await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()
      expect(result?.minimumReleaseAge).toBe(90)
    })

    // pnpm reads a single global config, so when both exist the installed major version decides
    describe('both global config files exist', () => {
      beforeEach(async () => {
        await writeGlobalConfig('config.yaml', 'minimumReleaseAge: 2880\nminimumReleaseAgeExclude:\n  - "vue"\n')
        await writeGlobalConfig('rc', 'minimum-release-age=4320\nminimum-release-age-exclude=["svelte"]\n')
        process.chdir(tempDir)
      })

      it('reads config.yaml on pnpm >= 11', async () => {
        expect(await pnpmApi.getPnpmWorkspaceMinimumReleaseAge(11)).toStrictEqual({
          minimumReleaseAge: 2880,
          minimumReleaseAgeExclude: ['vue'],
        })
      })

      it('reads rc on pnpm <= 10', async () => {
        expect(await pnpmApi.getPnpmWorkspaceMinimumReleaseAge(10)).toStrictEqual({
          minimumReleaseAge: 4320,
          minimumReleaseAgeExclude: ['svelte'],
        })
      })
    })

    // a global config that defines no minimumReleaseAge must not hide one that does
    it('falls through to the global rc file when config.yaml defines no minimumReleaseAge', async () => {
      await writeGlobalConfig('config.yaml', 'storeDir: /tmp/store\n')
      await writeGlobalConfig('rc', 'minimum-release-age=4320\n')
      process.chdir(tempDir)
      // null reads both globals, the fallback when the installed pnpm version cannot be determined
      expect(await pnpmApi.getPnpmWorkspaceMinimumReleaseAge(null)).toStrictEqual({
        minimumReleaseAge: 4320,
        minimumReleaseAgeExclude: [],
      })
    })

    it('prefers the workspace minimumReleaseAge and merges excludes across layers', async () => {
      await writeGlobalConfig('config.yaml', 'minimumReleaseAge: 2880\nminimumReleaseAgeExclude:\n  - "vue"\n')
      await writeWorkspace('minimumReleaseAge: 60\nminimumReleaseAgeExclude:\n  - "react"\n')
      expect(await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()).toStrictEqual({
        minimumReleaseAge: 60,
        minimumReleaseAgeExclude: ['react', 'vue'],
      })
    })
  })
})
