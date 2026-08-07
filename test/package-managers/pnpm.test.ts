import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pnpmApi } from '../../src/package-managers/pnpm.ts'
import removeDir from '../helpers/removeDir.ts'

describe('pnpm', () => {
  describe('getPnpmWorkspaceMinimumReleaseAge', () => {
    let tempDir: string
    let xdgDir: string
    let originalCwd: string
    const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

    beforeEach(async () => {
      originalCwd = process.cwd()
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-test-pnpm-'))
      xdgDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-test-pnpm-xdg-'))
      await fs.mkdir(path.join(xdgDir, 'pnpm'), { recursive: true })
      process.env.XDG_CONFIG_HOME = xdgDir
    })

    afterEach(async () => {
      process.chdir(originalCwd)
      await removeDir(tempDir)
      await removeDir(xdgDir)
      if (originalXdgConfigHome === undefined) {
        delete process.env.XDG_CONFIG_HOME
      } else {
        process.env.XDG_CONFIG_HOME = originalXdgConfigHome
      }
    })

    /** Writes a pnpm-workspace.yaml into the temp dir and switches cwd to it. */
    async function writeWorkspace(content: string): Promise<void> {
      await fs.writeFile(path.join(tempDir, 'pnpm-workspace.yaml'), content)
      process.chdir(tempDir)
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
  })
})
