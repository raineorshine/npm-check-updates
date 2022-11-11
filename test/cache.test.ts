import chai, { expect } from 'chai'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import rimraf from 'rimraf'
import * as ncu from '../src/'
import { CACHE_DELIMITER, resolvedDefaultCacheFile } from '../src/lib/cache'
import { CacheData } from '../src/types/Cacher'

chai.should()
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

describe('cache', () => {
  it('cache latest versions', async () => {
    try {
      const packageData = {
        dependencies: {
          // major version upgrade → 2.0.0
          'ncu-test-v2': '^1.0.0',
          // latest: minor version upgrade → 1.1.0
          // greatest: prerelease → 1.2.0-dev.0
          'ncu-test-tag': '1.0.0',
          // latest: no upgrade
          // greatest: prerelease → 2.0.0-alpha.2
          'ncu-test-alpha': '1.0.0',
        },
      }

      await ncu.run({ packageData, cache: true })

      const cacheData: CacheData = await fs.readFile(resolvedDefaultCacheFile, 'utf-8').then(JSON.parse)

      expect(cacheData.timestamp).lessThanOrEqual(Date.now())
      expect(cacheData.packages).deep.eq({
        [`ncu-test-v2${CACHE_DELIMITER}latest`]: '2.0.0',
        [`ncu-test-tag${CACHE_DELIMITER}latest`]: '1.1.0',
        [`ncu-test-alpha${CACHE_DELIMITER}latest`]: '1.0.0',
      })
    } finally {
      rimraf.sync(resolvedDefaultCacheFile)
    }
  })

  it('use different cache key for different target', async () => {
    try {
      const packageData = {
        dependencies: {
          // major version upgrade → 2.0.0
          'ncu-test-v2': '^1.0.0',
          // minor version upgrade → 1.1.0
          'ncu-test-tag': '1.0.0',
          // latest: no upgrade
          // greatest: prerelease → 2.0.0.alpha.2
          'ncu-test-alpha': '1.0.0',
        },
      }

      // first run caches latest
      await ncu.run({ packageData, cache: true })

      const cacheData1: CacheData = await fs.readFile(resolvedDefaultCacheFile, 'utf-8').then(JSON.parse)

      expect(cacheData1.packages).deep.eq({
        [`ncu-test-v2${CACHE_DELIMITER}latest`]: '2.0.0',
        [`ncu-test-tag${CACHE_DELIMITER}latest`]: '1.1.0',
        [`ncu-test-alpha${CACHE_DELIMITER}latest`]: '1.0.0',
      })

      // second run has a different target so should not use the cache
      const result2 = await ncu.run({ packageData, cache: true, target: 'greatest' })
      expect(result2).deep.eq({
        'ncu-test-v2': '^2.0.0',
        'ncu-test-tag': '1.2.0-dev.0',
        'ncu-test-alpha': '2.0.0-alpha.2',
      })

      const cacheData2: CacheData = await fs.readFile(resolvedDefaultCacheFile, 'utf-8').then(JSON.parse)

      expect(cacheData2.packages).deep.eq({
        [`ncu-test-v2${CACHE_DELIMITER}latest`]: '2.0.0',
        [`ncu-test-tag${CACHE_DELIMITER}latest`]: '1.1.0',
        [`ncu-test-alpha${CACHE_DELIMITER}latest`]: '1.0.0',
        [`ncu-test-v2${CACHE_DELIMITER}greatest`]: '2.0.0',
        [`ncu-test-tag${CACHE_DELIMITER}greatest`]: '1.2.0-dev.0',
        [`ncu-test-alpha${CACHE_DELIMITER}greatest`]: '2.0.0-alpha.2',
      })
    } finally {
      rimraf.sync(resolvedDefaultCacheFile)
    }
  })
})
