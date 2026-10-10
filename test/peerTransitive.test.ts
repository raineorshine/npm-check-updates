import { beforeEach, describe, expect, it, vi } from 'vitest'
import ncu from '../src/index.ts'
import { type Index } from '../src/types/IndexType.ts'
import { type Packument } from '../src/types/Packument.ts'
import createMockVersion from './helpers/createMockVersion.ts'
import { silenceProgressBar } from './helpers/silenceProgressBar.ts'
import stubVersions from './helpers/stubVersions.ts'

/** Creates a mock packument whose versions carry the package name, which the peer filter matches on. */
const mockPackument = (name: string, versions: string[]): Partial<Packument> => {
  const packument = createMockVersion({
    name,
    versions: Object.fromEntries(versions.map(version => [version, '2020-01-01T00:00:00.000Z'])),
    distTags: { latest: versions.at(-1)! },
  })
  return {
    ...packument,
    versions: Object.fromEntries(versions.map(version => [version, { name, version } as Packument])),
  }
}

// plugin and other-plugin peer on helper, which the project does not list, and helper peers on host@1
const peers: Index<Index<string>> = {
  plugin: { helper: '^1.0.0' },
  'other-plugin': { helper: '^1.0.0' },
  helper: { host: '^1.0.0' },
  host: {},
}

// set per test
let optionalPeers: Index<string[]> = {}

vi.mock('../src/package-managers/npm.ts', async importOriginal => ({
  ...(await importOriginal<object>()),
  getPeerDependencies: async (packageName: string) => peers[packageName] ?? {},
  getOptionalPeerDependencies: async (packageName: string) => optionalPeers[packageName] ?? [],
}))

/** Runs ncu with --peer against host@1 and the given plugins, all of which are at their latest version. */
const upgradeWithPlugins = async (plugins: string[]) => {
  const stubbed = stubVersions({
    host: mockPackument('host', ['1.0.0', '2.0.0']),
    ...Object.fromEntries(plugins.map(plugin => [plugin, mockPackument(plugin, ['1.0.0'])])),
  })
  const upgraded = (await ncu({
    packageData: { dependencies: { host: '1.0.0', ...Object.fromEntries(plugins.map(plugin => [plugin, '1.0.0'])) } },
    peer: true,
    silent: true,
  })) as Index<string>
  stubbed.restore()
  return upgraded
}

describe('peer dependencies of unlisted peers', () => {
  beforeEach(() => {
    silenceProgressBar()
    optionalPeers = {}
  })

  // https://github.com/raineorshine/npm-check-updates/issues/2070
  it('ignores an upgrade that violates the peer range of a peer the project does not list', async () => {
    expect(await upgradeWithPlugins(['plugin'])).toStrictEqual({})
  })

  it('does not follow an unlisted peer that is optional, since it is not installed', async () => {
    optionalPeers = { plugin: ['helper'] }
    expect(await upgradeWithPlugins(['plugin'])).toStrictEqual({ host: '2.0.0' })
  })

  it('follows an unlisted peer that is optional for one package but required by another', async () => {
    optionalPeers = { plugin: ['helper'] }
    expect(await upgradeWithPlugins(['plugin', 'other-plugin'])).toStrictEqual({})
  })
})
