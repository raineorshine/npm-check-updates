import { expect } from 'chai'
import fs from 'fs/promises'
import ncu from '../src/'
import { CACHE_DELIMITER, resolvedDefaultCacheFile } from '../src/lib/cache'
import { CURRENT_CACHE_SCHEMA, type CacheData } from '../src/types/Cacher'
import chaiSetup from './helpers/chaiSetup'
import stubVersions from './helpers/stubVersions'

chaiSetup()

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()

/**
 * mock times
 */
const getTime = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString()

describe('cache', () => {
  it('cache latest versions', async () => {
    const stub = stubVersions({
      'ncu-test-v2': { version: '2.0.0', time: { '2.0.0': getTime(10) } },
      'ncu-test-tag': { version: '1.1.0', time: { '1.1.0': getTime(20) } },
      'ncu-test-alpha': { version: '1.0.0', time: { '1.0.0': getTime(30) } },
    })
    try {
      const packageData = {
        dependencies: {
          'ncu-test-v2': '^1.0.0',
          'ncu-test-tag': '1.0.0',
          'ncu-test-alpha': '1.0.0',
        },
      }

      await ncu({ packageData, cache: true, peer: true })

      const cacheData: CacheData = await fs.readFile(resolvedDefaultCacheFile, 'utf-8').then(JSON.parse)

      expect(cacheData.timestamp).lessThanOrEqual(Date.now())
      expect(cacheData.packages).deep.eq({
        [`ncu-test-v2${CACHE_DELIMITER}latest`]: { version: '2.0.0', time: getTime(10) },
        [`ncu-test-tag${CACHE_DELIMITER}latest`]: { version: '1.1.0', time: getTime(20) },
        [`ncu-test-alpha${CACHE_DELIMITER}latest`]: { version: '1.0.0', time: getTime(30) },
      })
      expect(cacheData.peers).deep.eq({
        [`ncu-test-alpha${CACHE_DELIMITER}1.0.0`]: {},
        [`ncu-test-tag${CACHE_DELIMITER}1.0.0`]: {},
        [`ncu-test-tag${CACHE_DELIMITER}1.1.0`]: {},
        [`ncu-test-v2${CACHE_DELIMITER}1.0.0`]: {},
        [`ncu-test-v2${CACHE_DELIMITER}2.0.0`]: {},
      })
    } finally {
      await fs.rm(resolvedDefaultCacheFile, { recursive: true, force: true })
      stub.restore()
    }
  })

  it('use different cache key for different target', async () => {
    const latest = {
      'ncu-test-v2': { version: '2.0.0', time: { '2.0.0': getTime(10) } },
      'ncu-test-tag': { version: '1.1.0', time: { '1.1.0': getTime(20) } },
      'ncu-test-alpha': { version: '1.0.0', time: { '1.0.0': getTime(30) } },
    }

    const greatest = {
      'ncu-test-v2': { version: '2.0.0', time: { '2.0.0': getTime(10) } },
      'ncu-test-tag': { version: '1.2.0-dev.0', time: { '1.2.0-dev.0': getTime(5) } },
      'ncu-test-alpha': { version: '2.0.0-alpha.2', time: { '2.0.0-alpha.2': getTime(15) } },
    }

    const stub = stubVersions(options => {
      if (options.target === 'latest') return latest
      if (options.target === 'greatest') return greatest
      return null
    })
    try {
      const packageData = {
        dependencies: {
          'ncu-test-v2': '^1.0.0',
          'ncu-test-tag': '1.0.0',
          'ncu-test-alpha': '1.0.0',
        },
      }

      // first run caches latest
      await ncu({ packageData, cache: true })

      const cacheData1: CacheData = await fs.readFile(resolvedDefaultCacheFile, 'utf-8').then(JSON.parse)

      expect(cacheData1.packages).deep.eq({
        [`ncu-test-v2${CACHE_DELIMITER}latest`]: { version: '2.0.0', time: getTime(10) },
        [`ncu-test-tag${CACHE_DELIMITER}latest`]: { version: '1.1.0', time: getTime(20) },
        [`ncu-test-alpha${CACHE_DELIMITER}latest`]: { version: '1.0.0', time: getTime(30) },
      })
      expect(cacheData1.peers).deep.eq({})

      // second run has a different target so should not use the cache
      const result2 = await ncu({ packageData, cache: true, target: 'greatest' })
      expect(result2).deep.eq({
        'ncu-test-v2': '^2.0.0',
        'ncu-test-tag': '1.2.0-dev.0',
        'ncu-test-alpha': '2.0.0-alpha.2',
      })

      const cacheData2: CacheData = await fs.readFile(resolvedDefaultCacheFile, 'utf-8').then(JSON.parse)

      expect(cacheData2.packages).deep.eq({
        [`ncu-test-v2${CACHE_DELIMITER}latest`]: { version: '2.0.0', time: getTime(10) },
        [`ncu-test-tag${CACHE_DELIMITER}latest`]: { version: '1.1.0', time: getTime(20) },
        [`ncu-test-alpha${CACHE_DELIMITER}latest`]: { version: '1.0.0', time: getTime(30) },
        [`ncu-test-v2${CACHE_DELIMITER}greatest`]: { version: '2.0.0', time: getTime(10) },
        [`ncu-test-tag${CACHE_DELIMITER}greatest`]: { version: '1.2.0-dev.0', time: getTime(5) },
        [`ncu-test-alpha${CACHE_DELIMITER}greatest`]: { version: '2.0.0-alpha.2', time: getTime(15) },
      })
    } finally {
      await fs.rm(resolvedDefaultCacheFile, { recursive: true, force: true })
      stub.restore()
    }
  })

  it('clears the cache file', async () => {
    const stub = stubVersions('99.9.9')
    const packageData = {
      dependencies: {
        'ncu-test-v2': '^1.0.0',
        'ncu-test-tag': '1.0.0',
        'ncu-test-alpha': '1.0.0',
      },
    }

    await ncu({ packageData, cache: true })

    await ncu({ packageData, cacheClear: true })
    let noCacheFile = false
    try {
      await fs.stat(resolvedDefaultCacheFile)
    } catch (error) {
      noCacheFile = true
    }
    expect(noCacheFile).eq(true)
    stub.restore()
  })

  it('expires cache when schema version does not match', async () => {
    const stub = stubVersions('2.0.0')
    const packageData = { dependencies: { 'ncu-test-v2': '^1.0.0' } }

    // 1. Manually write an "old" schema (e.g., schema: 0)
    const oldCache = {
      schema: 0,
      timestamp: Date.now(),
      packages: { [`ncu-test-v2${CACHE_DELIMITER}latest`]: { version: '1.0.0' } },
      peers: {},
    }

    try {
      await fs.writeFile(resolvedDefaultCacheFile, JSON.stringify(oldCache))

      // 2. Run ncu - it should detect mismatch and refresh (calling the stub)
      await ncu({ packageData, cache: true })

      // 3. Verify the cache was overwritten with the new schema (v1)
      const newCache = await fs.readFile(resolvedDefaultCacheFile, 'utf-8').then(JSON.parse)
      expect(newCache.schema).eq(CURRENT_CACHE_SCHEMA)
      expect(newCache.packages[`ncu-test-v2${CACHE_DELIMITER}latest`].version).eq('2.0.0')
    } finally {
      await fs.rm(resolvedDefaultCacheFile, { recursive: true, force: true })
      stub.restore()
    }
  })

  it('expires cache when timestamp is older than 10 minutes', async () => {
    const stub = stubVersions('2.0.0')
    const packageData = { dependencies: { 'ncu-test-v2': '^1.0.0' } }

    // 1. Create a cache file with a valid schema but expired timestamp (11 mins ago)
    const expiredCache = {
      schema: CURRENT_CACHE_SCHEMA,
      timestamp: Date.now() - 11 * 60 * 1000,
      packages: { [`ncu-test-v2${CACHE_DELIMITER}latest`]: { version: '1.0.0' } },
      peers: {},
    }
    try {
      await fs.writeFile(resolvedDefaultCacheFile, JSON.stringify(expiredCache))

      // 2. Run ncu - should force refresh
      await ncu({ packageData, cache: true })

      // 3. Verify it refreshed
      const cacheData = await fs.readFile(resolvedDefaultCacheFile, 'utf-8').then(JSON.parse)
      expect(cacheData.packages[`ncu-test-v2${CACHE_DELIMITER}latest`].version).eq('2.0.0')
    } finally {
      await fs.rm(resolvedDefaultCacheFile, { recursive: true, force: true })
      stub.restore()
    }
  })
})
