import chai, { expect } from 'chai'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import rimraf from 'rimraf'
import * as ncu from '../src/'
import { resolvedDefaultCacheFile } from '../src/lib/cache'

chai.should()
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

describe('cache', () => {
  it('generates a cache file', async () => {
    const packageData = {
      dependencies: {
        chalk: '^5.0.1',
        'cli-table': '^0.3.11',
        commander: '^9.4.0',
        'fast-memoize': '^2.5.2',
        'find-up': '5.0.0',
        'fp-and-or': '^0.1.3',
        'get-stdin': '^8.0.0',
        globby: '^11.0.4',
        'hosted-git-info': '^5.0.0',
        'json-parse-helpfulerror': '^1.0.3',
        jsonlines: '^0.1.1',
        lodash: '^4.17.21',
        minimatch: '^5.1.0',
        'p-map': '^4.0.0',
        pacote: '^13.6.1',
        'parse-github-url': '^1.0.2',
        progress: '^2.0.3',
        'prompts-ncu': '^2.5.1',
        'rc-config-loader': '^4.1.0',
        'remote-git-tags': '^3.0.0',
        rimraf: '^3.0.2',
        semver: '^7.3.7',
        'semver-utils': '^1.1.4',
        'source-map-support': '^0.5.21',
        'spawn-please': '^1.0.0',
        'update-notifier': '^6.0.2',
        yaml: '^2.1.1',
      },
    }

    rimraf.sync(resolvedDefaultCacheFile)

    await ncu.run({
      packageData,
      cache: true,
    })

    const cacheFileText = await fs.readFile(resolvedDefaultCacheFile, 'utf-8')
    const cacheFileData = JSON.parse(cacheFileText)
    expect(cacheFileData.timestamp).lessThanOrEqual(Date.now())

    const packageDataCached = Object.keys(packageData.dependencies)
      .map(key => cacheFileText.includes(key))
      .some(value => value !== false)
    expect(packageDataCached).eq(true)

    rimraf.sync(resolvedDefaultCacheFile)
  })
})
