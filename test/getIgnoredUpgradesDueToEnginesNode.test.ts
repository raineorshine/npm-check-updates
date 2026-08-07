import { describe, expect, it, vi } from 'vitest'
import getEnginesNodeFromRegistry from '../src/lib/getEnginesNodeFromRegistry.ts'
import getIgnoredUpgradesDueToEnginesNode from '../src/lib/getIgnoredUpgradesDueToEnginesNode.ts'
import { type Index } from '../src/types/IndexType.ts'
import { silenceProgressBar } from './helpers/silenceProgressBar.ts'
import stubVersions from './helpers/stubVersions.ts'

// engines.node is fetched from the live registry, so mock it to keep the test deterministic
vi.mock('../src/lib/getEnginesNodeFromRegistry.ts', () => ({ default: vi.fn() }))

/** Stubs the engines.node returned by the registry for each package. */
const stubEnginesNode = (enginesNode: Index<string | undefined>) =>
  vi.mocked(getEnginesNodeFromRegistry).mockImplementation(async packageMap =>
    Object.keys(packageMap).reduce<Index<string | undefined>>((accum, name) => {
      accum[name] = enginesNode[name]
      return accum
    }, {}),
  )

describe('getIgnoredUpgradesDueToEnginesNode', () => {
  it('returns nothing without nodeEngineVersion', async () => {
    const data = await getIgnoredUpgradesDueToEnginesNode({ 'ncu-test-v2': '1.0.0' }, { 'ncu-test-v2': '2.0.0' }, {})
    expect(data).toStrictEqual({})
  })

  it('returns nothing when nodeEngineVersion is unsatisfiable', async () => {
    const data = await getIgnoredUpgradesDueToEnginesNode(
      { 'ncu-test-v2': '1.0.0' },
      { 'ncu-test-v2': '2.0.0' },
      { nodeEngineVersion: '>=1.0.0 <1.0.0' },
    )
    expect(data).toStrictEqual({})
  })

  it('ignores upgrades whose engines.node is not satisfied', async () => {
    const stub = stubVersions({ 'ncu-test-v2': '2.0.0', 'ncu-test-return-version': '2.0.0' })
    stubEnginesNode({ 'ncu-test-v2': '>=18', 'ncu-test-return-version': '>=0.10.0' })
    silenceProgressBar()

    const data = await getIgnoredUpgradesDueToEnginesNode(
      { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0' },
      // engines.node filtered ncu-test-v2 out of the upgrades, so it is a candidate to be reported as ignored
      { 'ncu-test-return-version': '2.0.0' },
      { nodeEngineVersion: '^14.0.0' },
    )

    expect(data).toStrictEqual({
      'ncu-test-v2': {
        from: '1.0.0',
        to: '2.0.0',
        enginesNode: '>=18',
      },
    })
    stub.restore()
  })

  it('does not report a package that was already upgraded to the latest version', async () => {
    const stub = stubVersions({ 'ncu-test-v2': '2.0.0' })
    stubEnginesNode({ 'ncu-test-v2': '>=18' })
    silenceProgressBar()

    const data = await getIgnoredUpgradesDueToEnginesNode(
      { 'ncu-test-v2': '1.0.0' },
      { 'ncu-test-v2': '2.0.0' },
      { nodeEngineVersion: '^14.0.0' },
    )

    expect(data).toStrictEqual({})
    stub.restore()
  })

  it('does not report a package without engines.node', async () => {
    const stub = stubVersions({ 'ncu-test-v2': '2.0.0' })
    stubEnginesNode({ 'ncu-test-v2': undefined })
    silenceProgressBar()

    const data = await getIgnoredUpgradesDueToEnginesNode(
      { 'ncu-test-v2': '1.0.0' },
      {},
      { nodeEngineVersion: '^14.0.0' },
    )

    expect(data).toStrictEqual({})
    stub.restore()
  })
})
