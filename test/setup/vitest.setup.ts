import { config, should as initShould, use } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import { installGlobalErrorHandlers } from '../../src/lib/utils/global-error-handlers'
import { TestCacheManager } from '../helpers/TestCacheManager'
import { TestSandbox } from '../helpers/TestSandbox'
import { mockIO } from '../helpers/mockIO'
import { stubGetGitTags } from '../helpers/stubs/stubGetGitTags'
import { stubSpawnPlease } from '../helpers/stubs/stubSpawnPlease'
import { stubVersionsSetup } from '../helpers/stubs/stubVersionsSetup'
import { testNameStore } from '../helpers/testNameStore'

/**
 * Register this mock in `vitest.setup` so it loads before any test file
 * imports a module that depends on `spawn-please`. This guarantees that
 * Vitest applies the mock before the real module is evaluated.
 */
vi.mock('spawn-please', async importOriginal => {
  const actual = await importOriginal<any>()
  const { stubSpawnPlease } = await import('../helpers/stubs/stubSpawnPlease')
  stubSpawnPlease.setRealOriginal(actual.default || actual)
  return {
    __esModule: true,
    default: stubSpawnPlease.spy,
  }
})

installGlobalErrorHandlers()

const should = initShould()

use(chaiAsPromised)
use(chaiString)

config.truncateThreshold = 0
;(global as any).should = should

// must run before anything that uses getTestName()
testNameStore.register()

// Registers beforeEach/afterEach to install global IO capture.
mockIO.register()

/* Initialize the test sandbox and make it globally available for all tests */
TestSandbox.register()

/* Initialize the central cache lifecycle */
const cacheManager = TestCacheManager.register()

/* Initialize each global stub/mock and bind it to the cache manager */
stubSpawnPlease.register(cacheManager)
stubGetGitTags.register(cacheManager)

stubVersionsSetup.register()
