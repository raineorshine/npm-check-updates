import chai from 'chai'
import ncu from '../../../src/index'

chai.should()

describe('staticRegistry', function () {
  it('upgrade to the version specified in the static registry file', async () => {
    const registry = './test/package-managers/staticRegistry/staticRegistry.json'

    const output = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-v2': '1.0.0',
        },
      },
      packageManager: 'staticRegistry',
      registry,
    })

    output!.should.deep.equal({
      'ncu-test-v2': '99.9.9',
    })
  })

  it('ignore dependencies that are not in the static registry', async () => {
    const registry = './test/package-managers/staticRegistry/staticRegistry.json'

    const output = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.0.0',
        },
      },
      packageManager: 'staticRegistry',
      registry,
    })

    output!.should.deep.equal({})
  })

  it('fetch static registry from a url', async () => {
    const output = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.0.0',
        },
      },
      packageManager: 'staticRegistry',
      registry:
        // https://gist.github.com/raineorshine/0802d7388c69193bed49c5ee6ab611b9
        'https://gist.githubusercontent.com/raineorshine/0802d7388c69193bed49c5ee6ab611b9/raw/6f22bfdf19b7596089e56e0b14cd66d077f049d5/staticRegistry.json',
    })

    output!.should.deep.equal({})
  })
})
