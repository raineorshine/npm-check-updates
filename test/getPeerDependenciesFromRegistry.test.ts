import { chalkInit } from '../src/lib/chalk'
import getPeerDependenciesFromRegistry from '../src/lib/getPeerDependenciesFromRegistry'
import { silenceProgressBar } from './helpers/silenceProgressBar'

describe('getPeerDependenciesFromRegistry', function () {
  let pb: ReturnType<typeof silenceProgressBar>
  beforeEach(() => {
    chalkInit()
    pb = silenceProgressBar()
  })
  afterEach(() => {
    pb.mockRestore()
  })

  it('single package', async () => {
    const data = await getPeerDependenciesFromRegistry({ 'ncu-test-peer': '1.0' }, { cwd: sandbox.cwd })
    data.should.deep.equal({
      'ncu-test-peer': {
        'ncu-test-return-version': '1.x',
      },
    })
  })

  it('single package empty', async () => {
    const data = await getPeerDependenciesFromRegistry({ 'ncu-test-return-version': '1.0' }, { cwd: sandbox.cwd })
    data.should.deep.equal({ 'ncu-test-return-version': {} })
  })

  it('multiple packages', async () => {
    const data = await getPeerDependenciesFromRegistry(
      {
        'ncu-test-return-version': '1.0.0',
        'ncu-test-peer': '1.0.0',
      },
      { cwd: sandbox.cwd },
    )
    data.should.deep.equal({
      'ncu-test-return-version': {},
      'ncu-test-peer': {
        'ncu-test-return-version': '1.x',
      },
    })
  })
})
