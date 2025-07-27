import getIgnoredUpgradesDueToPeerDeps from '../src/lib/getIgnoredUpgradesDueToPeerDeps'
import { Packument } from '../src/types/Packument'
import chaiSetup from './helpers/chaiSetup'
import stubVersions from './helpers/stubVersions'

chaiSetup()

describe('getIgnoredUpgradesDueToPeerDeps', function () {
  it('ncu-test-peer-update', async () => {
    const stub = stubVersions({
      'ncu-test-return-version': '2.0.0',
      'ncu-test-peer': '1.1.0',
    })
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
    stub.restore()
  })
  it('ignored peer after upgrade', async () => {
    const stub = stubVersions({
      '@vitest/ui': {
        version: '1.6.0',
        versions: {
          '1.3.1': {
            version: '1.3.1',
          } as Packument,
          '1.6.0': {
            version: '1.6.0',
          } as Packument,
        },
      },
      vitest: {
        version: '1.6.0',
        versions: {
          '1.3.1': {
            version: '1.3.1',
          } as Packument,
          '1.6.0': {
            version: '1.6.0',
          } as Packument,
        },
      },
      eslint: {
        version: '9.0.0',
        versions: {
          '8.57.0': {
            version: '8.57.0',
          } as Packument,
          '9.0.0': {
            version: '9.0.0',
          } as Packument,
        },
      },
      'eslint-plugin-import': {
        version: '2.29.1',
        versions: {
          '2.29.1': {
            version: '2.29.1',
          } as Packument,
        },
      },
      'eslint-plugin-unused-imports': {
        version: '4.0.0',
        versions: {
          '4.0.0': {
            version: '4.0.0',
          } as Packument,
          '3.0.0': {
            version: '3.0.0',
          } as Packument,
        },
      },
    })
    const data = await getIgnoredUpgradesDueToPeerDeps(
      {
        '@vitest/ui': '1.3.1',
        vitest: '1.3.1',
        eslint: '8.57.0',
        'eslint-plugin-import': '2.29.1',
        'eslint-plugin-unused-imports': '3.0.0',
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
          return packageName === 'eslint-plugin-unused-imports' ? 'greatest' : 'minor'
        },
      },
    )
    data.should.deep.equal({
      'eslint-plugin-unused-imports': {
        from: '3.0.0',
        reason: {
          'eslint-plugin-unused-imports': 'eslint 9',
        },
        to: '4.0.0',
      },
    })
    stub.restore()
  })
})
