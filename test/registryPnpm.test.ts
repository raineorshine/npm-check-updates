import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as pnpm from '../src/package-managers/pnpm.ts'
import removeDir from './helpers/removeDir.ts'

describe('pnpm registries', () => {
  let originalCwd: string
  let originalXdg: string | undefined
  let projectDir: string
  let xdgDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    originalXdg = process.env.XDG_CONFIG_HOME
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-pnpm-registries-'))
    // an isolated XDG_CONFIG_HOME so pnpm's global config resolves to a temp directory
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

  /** Writes a pnpm-workspace.yaml into the project dir. */
  const writeWorkspace = (content: string): Promise<void> =>
    fs.writeFile(path.join(projectDir, 'pnpm-workspace.yaml'), content)

  // .invalid never resolves, so the host in the fetch error identifies the registry that was used
  it('fetches from registries.default in pnpm-workspace.yaml', async () => {
    await writeWorkspace('registries:\n  default: https://default-registry.invalid/\n')

    await expect(pnpm.latest('ncu-test-v2', '1.0.0', { cwd: projectDir, retry: 0 })).rejects.toThrow(
      /default-registry\.invalid/,
    )
  })

  it('fetches scoped packages from their scoped registry', async () => {
    await writeWorkspace(
      'registries:\n  default: https://default-registry.invalid/\n  "@ncu-scope": https://scoped-registry.invalid/\n',
    )

    await expect(pnpm.latest('@ncu-scope/pkg', '1.0.0', { cwd: projectDir, retry: 0 })).rejects.toThrow(
      /scoped-registry\.invalid/,
    )
  })

  it('fetches from registries in pnpm global config.yaml when pnpm-workspace.yaml is absent', async () => {
    await fs.writeFile(
      path.join(xdgDir, 'pnpm', 'config.yaml'),
      'registries:\n  default: https://global-registry.invalid/\n',
    )

    await expect(pnpm.latest('ncu-test-v2', '1.0.0', { cwd: projectDir, retry: 0 })).rejects.toThrow(
      /global-registry\.invalid/,
    )
  })

  // pnpm resolves registries above .npmrc, but ncu merges the workspace config below the npmrc layers
  it('is overridden by the registry in .npmrc', async () => {
    await writeWorkspace('registries:\n  default: https://default-registry.invalid/\n')
    await fs.writeFile(path.join(projectDir, '.npmrc'), 'registry=https://npmrc-registry.invalid/\n')

    await expect(pnpm.latest('ncu-test-v2', '1.0.0', { cwd: projectDir, retry: 0 })).rejects.toThrow(
      /npmrc-registry\.invalid/,
    )
  })

  it('keeps using the registry when a fetch is retried', async () => {
    await writeWorkspace('registries:\n  default: https://default-registry.invalid/\n')

    await expect(pnpm.latest('ncu-test-v2', '1.0.0', { cwd: projectDir, retry: 2 })).rejects.toThrow(
      /default-registry\.invalid/,
    )
  })

  it('prefers an explicitly specified registry over pnpm-workspace.yaml', async () => {
    await writeWorkspace('registries:\n  default: https://default-registry.invalid/\n')

    await expect(
      pnpm.latest('ncu-test-v2', '1.0.0', {
        cwd: projectDir,
        registry: 'https://explicit-registry.invalid/',
        retry: 0,
      }),
    ).rejects.toThrow(/explicit-registry\.invalid/)
  })
})
