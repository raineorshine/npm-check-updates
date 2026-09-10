import { beforeEach, describe, expect, it, vi } from 'vitest'
import ncu from '../src/index.ts'
import { type Index } from '../src/types/IndexType.ts'
import { type PackageFile } from '../src/types/PackageFile.ts'
import createMockVersion from './helpers/createMockVersion.ts'
import { silenceProgressBar } from './helpers/silenceProgressBar.ts'
import stubVersions from './helpers/stubVersions.ts'

// peer-shifter only requires pinned-pkg ^2 once it is upgraded to 2.0.0, so the peer recursion
// runs once, discovers that pinned-pkg cannot reach 2.0.0, and then reverts to the original peers
vi.mock('../src/lib/getPeerDependenciesFromRegistry.ts', () => ({
  default: async (packageMap: Index<string>) =>
    Object.fromEntries(
      Object.entries(packageMap).map(([name, version]) => [
        name,
        name === 'peer-shifter' && version.startsWith('2') ? { 'pinned-pkg': '^2.0.0' } : {},
      ]),
    ),
}))

const OLD = new Date('2020-01-01').toISOString()

const packageData: PackageFile = {
  dependencies: { 'clean-pkg': '1.0.0', 'peer-shifter': '1.0.0', 'pinned-pkg': '1.0.0' },
}

/** Stubs an upgradable clean-pkg and peer-shifter alongside a pinned-pkg that has no upgrade. */
const stub = () =>
  stubVersions({
    'clean-pkg': createMockVersion({
      name: 'clean-pkg',
      versions: { '1.0.0': OLD, '1.1.0': OLD },
      distTags: { latest: '1.1.0' },
    }),
    'peer-shifter': createMockVersion({
      name: 'peer-shifter',
      versions: { '1.0.0': OLD, '2.0.0': OLD },
      distTags: { latest: '2.0.0' },
    }),
    'pinned-pkg': createMockVersion({
      name: 'pinned-pkg',
      versions: { '1.0.0': OLD },
      distTags: { latest: '1.0.0' },
    }),
  })

describe('peer partial upgrade', () => {
  beforeEach(() => {
    silenceProgressBar()
  })

  // https://github.com/raineorshine/npm-check-updates/issues/2072
  it('keeps upgrades that do not violate peer dependencies when another upgrade does', async () => {
    const stubbed = stub()

    const upgraded = (await ncu({ packageData, peer: true, silent: true })) as Index<string>

    stubbed.restore()

    expect(upgraded).toStrictEqual({ 'clean-pkg': '1.1.0' })
  })
})
