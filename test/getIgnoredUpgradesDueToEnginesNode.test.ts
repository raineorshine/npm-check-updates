import getIgnoredUpgradesDueToEnginesNode from '../src/lib/getIgnoredUpgradesDueToEnginesNode'
import chaiSetup from './helpers/chaiSetup'

const MOCK_ESLINT_VERSION = '999.0.0'
const MOCK_DEL_VERSION = '999.0.1'

chaiSetup()

/* This test needs to be rewritten because it is run against live data that affects the outcome of the test. The eslint and del versions were mocked in order to prevent this, but now the latest del.enginesNode is >=18 which fails the test. This data should either be mocked or the target packages should be entirely replaced by packages under our control. */
describe.skip('getIgnoredUpgradesDueToEnginesNode', function () {
  it('ncu-test-peer-update', async () => {
    const data = await getIgnoredUpgradesDueToEnginesNode(
      {
        'ncu-test-return-version': '1.0.0',
        'ncu-test-peer': '^1.0.0',
        del: '2.2.2',
        '@typescript-eslint/eslint-plugin': '^7.18.0',
      },
      {
        'ncu-test-return-version': '2.0.0',
        'ncu-test-peer': '^1.1.0',
        del: '2.2.2',
        '@typescript-eslint/eslint-plugin': '^8.1.0',
      },
      {
        enginesNode: true,
        nodeEngineVersion: `^0.10.0`,
      },
    )

    // override 'to' fields with mock versions since this is live npm data that will change
    data['@typescript-eslint/eslint-plugin'].to = MOCK_ESLINT_VERSION
    data.del.to = MOCK_DEL_VERSION

    data.should.deep.equal({
      '@typescript-eslint/eslint-plugin': {
        enginesNode: '^18.18.0 || ^20.9.0 || >=21.1.0',
        from: '^7.18.0',
        to: MOCK_ESLINT_VERSION,
      },
      del: {
        enginesNode: '>=14.16',
        from: '2.2.2',
        to: MOCK_DEL_VERSION,
      },
    })
  })
})
