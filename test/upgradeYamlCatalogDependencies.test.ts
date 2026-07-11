import { describe, expect, it } from 'vitest'
import { updateYamlCatalogDependencies } from '../src/lib/upgradeYamlCatalogDependencies.ts'

describe('updateYamlCatalogDependencies', () => {
  it('updates a catalog dependency while preserving quotes', () => {
    const yaml = `nodeLinker: node-modules

catalog:
  react: '18.3.1'
`

    const updated = updateYamlCatalogDependencies({
      fileContent: yaml,
      upgrade: { path: ['catalog', 'react'], newValue: '19.0.0' },
    })

    expect(updated).not.toBeNull()
    expect(updated).toBe(`nodeLinker: node-modules

catalog:
  react: '19.0.0'
`)
  })

  it('updates a named catalog dependency', () => {
    const yaml = `nodeLinker: node-modules

catalogs:
  react17:
    react: 17.0.0
`

    const updated = updateYamlCatalogDependencies({
      fileContent: yaml,
      upgrade: { path: ['catalogs', 'react17', 'react'], newValue: '19.0.0' },
    })

    expect(updated).not.toBeNull()
    expect(updated).toBe(`nodeLinker: node-modules

catalogs:
  react17:
    react: 19.0.0
`)
  })

  it('returns the original content if the version already matches', () => {
    const yaml = `catalog:
  react: 19.0.0
`

    const updated = updateYamlCatalogDependencies({
      fileContent: yaml,
      upgrade: { path: ['catalog', 'react'], newValue: '19.0.0' },
    })

    expect(updated).not.toBeNull()
    expect(updated).toBe(yaml)
  })

  it('returns null when the dependency is not present in the target catalog', () => {
    const yaml = `catalogs:
  react18:
    react: 18.3.1
`

    const updated = updateYamlCatalogDependencies({
      fileContent: yaml,
      upgrade: { path: ['catalogs', 'react17', 'react'], newValue: '19.0.0' },
    })

    expect(updated).toBeNull()
  })

  it('returns null when the dependency value is an alias', () => {
    const yaml = `__deps:
  react: &react 18.3.1

catalog:
  react: *react
`

    const updated = updateYamlCatalogDependencies({
      fileContent: yaml,
      upgrade: { path: ['catalog', 'react'], newValue: '19.0.0' },
    })

    expect(updated).toBeNull()
  })

  it('preserves inline comments and spacing', () => {
    const yaml = `catalog:
  react:    18.3.1 # keep this
  react-dom: 18.3.1
`

    const updated = updateYamlCatalogDependencies({
      fileContent: yaml,
      upgrade: { path: ['catalog', 'react'], newValue: '19.0.0' },
    })

    expect(updated).not.toBeNull()
    expect(updated).toBe(`catalog:
  react:    19.0.0 # keep this
  react-dom: 18.3.1
`)
  })

  it('preserves leading blank lines', () => {
    const yaml = `

packages:
  - 'packages/**'

catalog:
  react: 18.3.1
`

    const updated = updateYamlCatalogDependencies({
      fileContent: yaml,
      upgrade: { path: ['catalog', 'react'], newValue: '19.0.0' },
    })

    expect(updated).toBe(`

packages:
  - 'packages/**'

catalog:
  react: 19.0.0
`)
  })

  it('preserves a leading top-of-file comment', () => {
    const yaml = `# pnpm workspace config
catalog:
  react: 18.3.1
`

    const updated = updateYamlCatalogDependencies({
      fileContent: yaml,
      upgrade: { path: ['catalog', 'react'], newValue: '19.0.0' },
    })

    expect(updated).toBe(`# pnpm workspace config
catalog:
  react: 19.0.0
`)
  })

  it('throws on invalid yaml syntax', () => {
    const yaml = `catalog:
  react: [18.3.1
`

    expect(() =>
      updateYamlCatalogDependencies({
        fileContent: yaml,
        upgrade: { path: ['catalog', 'react'], newValue: '19.0.0' },
      }),
    ).toThrow('Invalid YAML syntax')
  })

  it('reports invalid yaml syntax via programError when options are provided', () => {
    const yaml = `catalog:
  react: [18.3.1
`

    expect(() =>
      updateYamlCatalogDependencies({
        fileContent: yaml,
        upgrade: { path: ['catalog', 'react'], newValue: '19.0.0' },
        options: {},
      }),
    ).toThrow('Invalid YAML syntax')
  })

  it('returns null when the upgrade path is not a catalog', () => {
    const yaml = `catalog:
  react: 18.3.1
`

    const updated = updateYamlCatalogDependencies({
      fileContent: yaml,
      upgrade: { path: ['dependencies'], newValue: '19.0.0' },
    })

    expect(updated).toBeNull()
  })

  it('returns null when the dependency key is missing from an existing catalog', () => {
    const yaml = `catalog:
  react: 18.3.1
`

    const updated = updateYamlCatalogDependencies({
      fileContent: yaml,
      upgrade: { path: ['catalog', 'vue'], newValue: '3.0.0' },
    })

    expect(updated).toBeNull()
  })

  it('returns null when the catalog fails schema validation', () => {
    const yaml = `catalog: not-a-map
`

    const updated = updateYamlCatalogDependencies({
      fileContent: yaml,
      upgrade: { path: ['catalog', 'react'], newValue: '19.0.0' },
    })

    expect(updated).toBeNull()
  })
})
