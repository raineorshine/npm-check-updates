import getIgnoredUpgradesDueToEnginesNode from '../src/lib/getIgnoredUpgradesDueToEnginesNode'
import chaiSetup from './helpers/chaiSetup'

chaiSetup()

describe('getIgnoredUpgradesDueToEnginesNode', function () {
  it('ncu-test-peer-update', async () => {
    const data = await getIgnoredUpgradesDueToEnginesNode(
      {
        'ncu-test-return-version': '1.0.0',
        'ncu-test-peer': '1.0.0',
        del: '2.2.2',
      },
      {
        'ncu-test-return-version': '2.0.0',
        'ncu-test-peer': '1.1.0',
        del: '2.2.2',
      },
      {
        enginesNode: true,
        nodeEngineVersion: `^0.10.0`,
      },
    )
    data.should.deep.equal({
      del: {
        enginesNode: '>=14.16',
        from: '2.2.2',
        to: '7.1.0',
      },
    })
  })
})
