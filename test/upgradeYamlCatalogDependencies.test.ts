import { updateYamlCatalogDependencies } from '../src/lib/upgradeYamlCatalogDependencies'
import chaiSetup from './helpers/chaiSetup'

const should = chaiSetup()

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

    should.exist(updated)
    updated!.should.equal(`nodeLinker: node-modules

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

    should.exist(updated)
    updated!.should.equal(`nodeLinker: node-modules

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

    should.exist(updated)
    updated!.should.equal(yaml)
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

    should.equal(updated, null)
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

    should.equal(updated, null)
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

    should.exist(updated)
    updated!.should.equal(`catalog:
  react:    19.0.0 # keep this
  react-dom: 18.3.1
`)
  })
})
