import { chalkInit } from '../src/lib/chalk'
import getPeerDependenciesFromRegistry from '../src/lib/getPeerDependenciesFromRegistry'
import chaiSetup from './helpers/chaiSetup'

chaiSetup()

describe('getPeerDependenciesFromRegistry', function () {
  it('single package', async () => {
    await chalkInit()
    const data = await getPeerDependenciesFromRegistry({ 'ncu-test-peer': '1.0' }, {})
    data.should.deep.equal({
      'ncu-test-peer': {
        'ncu-test-return-version': '1.x',
      },
    })
  })

  it('single package with range', async () => {
    await chalkInit()
    const data = await getPeerDependenciesFromRegistry({ 'eslint-plugin-unused-imports': '^4' }, {})
    data.should.deep.equal({
      'eslint-plugin-unused-imports': {
        '@typescript-eslint/eslint-plugin': '^8.0.0-0',
        eslint: '^9.0.0',
      },
    })
  })

  it('single package empty', async () => {
    await chalkInit()
    const data = await getPeerDependenciesFromRegistry({ 'ncu-test-return-version': '1.0' }, {})
    data.should.deep.equal({ 'ncu-test-return-version': {} })
  })

  it('multiple packages', async () => {
    await chalkInit()
    const data = await getPeerDependenciesFromRegistry(
      {
        'ncu-test-return-version': '1.0.0',
        'ncu-test-peer': '1.0.0',
      },
      {},
    )
    data.should.deep.equal({
      'ncu-test-return-version': {},
      'ncu-test-peer': {
        'ncu-test-return-version': '1.x',
      },
    })
  })
})
