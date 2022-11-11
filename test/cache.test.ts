import chai, { expect } from 'chai'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import rimraf from 'rimraf'
import * as ncu from '../src/'
import { resolvedDefaultCacheFile } from '../src/lib/cache'
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
          // minor version upgrade → 1.1.0
          'ncu-test-tag': '1.0.0',
          // latest: no upgrade
          // greatest: prerelease → 2.0.0.alpha.2
          'ncu-test-alpha': '1.0.0',
        },
      }

      await ncu.run({ packageData, cache: true })

      const cacheFileText = await fs.readFile(resolvedDefaultCacheFile, 'utf-8')
      const cacheFileData: CacheData = JSON.parse(cacheFileText)

      expect(cacheFileData.timestamp).lessThanOrEqual(Date.now())
      expect(cacheFileData.packages).deep.eq({
        'ncu-test-tag': '1.1.0',
        'ncu-test-v2': '2.0.0',
        'ncu-test-alpha': '1.0.0',
      })
    } finally {
      rimraf.sync(resolvedDefaultCacheFile)
    }
  })
})
