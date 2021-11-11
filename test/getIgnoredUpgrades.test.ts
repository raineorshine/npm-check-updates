import chai from 'chai'
import getIgnoredUpgrades from '../src/lib/getIgnoredUpgrades'

chai.should()
process.env.NCU_TESTS = 'true'

describe('getIgnoredUpgrades', function () {
  it('ncu-test-peer-update', async () => {
    const data = await getIgnoredUpgrades({
      'ncu-test-return-version': '1.0.0',
      'ncu-test-peer': '1.0.0',
    }, {
      'ncu-test-return-version': '1.1.0',
      'ncu-test-peer': '1.1.0',
    }, {
      'ncu-test-peer': {
        'ncu-test-return-version': '1.1.x'
      }
    }, {})
    data.should.deep.equal({
      'ncu-test-return-version': {
        from: '1.0.0',
        to: '2.0.0',
        reason: {
          'ncu-test-peer': '1.1.x'
        }
      }
    })
  })
})
