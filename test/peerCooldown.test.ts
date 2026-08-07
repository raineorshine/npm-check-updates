import { beforeEach, describe, expect, it, vi } from 'vitest'
import ncu from '../src/index.ts'
import { type Index } from '../src/types/IndexType.ts'
import { type PackageFile } from '../src/types/PackageFile.ts'
import createMockVersion from './helpers/createMockVersion.ts'
import { silenceProgressBar } from './helpers/silenceProgressBar.ts'
import stubVersions from './helpers/stubVersions.ts'

// peer-pkg reports different peers before and after its upgrade, which is what sends
// upgradePackageDefinitions into the peer recursion that requeries every dependency
vi.mock('../src/lib/getPeerDependenciesFromRegistry.ts', () => ({
  default: async (packageMap: Index<string>) =>
    Object.fromEntries(
      Object.entries(packageMap).map(([name, version]) => [
        name,
        name === 'peer-pkg' ? { 'unrelated-peer': version.startsWith('1.1') ? '^2' : '^1' } : {},
      ]),
    ),
}))

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()
/** Returns an ISO timestamp n days in the past. */
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString()

const packageData: PackageFile = {
  dependencies: { 'cooldown-pkg': '2.9.2', 'peer-pkg': '1.0.0' },
}

/** Stubs cooldown-pkg with 2.9.5 inside the cooldown window and 2.9.4 outside it. */
const stub = () =>
  stubVersions({
    'cooldown-pkg': createMockVersion({
      name: 'cooldown-pkg',
      versions: { '2.9.2': daysAgo(60), '2.9.4': daysAgo(30), '2.9.5': daysAgo(1) },
      distTags: { latest: '2.9.5' },
    }),
    'peer-pkg': createMockVersion({
      name: 'peer-pkg',
      versions: { '1.0.0': daysAgo(60), '1.1.0': daysAgo(30) },
      distTags: { latest: '1.1.0' },
    }),
  })

describe('peer with cooldown', () => {
  beforeEach(() => {
    silenceProgressBar()
  })

  // https://github.com/raineorshine/npm-check-updates/issues/1982
  for (const target of ['latest', 'minor'] as const) {
    it(`writes the cooldown fallback that the peer requery cannot improve on (target ${target})`, async () => {
      const stubbed = stub()

      const upgraded = (await ncu({ packageData, peer: true, cooldown: 3, target, silent: true })) as Index<string>
      const written = (await ncu({
        packageData,
        peer: true,
        cooldown: 3,
        target,
        silent: true,
        jsonAll: true,
      })) as PackageFile

      stubbed.restore()

      expect(upgraded).toHaveProperty('cooldown-pkg', '2.9.4')
      expect(written.dependencies).toHaveProperty('cooldown-pkg', '2.9.4')
    })
  }
})
