import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { npmApi } from '../../src/package-managers/npm.ts'
import * as pnpm from '../../src/package-managers/pnpm.ts'
import usePnpmConfigDirs from '../helpers/pnpmConfigDirs.ts'

describe('pnpm registries', () => {
  const dirs = usePnpmConfigDirs()

  beforeEach(() => {
    // The ambient npm config outranks pnpm-workspace.yaml, so a developer with npm_config_registry set or a
    // registry in their user .npmrc would otherwise see these fail while CI, which has neither, passes.
    vi.spyOn(npmApi, 'findNpmConfig').mockReturnValue({})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // .invalid never resolves, so the host in the fetch error identifies the registry that was used
  it('fetches from registries.default in pnpm-workspace.yaml', async () => {
    await dirs.writeWorkspace('registries:\n  default: https://default-registry.invalid/\n')

    await expect(pnpm.latest('ncu-test-v2', '1.0.0', { cwd: dirs.projectDir, retry: 0 })).rejects.toThrow(
      /default-registry\.invalid/,
    )
  })

  it('fetches scoped packages from their scoped registry', async () => {
    await dirs.writeWorkspace(
      'registries:\n  default: https://default-registry.invalid/\n  "@ncu-scope": https://scoped-registry.invalid/\n',
    )

    await expect(pnpm.latest('@ncu-scope/pkg', '1.0.0', { cwd: dirs.projectDir, retry: 0 })).rejects.toThrow(
      /scoped-registry\.invalid/,
    )
  })

  it('fetches from registries in pnpm global config.yaml when pnpm-workspace.yaml is absent', async () => {
    await dirs.writeGlobalConfig('config.yaml', 'registries:\n  default: https://global-registry.invalid/\n')

    await expect(pnpm.latest('ncu-test-v2', '1.0.0', { cwd: dirs.projectDir, retry: 0 })).rejects.toThrow(
      /global-registry\.invalid/,
    )
  })

  // pnpm resolves registries above every .npmrc, but ncu keeps the project/cwd .npmrc on top, as it does for yarn
  it('is overridden by the registry in the .npmrc in the cwd', async () => {
    await dirs.writeWorkspace('registries:\n  default: https://default-registry.invalid/\n')
    await fs.writeFile(path.join(dirs.projectDir, '.npmrc'), 'registry=https://npmrc-registry.invalid/\n')

    await expect(pnpm.latest('ncu-test-v2', '1.0.0', { cwd: dirs.projectDir, retry: 0 })).rejects.toThrow(
      /npmrc-registry\.invalid/,
    )
  })

  // the .npmrc next to pnpm-workspace.yaml is merged below the registries setting, matching pnpm
  it('overrides the registry in the .npmrc next to pnpm-workspace.yaml', async () => {
    await dirs.writeWorkspace('registries:\n  default: https://default-registry.invalid/\n')
    await fs.writeFile(path.join(dirs.projectDir, '.npmrc'), 'registry=https://npmrc-registry.invalid/\n')
    const nested = path.join(dirs.projectDir, 'packages', 'sub')
    await fs.mkdir(nested, { recursive: true })

    await expect(pnpm.latest('ncu-test-v2', '1.0.0', { cwd: nested, retry: 0 })).rejects.toThrow(
      /default-registry\.invalid/,
    )
  })

  it('keeps using the registry when a fetch is retried', async () => {
    await dirs.writeWorkspace('registries:\n  default: https://default-registry.invalid/\n')

    await expect(pnpm.latest('ncu-test-v2', '1.0.0', { cwd: dirs.projectDir, retry: 2 })).rejects.toThrow(
      /default-registry\.invalid/,
    )
  })

  it('prefers an explicitly specified registry over pnpm-workspace.yaml', async () => {
    await dirs.writeWorkspace('registries:\n  default: https://default-registry.invalid/\n')

    await expect(
      pnpm.latest('ncu-test-v2', '1.0.0', {
        cwd: dirs.projectDir,
        registry: 'https://explicit-registry.invalid/',
        retry: 0,
      }),
    ).rejects.toThrow(/explicit-registry\.invalid/)
  })

  it('fetches dist-tags from the pnpm registry', async () => {
    await dirs.writeWorkspace('registries:\n  default: https://default-registry.invalid/\n')

    await expect(pnpm.getDistTags('ncu-test-v2', { cwd: dirs.projectDir, retry: 0 })).rejects.toThrow(
      /default-registry\.invalid/,
    )
  })

  it('fetches engines from the pnpm registry', async () => {
    await dirs.writeWorkspace('registries:\n  default: https://default-registry.invalid/\n')

    await expect(pnpm.getEngines('ncu-test-v2', '1.0.0', { cwd: dirs.projectDir })).rejects.toThrow(
      /default-registry\.invalid/,
    )
  })

  it('fetches package authors from the pnpm registry', async () => {
    await dirs.writeWorkspace('registries:\n  default: https://default-registry.invalid/\n')

    await expect(pnpm.packageAuthorChanged('ncu-test-v2', '1.0.0', '2.0.0', { cwd: dirs.projectDir })).rejects.toThrow(
      /default-registry\.invalid/,
    )
  })

  // The registries setting is merged as npmConfigLocal, which sits above the ambient npm config. Every code path
  // must agree on that, otherwise a project resolves versions and engines from two different registries.
  describe('with an ambient npm registry', () => {
    beforeEach(() => {
      vi.spyOn(npmApi, 'findNpmConfig').mockReturnValue({ registry: 'https://npm-config-registry.invalid/' })
    })

    it('resolves versions, dist-tags, engines and authors from the pnpm registry', async () => {
      await dirs.writeWorkspace('registries:\n  default: https://pnpm-registry.invalid/\n')
      const options = { cwd: dirs.projectDir, retry: 0 }

      await expect(pnpm.latest('ncu-test-v2', '1.0.0', options)).rejects.toThrow(/pnpm-registry\.invalid/)
      await expect(pnpm.getDistTags('ncu-test-v2', options)).rejects.toThrow(/pnpm-registry\.invalid/)
      await expect(pnpm.getEngines('ncu-test-v2', '1.0.0', options)).rejects.toThrow(/pnpm-registry\.invalid/)
      await expect(pnpm.packageAuthorChanged('ncu-test-v2', '1.0.0', '2.0.0', options)).rejects.toThrow(
        /pnpm-registry\.invalid/,
      )
    })

    // npm config set registry leaves a registry= in the user .npmrc, which used to silently win over pnpm's own config
    it('resolves the plain registry setting above the ambient npm config', async () => {
      await dirs.writeWorkspace('registry: https://pnpm-registry.invalid/\n')

      await expect(pnpm.latest('ncu-test-v2', '1.0.0', { cwd: dirs.projectDir, retry: 0 })).rejects.toThrow(
        /pnpm-registry\.invalid/,
      )
    })
  })
})
