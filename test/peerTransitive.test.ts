import semver from 'semver'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ncu from '../src/index.ts'
import getIgnoredUpgradesDueToPeerDeps from '../src/lib/getIgnoredUpgradesDueToPeerDeps.ts'
import getPeerDependenciesFromRegistry from '../src/lib/getPeerDependenciesFromRegistry.ts'
import { type Index } from '../src/types/IndexType.ts'
import { type PackageFile } from '../src/types/PackageFile.ts'
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

// set per test: the peer dependencies of each published version, and the peers each package marks as optional
let peers: Index<Index<Index<string>>> = {}
let optionalPeers: Index<string[]> = {}

/** Resolves a version or range to the highest published version in the peers table, like the registry does. */
const resolve = (packageName: string, version: string) =>
  semver.maxSatisfying(Object.keys(peers[packageName] ?? {}), version || '*')

vi.mock('../src/package-managers/npm.ts', async importOriginal => ({
  ...(await importOriginal<object>()),
  getPeerDependencies: async (packageName: string, version: string) => {
    const resolved = resolve(packageName, version)
    return (resolved && peers[packageName][resolved]) || {}
  },
  getOptionalPeerDependencies: async (packageName: string) => optionalPeers[packageName] ?? [],
}))

/** Runs ncu with --peer, stubbing each package in the peers table with the versions listed there. */
const upgrade = async (packageData: PackageFile, options: { reject?: string[] } = {}) => {
  const stubbed = stubVersions(
    Object.fromEntries(
      Object.entries(peers).map(([name, versions]) => [name, mockPackument(name, Object.keys(versions))]),
    ),
  )
  const upgraded = (await ncu({ packageData, peer: true, silent: true, ...options })) as Index<string>
  stubbed.restore()
  return upgraded
}

describe('peer dependencies of unlisted peers', () => {
  beforeEach(() => {
    silenceProgressBar()
    optionalPeers = {}
    // plugin and other-plugin peer on helper, which the project does not list, and helper peers on host@1
    peers = {
      host: { '1.0.0': {}, '2.0.0': {} },
      plugin: { '1.0.0': { helper: '^1.0.0' } },
      'other-plugin': { '1.0.0': { helper: '^1.0.0' } },
      helper: { '1.0.0': { host: '^1.0.0' } },
    }
  })

  // https://github.com/raineorshine/npm-check-updates/issues/2070
  it('ignores an upgrade that violates the peer range of a peer the project does not list', async () => {
    expect(await upgrade({ dependencies: { host: '1.0.0', plugin: '1.0.0' } })).toStrictEqual({})
  })

  it('names the package that brings in the unlisted peer in the ignored updates', async () => {
    const current = { host: '1.0.0', plugin: '1.0.0' }
    const stubbed = stubVersions(
      Object.fromEntries(
        Object.entries(peers).map(([name, versions]) => [name, mockPackument(name, Object.keys(versions))]),
      ),
    )
    const peerDependencies = await getPeerDependenciesFromRegistry(current, {}, Object.keys(current))
    const ignored = await getIgnoredUpgradesDueToPeerDeps(current, {}, peerDependencies, { peer: true })
    stubbed.restore()
    expect(ignored).toStrictEqual({ host: { from: '1.0.0', to: '2.0.0', reason: { 'plugin > helper': '^1.0.0' } } })
  })

  it('does not follow an unlisted peer that is optional, since it is not installed', async () => {
    optionalPeers = { plugin: ['helper'] }
    expect(await upgrade({ dependencies: { host: '1.0.0', plugin: '1.0.0' } })).toStrictEqual({ host: '2.0.0' })
  })

  it('follows an unlisted peer that is optional for one package but required by another', async () => {
    optionalPeers = { plugin: ['helper'] }
    expect(await upgrade({ dependencies: { host: '1.0.0', plugin: '1.0.0', 'other-plugin': '1.0.0' } })).toStrictEqual(
      {},
    )
  })

  it('follows an unlisted peer that is required at any version', async () => {
    peers.plugin = { '1.0.0': { helper: '*' } }
    expect(await upgrade({ dependencies: { host: '1.0.0', plugin: '1.0.0' } })).toStrictEqual({})
  })

  it('checks an unlisted peer at each range it is required at', async () => {
    // helper@1 allows any host, while helper@2 needs host@1, so only other-plugin holds host back
    peers.plugin = { '1.0.0': { helper: '^1.0.0' } }
    peers['other-plugin'] = { '1.0.0': { helper: '^2.0.0' } }
    peers.helper = { '1.0.0': {}, '2.0.0': { host: '^1.0.0' } }
    expect(await upgrade({ dependencies: { host: '1.0.0', plugin: '1.0.0', 'other-plugin': '1.0.0' } })).toStrictEqual(
      {},
    )
  })

  it('drops the peers of an unlisted peer once the upgraded package no longer requires it', async () => {
    peers.plugin = { '1.0.0': { helper: '^1.0.0' }, '2.0.0': {} }
    expect(await upgrade({ dependencies: { host: '1.0.0', plugin: '1.0.0' } })).toStrictEqual({
      host: '2.0.0',
      plugin: '2.0.0',
    })
  })

  it('keeps the peers of the installed version when an upgrade that brings in a different version is rejected', async () => {
    // plugin@2 is rejected because of blocker, so helper@1 still holds host back even though helper@2 would allow it
    peers.blocker = { '1.0.0': {} }
    peers.plugin = { '1.0.0': { helper: '^1.0.0' }, '2.0.0': { helper: '^2.0.0', blocker: '^9.0.0' } }
    peers.helper = { '1.0.0': { host: '^1.0.0' }, '2.0.0': { host: '^2.0.0' } }
    expect(await upgrade({ dependencies: { host: '1.0.0', plugin: '1.0.0', blocker: '1.0.0' } })).toStrictEqual({})
  })

  it('does not follow a peer the project lists, even when it is rejected from the upgrade', async () => {
    // the listed helper@1.0.0 allows any host, but the newest helper@1 in range would not
    peers.helper = { '1.0.0': {}, '1.5.0': { host: '^1.0.0' } }
    expect(
      await upgrade({ dependencies: { host: '1.0.0', plugin: '1.0.0', helper: '1.0.0' } }, { reject: ['helper'] }),
    ).toStrictEqual({ host: '2.0.0' })
  })
})
