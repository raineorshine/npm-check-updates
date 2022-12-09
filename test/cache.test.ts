import chai, { expect } from 'chai'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import rimraf from 'rimraf'
import * as ncu from '../src/'
import { CACHE_DELIMITER, resolvedDefaultCacheFile } from '../src/lib/cache'
import { CacheData } from '../src/types/Cacher'
import stubNpmView from './helpers/stubNpmView'

chai.should()
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

describe('cache', () => {
  it('cache latest versions', async () => {
    const stub = stubNpmView({
      'ncu-test-v2': '2.0.0',
      'ncu-test-tag': '1.1.0',
      'ncu-test-alpha': '1.0.0',
    })
    try {
      const packageData = {
        dependencies: {
          'ncu-test-v2': '^1.0.0',
          'ncu-test-tag': '1.0.0',
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
      stub.restore()
    }
  })

  it('use different cache key for different target', async () => {
    const stub = stubNpmView(options =>
      options.target === 'latest'
        ? {
            'ncu-test-v2': '2.0.0',
            'ncu-test-tag': '1.1.0',
            'ncu-test-alpha': '1.0.0',
          }
        : options.target === 'greatest'
        ? {
            'ncu-test-v2': '2.0.0',
            'ncu-test-tag': '1.2.0-dev.0',
            'ncu-test-alpha': '2.0.0-alpha.2',
          }
        : null,
    )
    try {
      const packageData = {
        dependencies: {
          'ncu-test-v2': '^1.0.0',
          'ncu-test-tag': '1.0.0',
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
      stub.restore()
    }
  })

  it('clears the cache file', async () => {
    const stub = stubNpmView('99.9.9')
    const packageData = {
      dependencies: {
        'ncu-test-v2': '^1.0.0',
        'ncu-test-tag': '1.0.0',
        'ncu-test-alpha': '1.0.0',
      },
    }

    await ncu.run({ packageData, cache: true })

    await ncu.run({ packageData, cacheClear: true })
    let noCacheFile = false
    try {
      await fs.stat(resolvedDefaultCacheFile)
    } catch (error) {
      noCacheFile = true
    }
    expect(noCacheFile).eq(true)
    stub.restore()
  })
})
