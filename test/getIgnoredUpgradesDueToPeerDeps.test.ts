import getIgnoredUpgradesDueToPeerDeps from '../src/lib/getIgnoredUpgradesDueToPeerDeps'
import chaiSetup from './helpers/chaiSetup'

chaiSetup()

describe('getIgnoredUpgradesDueToPeerDeps', function () {
  it('ncu-test-peer-update', async () => {
    const data = await getIgnoredUpgradesDueToPeerDeps(
      {
        'ncu-test-return-version': '1.0.0',
        'ncu-test-peer': '1.0.0',
      },
      {
        'ncu-test-return-version': '1.1.0',
        'ncu-test-peer': '1.1.0',
      },
      {
        'ncu-test-peer': {
          'ncu-test-return-version': '1.1.x',
        },
      },
      {},
    )
    data.should.deep.equal({
      'ncu-test-return-version': {
        from: '1.0.0',
        to: '2.0.0',
        reason: {
          'ncu-test-peer': '1.1.x',
        },
      },
    })
  })
  it('ignored peer after upgrade', async () => {
    const data = await getIgnoredUpgradesDueToPeerDeps(
      {
        '@vitest/ui': '1.3.1',
        vitest: '1.3.1',
        eslint: '8.57.0',
        'eslint-plugin-import': '2.29.1',
        'eslint-plugin-unused-imports': '^3',
      },
      {
        '@vitest/ui': '1.6.0',
        vitest: '1.6.0',
      },
      {
        '@vitest/ui': {
          vitest: '1.6.0',
        },
        vitest: {
          jsdom: '*',
          'happy-dom': '*',
          '@vitest/ui': '1.6.0',
          '@types/node': '^18.0.0 || >=20.0.0',
          '@vitest/browser': '1.6.0',
          '@edge-runtime/vm': '*',
        },
        eslint: {},
        'eslint-plugin-import': {
          eslint: '^2 || ^3 || ^4 || ^5 || ^6 || ^7.2.0 || ^8',
        },
        'eslint-plugin-unused-imports': {
          '@typescript-eslint/eslint-plugin': '^6.0.0',
          eslint: '^8.0.0',
        },
      },
      {
        target: packageName => {
          return packageName === 'eslint-plugin-unused-imports' ? 'latest' : 'minor'
        },
      },
    )
    data.should.deep.equal({
      'eslint-plugin-unused-imports': {
        from: '^3',
        reason: {
          'eslint-plugin-unused-imports': 'eslint 9',
        },
        to: '^4',
      },
    })
  })
})
