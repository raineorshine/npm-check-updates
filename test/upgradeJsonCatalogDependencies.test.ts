import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { upgradeJsonCatalogDependencies } from '../src/lib/upgradeJsonCatalogDependencies.ts'

describe('upgradeJsonCatalogDependencies', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  /** Writes a package.json to the temp dir and returns its path. */
  const writePkg = async (data: unknown): Promise<string> => {
    const file = path.join(tempDir, 'package.json')
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8')
    return file
  }

  it('upgrade top-level catalog and catalogs entries', async () => {
    const file = await writePkg({
      catalog: { 'ncu-test-v2': '1.0.0' },
      catalogs: { test: { 'ncu-test-tag': '1.0.0' } },
    })
    const result = await upgradeJsonCatalogDependencies(
      file,
      { 'ncu-test-v2': '1.0.0', 'ncu-test-tag': '1.0.0' },
      { 'ncu-test-v2': '2.0.0', 'ncu-test-tag': '1.1.0' },
    )
    expect(JSON.parse(result)).toStrictEqual({
      catalog: { 'ncu-test-v2': '2.0.0' },
      catalogs: { test: { 'ncu-test-tag': '1.1.0' } },
    })
  })

  it('upgrade catalogs nested under workspaces', async () => {
    const file = await writePkg({
      workspaces: { packages: ['packages/**'], catalog: { 'ncu-test-v2': '1.0.0' } },
    })
    const result = await upgradeJsonCatalogDependencies(file, { 'ncu-test-v2': '1.0.0' }, { 'ncu-test-v2': '2.0.0' })
    expect(JSON.parse(result)).toStrictEqual({
      workspaces: { packages: ['packages/**'], catalog: { 'ncu-test-v2': '2.0.0' } },
    })
  })

  it('upgrade a dependency that appears in both a catalog and a dependency section', async () => {
    const file = await writePkg({
      dependencies: { 'ncu-test-v2': '1.0.0' },
      catalog: { 'ncu-test-v2': '1.0.0' },
    })
    const result = await upgradeJsonCatalogDependencies(file, { 'ncu-test-v2': '1.0.0' }, { 'ncu-test-v2': '2.0.0' })
    expect(JSON.parse(result)).toStrictEqual({
      dependencies: { 'ncu-test-v2': '2.0.0' },
      catalog: { 'ncu-test-v2': '2.0.0' },
    })
  })

  it('leave entries whose version does not match the current spec', async () => {
    const file = await writePkg({ catalog: { 'ncu-test-v2': '1.5.0' } })
    const result = await upgradeJsonCatalogDependencies(file, { 'ncu-test-v2': '1.0.0' }, { 'ncu-test-v2': '2.0.0' })
    expect(JSON.parse(result)).toStrictEqual({ catalog: { 'ncu-test-v2': '1.5.0' } })
  })
})
