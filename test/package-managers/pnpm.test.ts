import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { pnpmApi } from '../../src/package-managers/pnpm.ts'
import usePnpmConfigDirs from '../helpers/pnpmConfigDirs.ts'

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
    // isolates cwd and XDG_CONFIG_HOME, so the machine's own pnpm config cannot leak into the assertions
    const { writeWorkspace, writeGlobalConfig } = usePnpmConfigDirs()

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
      expect(await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()).toStrictEqual({
        minimumReleaseAge: 2880,
        minimumReleaseAgeExclude: ['vue'],
      })
    })

    // pnpm <= 10 stores arrays in the ini-formatted rc file as JSON, and uses kebab-case keys
    it('reads minimumReleaseAge from the global rc file', async () => {
      await writeGlobalConfig('rc', 'minimum-release-age=4320\nminimum-release-age-exclude=["vue"]\n')
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

  describe('getPnpmWorkspaceRegistries', () => {
    // isolates cwd and XDG_CONFIG_HOME, so the machine's own pnpm registries cannot leak into the assertions
    const dirs = usePnpmConfigDirs()

    it('returns no registries when pnpm-workspace.yaml does not define any', async () => {
      await dirs.writeWorkspace('packages:\n  - "packages/*"\n')
      expect(await pnpmApi.getPnpmWorkspaceRegistries()).toStrictEqual({ default: undefined, scoped: {} })
    })

    it('returns no registries when there is no pnpm-workspace.yaml at all', async () => {
      expect(await pnpmApi.getPnpmWorkspaceRegistries()).toStrictEqual({ default: undefined, scoped: {} })
    })

    it('reads the default registry from pnpm-workspace.yaml', async () => {
      await dirs.writeWorkspace('registries:\n  default: https://registry.example.com/\n')
      expect(await pnpmApi.getPnpmWorkspaceRegistries()).toStrictEqual({
        default: 'https://registry.example.com/',
        scoped: {},
      })
    })

    it('reads scoped registries from pnpm-workspace.yaml', async () => {
      await dirs.writeWorkspace(`registries:
  default: https://registry.example.com/
  "@myorg": https://myorg.example.com/
  "@internal": https://internal.example.com/
`)
      expect(await pnpmApi.getPnpmWorkspaceRegistries()).toStrictEqual({
        default: 'https://registry.example.com/',
        scoped: {
          '@myorg': 'https://myorg.example.com/',
          '@internal': 'https://internal.example.com/',
        },
      })
    })

    it('ignores non-string and empty registry values', async () => {
      await dirs.writeWorkspace(`registries:
  default: ""
  "@myorg": 42
  "@internal": https://internal.example.com/
`)
      expect(await pnpmApi.getPnpmWorkspaceRegistries()).toStrictEqual({
        default: undefined,
        scoped: { '@internal': 'https://internal.example.com/' },
      })
    })

    it('ignores a registries value that is not a map', async () => {
      await dirs.writeWorkspace('registries: https://registry.example.com/\n')
      expect(await pnpmApi.getPnpmWorkspaceRegistries()).toStrictEqual({ default: undefined, scoped: {} })
    })

    it('searches upwards from an explicit cwd', async () => {
      await dirs.writeWorkspace('registries:\n  default: https://registry.example.com/\n')
      const nested = path.join(dirs.projectDir, 'packages', 'sub')
      await fs.mkdir(nested, { recursive: true })
      process.chdir(os.tmpdir())

      expect(await pnpmApi.getPnpmWorkspaceRegistries(nested)).toStrictEqual({
        default: 'https://registry.example.com/',
        scoped: {},
      })
    })

    // pnpm reads registries from its global config.yaml since 11.11
    describe('global config.yaml fallback', () => {
      it('reads registries from the global config.yaml when pnpm-workspace.yaml is absent', async () => {
        await dirs.writeGlobalConfig(
          'config.yaml',
          'registries:\n  default: https://global.example.com/\n  "@myorg": https://global-myorg.example.com/\n',
        )

        expect(await pnpmApi.getPnpmWorkspaceRegistries()).toStrictEqual({
          default: 'https://global.example.com/',
          scoped: { '@myorg': 'https://global-myorg.example.com/' },
        })
      })

      it('prefers pnpm-workspace.yaml over the global config, merging scoped entries per scope', async () => {
        await dirs.writeGlobalConfig(
          'config.yaml',
          'registries:\n  default: https://global.example.com/\n  "@myorg": https://global-myorg.example.com/\n  "@global-only": https://global-only.example.com/\n',
        )
        await dirs.writeWorkspace(
          'registries:\n  default: https://workspace.example.com/\n  "@myorg": https://workspace-myorg.example.com/\n',
        )

        expect(await pnpmApi.getPnpmWorkspaceRegistries()).toStrictEqual({
          default: 'https://workspace.example.com/',
          scoped: {
            '@myorg': 'https://workspace-myorg.example.com/',
            '@global-only': 'https://global-only.example.com/',
          },
        })
      })

      it('falls back to the global default when pnpm-workspace.yaml omits it', async () => {
        await dirs.writeGlobalConfig('config.yaml', 'registries:\n  default: https://global.example.com/\n')
        await dirs.writeWorkspace('registries:\n  "@myorg": https://workspace-myorg.example.com/\n')

        expect(await pnpmApi.getPnpmWorkspaceRegistries()).toStrictEqual({
          default: 'https://global.example.com/',
          scoped: { '@myorg': 'https://workspace-myorg.example.com/' },
        })
      })

      // registries requires pnpm >= 11, which does not read the rc file
      it('does not read registries from the global rc file', async () => {
        await dirs.writeGlobalConfig('rc', 'registries[default]=https://rc.example.com/\n')
        expect(await pnpmApi.getPnpmWorkspaceRegistries()).toStrictEqual({ default: undefined, scoped: {} })
      })
    })
  })
})
