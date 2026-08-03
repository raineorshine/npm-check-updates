import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pnpmApi } from '../../src/package-managers/pnpm.ts'
import removeDir from '../helpers/removeDir.ts'

describe('pnpm', () => {
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
  })

  describe('getPnpmWorkspaceMinimumReleaseAge', () => {
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
