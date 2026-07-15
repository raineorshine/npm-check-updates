import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import upgradePackageData from '../src/lib/upgradePackageData.ts'
import { type Options } from '../src/types/Options.ts'
import removeDir from './helpers/removeDir.ts'

describe('upgradePackageData', () => {
  describe('catalog files', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-test-upd-'))
    })

    afterEach(async () => {
      await removeDir(tempDir)
    })

    it('upgrades catalog, catalogs, and nested workspaces catalogs in pnpm-workspace.yaml', async () => {
      const yaml = `catalog:
  react: 18.0.0
catalogs:
  react17:
    react: 17.0.0
workspaces:
  catalog:
    vue: 2.0.0
  catalogs:
    legacy:
      lodash: 3.0.0
`
      const pkgFile = path.join(tempDir, 'pnpm-workspace.yaml')
      await fs.writeFile(pkgFile, yaml)

      const result = await upgradePackageData(
        '',
        { react: '18.0.0', vue: '2.0.0', lodash: '3.0.0' },
        { react: '19.0.0', vue: '3.0.0', lodash: '4.0.0' },
        {},
        pkgFile,
      )

      expect(result).toBe(`catalog:
  react: 19.0.0
catalogs:
  react17:
    react: 19.0.0
workspaces:
  catalog:
    vue: 3.0.0
  catalogs:
    legacy:
      lodash: 4.0.0
`)
    })

    it('upgrades catalog dependencies in a package.json, only where the current version matches', async () => {
      const json = JSON.stringify(
        { name: 'x', catalog: { react: '18.0.0' }, catalogs: { legacy: { react: '17.0.0' } } },
        null,
        2,
      )
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, json)

      const result = await upgradePackageData(json, { react: '18.0.0' }, { react: '19.0.0' }, {}, pkgFile)

      const parsed = JSON.parse(result)
      expect(parsed.catalog.react).toBe('19.0.0')
      // catalogs.legacy.react is 17.0.0, which does not match the current version, so it is left alone
      expect(parsed.catalogs.legacy.react).toBe('17.0.0')
    })

    it('upgrades a synthetic bun catalog file (package.json#catalog)', async () => {
      const json = JSON.stringify({ name: 'x', workspaces: { catalog: { react: '18.0.0' } } }, null, 2)
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, json)

      const result = await upgradePackageData(json, { react: '18.0.0' }, { react: '19.0.0' }, {}, `${pkgFile}#catalog`)

      expect(JSON.parse(result).workspaces.catalog.react).toBe('19.0.0')
    })
  })

  it('upgrade a section written with whitespace before the colon', async () => {
    const pkgData = '{ "dependencies" : { "foo": "1.0.0" } }'
    const result = await upgradePackageData(pkgData, { foo: '1.0.0' }, { foo: '2.0.0' }, {} as Options)
    expect(JSON.parse(result).dependencies.foo).toBe('2.0.0')
  })

  describe('overrides', () => {
    it('upgrade overrides', async () => {
      const pkgData = JSON.stringify({
        dependencies: { foo: '^1.0.0' },
        overrides: { foo: '^1.0.0' },
      })
      const result = await upgradePackageData(pkgData, { foo: '^1.0.0' }, { foo: '^2.0.0' }, {} as Options)
      const parsed = JSON.parse(result)
      expect(parsed.dependencies.foo).toBe('^2.0.0')
      expect(parsed.overrides.foo).toBe('^2.0.0')
    })

    // https://github.com/raineorshine/npm-check-updates/issues/1477
    it('preserve $ override references', async () => {
      const pkgData = JSON.stringify({
        dependencies: { foo: '^1.0.0' },
        overrides: { foo: '$foo' },
      })
      const result = await upgradePackageData(pkgData, { foo: '^1.0.0' }, { foo: '^2.0.0' }, {} as Options)
      const parsed = JSON.parse(result)
      expect(parsed.dependencies.foo).toBe('^2.0.0')
      expect(parsed.overrides.foo).toBe('$foo')
    })

    it('upgrade self override', async () => {
      const pkgData = JSON.stringify({
        dependencies: { foo: '^1.0.0' },
        overrides: { foo: { '.': '^1.0.0', bar: '^1.0.0' } },
      })
      const result = await upgradePackageData(pkgData, { foo: '^1.0.0' }, { foo: '^2.0.0' }, {} as Options)
      const parsed = JSON.parse(result)
      expect(parsed.dependencies.foo).toBe('^2.0.0')
      expect(parsed.overrides.foo['.']).toBe('^2.0.0')
      // sibling override target is a distinct package, so it must be left untouched
      expect(parsed.overrides.foo.bar).toBe('^1.0.0')
    })

    it('do not rewrite a single-character override key that is not "."', async () => {
      const pkgData = JSON.stringify({
        dependencies: { foo: '1.0.0' },
        overrides: { foo: { y: '1.0.0' } },
      })
      const result = await upgradePackageData(pkgData, { foo: '1.0.0' }, { foo: '2.0.0' }, {} as Options)
      const parsed = JSON.parse(result)
      expect(parsed.dependencies.foo).toBe('2.0.0')
      // "y" is a distinct nested override target, not foo itself, so it must be left untouched
      expect(parsed.overrides.foo.y).toBe('1.0.0')
    })

    it('upgrade child override', async () => {
      const pkgData = JSON.stringify({
        dependencies: { foo: '^1.0.0' },
        overrides: { bar: { foo: '^1.0.0' } },
      })
      const result = await upgradePackageData(pkgData, { foo: '^1.0.0' }, { foo: '^2.0.0' }, {} as Options)
      const parsed = JSON.parse(result)
      expect(parsed.dependencies.foo).toBe('^2.0.0')
      expect(parsed.overrides.bar.foo).toBe('^2.0.0')
    })

    it('upgrade nested override', async () => {
      const pkgData = JSON.stringify({
        dependencies: { foo: '^1.0.0' },
        overrides: { bar: { baz: { foo: '^1.0.0' } } },
      })
      const result = await upgradePackageData(pkgData, { foo: '^1.0.0' }, { foo: '^2.0.0' }, {} as Options)
      const parsed = JSON.parse(result)
      expect(parsed.dependencies.foo).toBe('^2.0.0')
      expect(parsed.overrides.bar.baz.foo).toBe('^2.0.0')
    })

    it('upgrade an override that follows a nested override object', async () => {
      const pkgData = JSON.stringify({
        dependencies: { foo: '^1.0.0', tag: '^1.0.0' },
        overrides: { tag: { '.': '^1.0.0' }, foo: '^1.0.0' },
      })
      const result = await upgradePackageData(
        pkgData,
        { foo: '^1.0.0', tag: '^1.0.0' },
        { foo: '^2.0.0', tag: '^2.0.0' },
        {} as Options,
      )
      const parsed = JSON.parse(result)
      expect(parsed.dependencies.foo).toBe('^2.0.0')
      expect(parsed.dependencies.tag).toBe('^2.0.0')
      expect(parsed.overrides.tag['.']).toBe('^2.0.0')
      expect(parsed.overrides.foo).toBe('^2.0.0')
    })

    it('upgrade a deeply nested override object', async () => {
      const pkgData = JSON.stringify({
        dependencies: { foo: '^1.0.0' },
        overrides: { bar: { baz: { foo: { '.': '^1.0.0' } } } },
      })
      const result = await upgradePackageData(pkgData, { foo: '^1.0.0' }, { foo: '^2.0.0' }, {} as Options)
      const parsed = JSON.parse(result)
      expect(parsed.dependencies.foo).toBe('^2.0.0')
      expect(parsed.overrides.bar.baz.foo['.']).toBe('^2.0.0')
    })
  })
})
