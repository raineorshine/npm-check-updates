import { chalkInit } from '../src/lib/chalk'
import getEnginesNodeFromRegistry from '../src/lib/getEnginesNodeFromRegistry'
import { type MockedVersions } from '../src/types/MockedVersions'
import { silenceProgressBar } from './helpers/silenceProgressBar'
import { stubFetchPartialPackument } from './helpers/stubVersions'

describe('getEnginesNodeFromRegistry', function () {
  let pb: ReturnType<typeof silenceProgressBar>
  let versionStub: { mockRestore: () => void }
  beforeEach(() => {
    chalkInit()
    pb = silenceProgressBar()
    versionStub = stubFetchPartialPackument({
      del: {
        version: '8.0.1',
        engines: { node: '>=0.10.0' },
        versions: {
          '8.0.1': { version: '8.0.1', engines: { node: '>=18.0.0' } },
          '2.0.0': { name: 'del', engines: { node: '>=0.10.0' } },
        },
      },
      'ncu-test-return-version': { version: '1.0.0', engines: {} },
      'ncu-test-peer': { version: '1.0.0', engines: {} },
    } as MockedVersions)
  })
  afterEach(() => {
    pb.mockRestore()
    versionStub?.mockRestore()
  })

  it('single package', async () => {
    const data = await getEnginesNodeFromRegistry({ del: '2.0.0' }, {})
    data.should.deep.equal({
      del: '>=0.10.0',
    })
  })

  it('single package empty', async () => {
    const data = await getEnginesNodeFromRegistry({ 'ncu-test-return-version': '1.0.0' }, {})
    data.should.deep.equal({ 'ncu-test-return-version': undefined })
  })

  it('multiple packages', async () => {
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
