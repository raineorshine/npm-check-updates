import { chalkInit } from '../src/lib/chalk'
import getEnginesNodeFromRegistry from '../src/lib/getEnginesNodeFromRegistry'
import chaiSetup from './helpers/chaiSetup'

chaiSetup()

describe('getEnginesNodeFromRegistry', function () {
  it('single package', async () => {
    await chalkInit()
    const data = await getEnginesNodeFromRegistry({ del: '2.0.0' }, {})
    data.should.deep.equal({
      del: '>=0.10.0',
    })
  })

  it('single package empty', async () => {
    await chalkInit()
    const data = await getEnginesNodeFromRegistry({ 'ncu-test-return-version': '1.0' }, {})
    data.should.deep.equal({ 'ncu-test-return-version': undefined })
  })

  it('multiple packages', async () => {
    await chalkInit()
    const data = await getEnginesNodeFromRegistry(
      {
        'ncu-test-return-version': '1.0.0',
        'ncu-test-peer': '1.0.0',
        del: '2.0.0',
      },
      {},
    )
    data.should.deep.equal({
      'ncu-test-return-version': undefined,
      'ncu-test-peer': undefined,
      del: '>=0.10.0',
    })
  })
})
