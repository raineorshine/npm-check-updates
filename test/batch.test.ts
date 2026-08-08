import https from 'node:https'
import { describe, expect, it } from 'vitest'
import ncu from '../src/index.ts'
import { type Index } from '../src/types/IndexType.ts'
import { type RunOptions } from '../src/types/RunOptions.ts'

// the bulk endpoint is only served by registry.npmjs.org, so these hit the network like the other
// package-manager tests
const packageData = JSON.stringify({
  dependencies: {
    'ncu-test-v2': '^1.0.0',
    'ncu-test-return-version': '^1.0.0',
    'ncu-test-alpha': '^1.0.0',
  },
})

/** Runs ncu with and without --batch and asserts both resolve to the same upgrades. */
const expectSameAsUnbatched = async (options: RunOptions) => {
  const unbatched = (await ncu({ packageData, deprecated: false, silent: true, ...options })) as Index<string>
  const batched = (await ncu({
    packageData,
    deprecated: false,
    silent: true,
    ...options,
    batch: true,
  })) as Index<string>
  expect(batched).toEqual(unbatched)
  return batched
}

/** Counts requests to the bulk endpoint made while fn runs. */
const countBulkRequests = async (fn: () => Promise<unknown>): Promise<number> => {
  const request = https.request
  let count = 0
  https.request = ((...args: Parameters<typeof https.request>) => {
    const path = typeof args[0] === 'string' ? new URL(args[0]).pathname : (args[0] as { path?: string })?.path
    if (String(path).includes('/-/npm/v1/dependencies/')) count++
    return request(...args)
  }) as typeof https.request

  try {
    await fn()
    return count
  } finally {
    https.request = request
  }
}

describe('batch', () => {
  // proves the rest of these compare a batched run against an unbatched one, rather than two runs
  // that both quietly fell back
  it('queries the bulk endpoint, and only when eligible', async () => {
    // a range no other test uses, since the version lists are cached for the life of the process
    const packageData = JSON.stringify({ dependencies: { 'ncu-test-return-version': '^1.0.1' } })
    const options = { packageData, deprecated: false, silent: true, target: 'semver' } as const

    expect(await countBulkRequests(() => ncu({ ...options, batch: true }))).toBe(1)
    expect(await countBulkRequests(() => ncu(options))).toBe(0)
  })

  it('resolves semver to the same versions as one request per package', async () => {
    const upgraded = await expectSameAsUnbatched({ target: 'semver' })
    expect(upgraded).toEqual({ 'ncu-test-return-version': '^1.1.0' })
  })

  it('resolves minor to the same versions as one request per package', async () => {
    const upgraded = await expectSameAsUnbatched({ target: 'minor' })
    expect(upgraded).toEqual({ 'ncu-test-return-version': '^1.1.0' })
  })

  it('resolves patch to the same versions as one request per package', async () => {
    await expectSameAsUnbatched({ target: 'patch' })
  })

  // the endpoint reports neither deprecated nor prerelease versions and carries no engines,
  // deprecation, or publish time, so each of these has to fall back to a packument per package
  it('falls back when deprecated versions are included', async () => {
    const upgraded = (await ncu({ packageData, silent: true, target: 'semver', batch: true })) as Index<string>
    expect(upgraded).toEqual((await ncu({ packageData, silent: true, target: 'semver' })) as Index<string>)
  })

  it('falls back for a dist-tag target', async () => {
    await expectSameAsUnbatched({ target: '@latest' })
  })

  it('falls back with --pre', async () => {
    await expectSameAsUnbatched({ target: 'semver', pre: true })
  })

  it('falls back with enginesNode', async () => {
    await expectSameAsUnbatched({ target: 'semver', enginesNode: true })
  })

  it('falls back with cooldown', async () => {
    await expectSameAsUnbatched({ target: 'semver', cooldown: 1 })
  })

  it('does not upgrade a wildcard', async () => {
    const upgraded = (await ncu({
      packageData: JSON.stringify({ dependencies: { 'ncu-test-v2': '*' } }),
      deprecated: false,
      silent: true,
      target: 'semver',
      batch: true,
    })) as Index<string>
    expect(upgraded).toEqual({})
  })
})
