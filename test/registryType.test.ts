import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
import ncu from '../src/index'

const __dirname = dirname(fileURLToPath(import.meta.url))

const { fetch: originalFetch } = global
const TARGET_URL =
  'https://gist.githubusercontent.com/raineorshine/0802d7388c69193bed49c5ee6ab611b9/raw/6f22bfdf19b7596089e56e0b14cd66d077f049d5/staticRegistry.json'

describe('staticRegistry', function () {
  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(fetch).mockImplementation(async input => {
      if (input === TARGET_URL) {
        return new Response(JSON.stringify({ 'ncu-test-v2': '99.9.9' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // Fallback for other inputs
      console.warn('Missing fixture for URL:', input)
      return originalFetch(input)
    })
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('upgrade to the version specified in the static registry file', async () => {
    const output = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-v2': '1.0.0',
        },
      },
      registryType: 'json',
      registry: path.join(__dirname, 'test-data/registry.json'),
    })

    output!.should.deep.equal({
      'ncu-test-v2': '99.9.9',
    })
  })

  it('ignore dependencies that are not in the static registry', async () => {
    const output = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.0.0',
        },
      },
      registryType: 'json',
      registry: path.join(__dirname, 'test-data/registry.json'),
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
      registryType: 'json',
      registry: TARGET_URL, // https://gist.github.com/raineorshine/0802d7388c69193bed49c5ee6ab611b9
    })

    output!.should.deep.equal({})
  })

  it('infer registryType json when --registry file path ends in .json', async () => {
    const output = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-v2': '1.0.0',
        },
      },
      registry: path.join(__dirname, 'test-data/registry.json'),
    })

    output!.should.deep.equal({
      'ncu-test-v2': '99.9.9',
    })
  })

  it('infer registryType json when --registry url ends in .json', async () => {
    const output = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-v2': '1.0.0',
        },
      },
      registry: TARGET_URL, // https://gist.github.com/raineorshine/0802d7388c69193bed49c5ee6ab611b9
    })

    output!.should.deep.equal({
      'ncu-test-v2': '99.9.9',
    })
  })
})
