import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pnpmApi } from '../../src/package-managers/pnpm.ts'
import removeDir from '../helpers/removeDir.ts'

describe('pnpm', () => {
  let tempDir: string
  let originalCwd: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-test-pnpm-'))
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await removeDir(tempDir)
  })

  /** Writes a pnpm-workspace.yaml into the temp dir and switches cwd to it. */
  async function writeWorkspace(content: string): Promise<void> {
    await fs.writeFile(path.join(tempDir, 'pnpm-workspace.yaml'), content)
    process.chdir(tempDir)
  }

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
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-test-pnpm-'))
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

    // the global rc file is only read when config.yaml is absent, matching pnpm which reads a single global config
    it('ignores the global rc file when the global config.yaml exists', async () => {
      await writeGlobalConfig('config.yaml', 'minimumReleaseAge: 2880\nminimumReleaseAgeExclude:\n  - "vue"\n')
      await writeGlobalConfig('rc', 'minimum-release-age=4320\nminimum-release-age-exclude=["svelte"]\n')
      process.chdir(tempDir)
      expect(await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()).toStrictEqual({
        minimumReleaseAge: 2880,
        minimumReleaseAgeExclude: ['vue'],
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
    it('returns no registries when pnpm-workspace.yaml does not define any', async () => {
      await writeWorkspace('packages:\n  - "packages/*"\n')
      expect(await pnpmApi.getPnpmWorkspaceRegistries()).toStrictEqual({ default: undefined, scoped: {} })
    })

    it('reads the default registry from pnpm-workspace.yaml', async () => {
      await writeWorkspace('registries:\n  default: https://registry.example.com/\n')
      expect(await pnpmApi.getPnpmWorkspaceRegistries()).toStrictEqual({
        default: 'https://registry.example.com/',
        scoped: {},
      })
    })

    it('reads scoped registries from pnpm-workspace.yaml', async () => {
      await writeWorkspace(`registries:
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
      await writeWorkspace(`registries:
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
      await writeWorkspace('registries: https://registry.example.com/\n')
      expect(await pnpmApi.getPnpmWorkspaceRegistries()).toStrictEqual({ default: undefined, scoped: {} })
    })
  })

  describe('pnpm global registries config fallback', () => {
    let originalCwd: string
    let originalXdg: string | undefined
    let projectDir: string
    let xdgDir: string

    beforeEach(async () => {
      originalCwd = process.cwd()
      originalXdg = process.env.XDG_CONFIG_HOME
      // A project directory without a pnpm-workspace.yaml so the workspace layer is absent.
      projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-pnpm-registries-project-'))
      // An isolated XDG_CONFIG_HOME so pnpm's global config resolves to a temp directory.
      xdgDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-pnpm-registries-xdg-'))
      await fs.mkdir(path.join(xdgDir, 'pnpm'), { recursive: true })
      process.env.XDG_CONFIG_HOME = xdgDir
      process.chdir(projectDir)
    })

    afterEach(async () => {
      process.chdir(originalCwd)
      if (originalXdg === undefined) {
        delete process.env.XDG_CONFIG_HOME
      } else {
        process.env.XDG_CONFIG_HOME = originalXdg
      }
      await removeDir(projectDir)
      await removeDir(xdgDir)
    })

    it('reads registries from pnpm global config.yaml when pnpm-workspace.yaml is absent', async () => {
      await fs.writeFile(
        path.join(xdgDir, 'pnpm', 'config.yaml'),
        'registries:\n  default: https://global.example.com/\n  "@myorg": https://global-myorg.example.com/\n',
      )

      expect(await pnpmApi.getPnpmWorkspaceRegistries()).toStrictEqual({
        default: 'https://global.example.com/',
        scoped: { '@myorg': 'https://global-myorg.example.com/' },
      })
    })

    it('prefers pnpm-workspace.yaml over the global config, merging scoped entries per scope', async () => {
      await fs.writeFile(
        path.join(xdgDir, 'pnpm', 'config.yaml'),
        'registries:\n  default: https://global.example.com/\n  "@myorg": https://global-myorg.example.com/\n  "@global-only": https://global-only.example.com/\n',
      )
      await fs.writeFile(
        path.join(projectDir, 'pnpm-workspace.yaml'),
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
      await fs.writeFile(
        path.join(xdgDir, 'pnpm', 'config.yaml'),
        'registries:\n  default: https://global.example.com/\n',
      )
      await fs.writeFile(
        path.join(projectDir, 'pnpm-workspace.yaml'),
        'registries:\n  "@myorg": https://workspace-myorg.example.com/\n',
      )

      expect(await pnpmApi.getPnpmWorkspaceRegistries()).toStrictEqual({
        default: 'https://global.example.com/',
        scoped: { '@myorg': 'https://workspace-myorg.example.com/' },
      })
    })
  })
})
