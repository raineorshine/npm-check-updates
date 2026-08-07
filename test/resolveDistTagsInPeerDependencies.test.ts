import { describe, expect, it, vi } from 'vitest'
import resolveDistTagsInPeerDependencies, {
  parseDistTags,
  replaceDistTags,
} from '../src/lib/resolveDistTagsInPeerDependencies.ts'
import { npmApi } from '../src/package-managers/npm.ts'
import stubVersions from './helpers/stubVersions.ts'

describe('parseDistTags', () => {
  it('returns nothing for a range semver already understands', () => {
    expect(parseDistTags('>=3.0.0')).toStrictEqual([])
    expect(parseDistTags('^1 || ^2')).toStrictEqual([])
    expect(parseDistTags('*')).toStrictEqual([])
    expect(parseDistTags('x')).toStrictEqual([])
  })

  it('returns the dist-tags in a range', () => {
    expect(parseDistTags('>=3.0.0 || insiders')).toStrictEqual(['insiders'])
    expect(parseDistTags('insiders')).toStrictEqual(['insiders'])
    expect(parseDistTags('^1 || next || beta')).toStrictEqual(['next', 'beta'])
  })

  it('ignores non-semver specs that are not dist-tags', () => {
    expect(parseDistTags('catalog:')).toStrictEqual([])
    expect(parseDistTags('workspace:*')).toStrictEqual([])
    expect(parseDistTags('npm:other@^1.0.0')).toStrictEqual([])
    expect(parseDistTags('git+https://gitlab.com/project.git')).toStrictEqual([])
  })
})

describe('replaceDistTags', () => {
  it('replaces dist-tags with the versions they point to', () => {
    expect(replaceDistTags('>=3.0.0 || insiders', { latest: '3.3.5', insiders: '0.0.0-insiders.a86e601' })).toBe(
      '>=3.0.0 || 0.0.0-insiders.a86e601',
    )
  })

  it('keeps the range as-is if a dist-tag is unknown', () => {
    expect(replaceDistTags('>=3.0.0 || insiders', { latest: '3.3.5' })).toBe('>=3.0.0 || insiders')
  })

  it('does not resolve inherited properties', () => {
    expect(replaceDistTags('>=3.0.0 || constructor', {})).toBe('>=3.0.0 || constructor')
  })
})

describe('resolveDistTagsInPeerDependencies', () => {
  // https://github.com/raineorshine/npm-check-updates/issues/1348
  it('resolves a dist-tag in a peer dependency range', async () => {
    const stub = stubVersions({
      tailwindcss: {
        version: '3.3.5',
        'dist-tags': { latest: '3.3.5', insiders: '0.0.0-insiders.a86e601' },
      },
    })
    const data = await resolveDistTagsInPeerDependencies(
      { '@tailwindcss/typography': { tailwindcss: '>=3.0.0 || insiders' } },
      {},
    )
    expect(data).toStrictEqual({
      '@tailwindcss/typography': { tailwindcss: '>=3.0.0 || 0.0.0-insiders.a86e601' },
    })
    stub.restore()
  })

  it('does not hit the registry for ranges semver understands', async () => {
    // the stub throws for any package it was not given, so any request fails the test
    const stub = stubVersions({})
    const peerDependencies = { 'ncu-test-peer': { 'ncu-test-return-version': '1.x' } }
    expect(await resolveDistTagsInPeerDependencies(peerDependencies, {})).toStrictEqual(peerDependencies)
    stub.restore()
  })

  it('leaves the range alone if the registry request fails', async () => {
    const stub = vi.spyOn(npmApi, 'fetchUpgradedPackumentMemo').mockRejectedValue(new Error('E404'))
    const peerDependencies = { 'ncu-test-peer': { 'ncu-test-return-version': '>=1.0.0 || insiders' } }
    expect(await resolveDistTagsInPeerDependencies(peerDependencies, {})).toStrictEqual(peerDependencies)
    stub.mockRestore()
  })

  it('resolves a dist-tag from the registry', async () => {
    const data = await resolveDistTagsInPeerDependencies({ 'ncu-test-peer': { 'ncu-test-tag': '>=1.0.0 || dev' } }, {})
    expect(data).toStrictEqual({ 'ncu-test-peer': { 'ncu-test-tag': '>=1.0.0 || 1.2.0-dev.0' } })
  })
})
