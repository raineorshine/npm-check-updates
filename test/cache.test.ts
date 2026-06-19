import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import ncu from '../src/index.ts'
import cacher, { CACHE_DELIMITER, cacheClear, resolvedDefaultCacheFile } from '../src/lib/cache.ts'
import { CURRENT_CACHE_SCHEMA, type CacheData } from '../src/types/Cacher.ts'
import createMockVersion from './helpers/createMockVersion.ts'
import removeDir from './helpers/removeDir.ts'
import stubVersions from './helpers/stubVersions.ts'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()

/**
 * Mock times.
 */
const getTime = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString()

describe('cache', () => {
  beforeAll(async () => {
    await fs.rm(resolvedDefaultCacheFile, { recursive: true, force: true })
  })

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

      const cacheData: CacheData = JSON.parse(await fs.readFile(resolvedDefaultCacheFile, 'utf-8'))

      expect(cacheData.timestamp).toBeLessThanOrEqual(Date.now())
      expect(cacheData.packages).toStrictEqual({
        [`ncu-test-v2${CACHE_DELIMITER}latest`]: { version: '2.0.0', time: getTime(10) },
        [`ncu-test-tag${CACHE_DELIMITER}latest`]: { version: '1.1.0', time: getTime(20) },
        [`ncu-test-alpha${CACHE_DELIMITER}latest`]: { version: '1.0.0', time: getTime(30) },
      })
      expect(cacheData.peers).toStrictEqual({
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

      const cacheData1: CacheData = JSON.parse(await fs.readFile(resolvedDefaultCacheFile, 'utf-8'))

      expect(cacheData1.packages).toStrictEqual({
        [`ncu-test-v2${CACHE_DELIMITER}latest`]: { version: '2.0.0', time: getTime(10) },
        [`ncu-test-tag${CACHE_DELIMITER}latest`]: { version: '1.1.0', time: getTime(20) },
        [`ncu-test-alpha${CACHE_DELIMITER}latest`]: { version: '1.0.0', time: getTime(30) },
      })
      expect(cacheData1.peers).toStrictEqual({})

      // second run has a different target so should not use the cache
      const result2 = await ncu({ packageData, cache: true, target: 'greatest' })
      expect(result2).toStrictEqual({
        'ncu-test-v2': '^2.0.0',
        'ncu-test-tag': '1.2.0-dev.0',
        'ncu-test-alpha': '2.0.0-alpha.2',
      })

      const cacheData2: CacheData = JSON.parse(await fs.readFile(resolvedDefaultCacheFile, 'utf-8'))

      expect(cacheData2.packages).toStrictEqual({
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
    } catch {
      noCacheFile = true
    }
    expect(noCacheFile).toBe(true)
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
      const newCache = JSON.parse(await fs.readFile(resolvedDefaultCacheFile, 'utf-8'))
      expect(newCache.schema).toBe(CURRENT_CACHE_SCHEMA)
      expect(newCache.packages[`ncu-test-v2${CACHE_DELIMITER}latest`].version).toBe('2.0.0')
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
      const cacheData = JSON.parse(await fs.readFile(resolvedDefaultCacheFile, 'utf-8'))
      expect(cacheData.packages[`ncu-test-v2${CACHE_DELIMITER}latest`].version).toBe('2.0.0')
    } finally {
      await fs.rm(resolvedDefaultCacheFile, { recursive: true, force: true })
      stub.restore()
    }
  })

  describe('cacher', () => {
    let tempDir: string
    let cacheFile: string

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-test-cacher-'))
      cacheFile = path.join(tempDir, '.ncu-cache.json')
    })

    afterEach(async () => {
      await removeDir(tempDir)
    })

    it('returns undefined when caching is disabled', async () => {
      expect(await cacher({ cache: false, cacheFile })).toBeUndefined()
    })

    it('stores and retrieves versions and peers, persisting across instances', async () => {
      const cache = await cacher({ cache: true, cacheFile })
      expect(cache).toBeDefined()

      cache!.set('foo', 'latest', '1.2.3', '2020-01-01')
      expect(cache!.get('foo', 'latest')).toStrictEqual({ version: '1.2.3', time: '2020-01-01' })
      expect(cache!.get('missing', 'latest')).toBeUndefined()

      cache!.setPeers('foo', '1.2.3', { bar: '^1.0.0' })
      expect(cache!.getPeers('foo', '1.2.3')).toStrictEqual({ bar: '^1.0.0' })
      expect(cache!.getPeers('missing', '1.0.0')).toBeUndefined()

      await cache!.save()

      // a fresh cacher instance reads the persisted data
      const reloaded = await cacher({ cache: true, cacheFile })
      expect(reloaded!.get('foo', 'latest')).toStrictEqual({ version: '1.2.3', time: '2020-01-01' })
    })

    it('logs the number of cache hits', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const cache = await cacher({ cache: true, cacheFile })
      cache!.set('foo', 'latest', '1.2.3')
      cache!.get('foo', 'latest')
      cache!.log()
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('1 cached package version'))
      logSpy.mockRestore()
    })

    it('cacheClear is a no-op when no cacheFile is set', async () => {
      await expect(cacheClear({})).resolves.toBeUndefined()
    })
  })

  describe('cooldown', () => {
    // 2.0.0 is within the cooldown window, so a cooldown run resolves to the 1.5.0 fallback
    const mockVersions = {
      'ncu-test-v2': createMockVersion({
        name: 'ncu-test-v2',
        versions: {
          '1.0.0': getTime(30),
          '1.5.0': getTime(20),
          '2.0.0': getTime(1),
        },
        distTags: { latest: '2.0.0' },
      }),
    }
    const packageData = { dependencies: { 'ncu-test-v2': '^1.0.0' } }

    it('does not write to the cache when cooldown is active', async () => {
      const stub = stubVersions(mockVersions)
      try {
        await ncu({ packageData, cache: true, cooldown: 7 })

        const cacheData: CacheData = JSON.parse(await fs.readFile(resolvedDefaultCacheFile, 'utf-8'))
        expect(cacheData.packages).deep.eq({})
      } finally {
        await fs.rm(resolvedDefaultCacheFile, { recursive: true, force: true })
        stub.restore()
      }
    })

    it('does not poison the cache for a later non-cooldown run', async () => {
      const stub = stubVersions(mockVersions)
      try {
        await ncu({ packageData, cache: true, cooldown: 7 })

        // a subsequent non-cooldown run must report the real latest, not the cached fallback
        const result = await ncu({ packageData, cache: true })
        expect(result).deep.eq({ 'ncu-test-v2': '^2.0.0' })
      } finally {
        await fs.rm(resolvedDefaultCacheFile, { recursive: true, force: true })
        stub.restore()
      }
    })
  })
})
