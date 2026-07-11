import { describe, expect, it } from 'vitest'
import queryVersions from '../src/lib/queryVersions.ts'
import stubVersions from './helpers/stubVersions.ts'

describe('queryVersions', () => {
  it('valid single package', async () => {
    const stub = stubVersions('99.9.9')
    const latestVersions = await queryVersions({ async: '1.5.1' }, { loglevel: 'silent' })
    expect(latestVersions).toHaveProperty('async')
    stub.restore()
  })

  it('valid packages', async () => {
    const stub = stubVersions('99.9.9')
    const latestVersions = await queryVersions({ async: '1.5.1', npm: '3.10.3' }, { loglevel: 'silent' })
    expect(latestVersions).toHaveProperty('async')
    expect(latestVersions).toHaveProperty('npm')
    stub.restore()
  })

  it('unavailable packages should be ignored', async () => {
    const result = await queryVersions({ abchdefntofknacuifnt: '1.2.3' }, { loglevel: 'silent' })
    expect(result).toStrictEqual({})
  })

  it('error while querying version should be handled', async () => {
    const stub = stubVersions(() => {
      throw new Error(`Package inaccessible`)
    })

    const result = await queryVersions({ async: '1.5.1' }, { loglevel: 'silent' })
    expect(result).toStrictEqual({
      async: {
        error: 'Error: Package inaccessible',
        version: null,
      },
    })

    stub.restore()
  })

  it('local file urls should be ignored', async () => {
    const result = await queryVersions(
      { 'eslint-plugin-internal': 'file:devtools/eslint-rules' },
      { loglevel: 'silent' },
    )
    expect(result).toStrictEqual({})
  })

  it('set the target explicitly to latest', async () => {
    const stub = stubVersions('99.9.9')
    const result = await queryVersions({ async: '1.5.1' }, { target: 'latest', loglevel: 'silent' })
    expect(result).toHaveProperty('async')
    stub.restore()
  })

  it('set the target to greatest', async () => {
    const stub = stubVersions('99.9.9')
    const result = await queryVersions({ async: '1.5.1' }, { target: 'greatest', loglevel: 'silent' })
    expect(result).toHaveProperty('async')
    stub.restore()
  })

  it('return an error for an unsupported target', async () => {
    const a = queryVersions({ async: '1.5.1' }, { target: 'foo', loglevel: 'silent' } as any)
    await expect(a).rejects.toThrow()
  })

  it('returns a cached version without fetching', async () => {
    // the fetch would return 1.0.0, but the cache holds 88.0.0
    const stub = stubVersions('1.0.0')
    const cacher = {
      get: () => ({ version: '88.0.0' }),
      set: () => {},
      getPeers: () => undefined,
      setPeers: () => {},
      save: async () => {},
      log: () => {},
    }
    const result = await queryVersions({ async: '1.5.1' }, { loglevel: 'silent', cacher })
    expect(result).toStrictEqual({ async: { version: '88.0.0' } })
    stub.restore()
  })

  it('npm aliases should upgrade the installed package', async () => {
    const result = await queryVersions(
      {
        request: 'npm:ncu-test-v2@1.0.0',
      },
      { loglevel: 'silent' },
    )
    expect(result).toStrictEqual({
      request: {
        version: 'npm:ncu-test-v2@2.0.0',
      },
    })
  })

  describe('github urls', () => {
    it('github urls should upgrade the embedded version tag', async () => {
      const upgrades = await queryVersions(
        {
          'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2#v1.0.0',
        },
        { loglevel: 'silent' },
      )

      expect(upgrades).toStrictEqual({
        'ncu-test-v2': {
          version: 'https://github.com/raineorshine/ncu-test-v2#v2.0.0',
        },
      })
    })

    it('short github urls should be ignored', async () => {
      const upgrades = await queryVersions(
        {
          'ncu-test-v2': 'raineorshine/ncu-test-v2',
        },
        { loglevel: 'silent' },
      )

      expect(upgrades).toStrictEqual({})
    })

    it('git+https urls should upgrade the embedded version tag', async () => {
      const upgrades = await queryVersions(
        {
          'ncu-test-v2': 'git+https://github.com/raineorshine/ncu-test-v2#v1.0.0',
        },
        { loglevel: 'silent' },
      )

      expect(upgrades).toStrictEqual({
        'ncu-test-v2': {
          version: 'git+https://github.com/raineorshine/ncu-test-v2#v2.0.0',
        },
      })
    })

    it('ignore tags that are not valid versions', async () => {
      // this repo has tag "1.0" which is not a valid version
      const upgrades1 = await queryVersions(
        {
          'ncu-test-invalid-tag': 'raineorshine/ncu-test-invalid-tag.git#v3.0.0',
        },
        { loglevel: 'silent' },
      )

      expect(upgrades1).toStrictEqual({
        'ncu-test-invalid-tag': {
          version: 'raineorshine/ncu-test-invalid-tag.git#v3.0.5',
        },
      })

      // this repo has tag "v0.1.3a" which is not a valid version
      const upgrades2 = await queryVersions(
        {
          'angular-toasty': 'git+https://github.com/raineorshine/ncu-test-v0.1.3a.git#1.0.0',
        },
        { loglevel: 'silent' },
      )

      expect(upgrades2).toStrictEqual({
        'angular-toasty': {
          version: 'git+https://github.com/raineorshine/ncu-test-v0.1.3a.git#1.0.7',
        },
      })
    })

    it('support simple, non-semver tags in the format "v1"', async () => {
      const upgrades = await queryVersions(
        {
          // this repo has tag "1.0" which is not valid semver
          'ncu-test-invalid-tag': 'git+https://github.com/raineorshine/ncu-test-simple-tag#v1',
        },
        { loglevel: 'silent' },
      )

      expect(upgrades).toStrictEqual({
        'ncu-test-invalid-tag': {
          version: 'git+https://github.com/raineorshine/ncu-test-simple-tag#v3',
        },
      })
    })

    it('ignore repos with no tags', async () => {
      const upgrades = await queryVersions(
        {
          // this repo has tag "1.0" which is not valid semver
          'ncu-test-invalid-tag': 'git+https://github.com/raineorshine/ncu-test-no-tags#v1',
        },
        { loglevel: 'silent' },
      )
      expect(upgrades).toStrictEqual({})
    })

    it('valid but nonexistent github urls with tags should be ignored', async () => {
      const upgrades = await queryVersions(
        {
          'ncu-test-alpha': 'git+https://username:dh9dnas0nndnjnjasd4@bitbucket.org/somename/common.git#v283',
          // disable since fetching from a private repo prompts the user for credentials
          // 'ncu-test-private': 'https://github.com/ncu-test/ncu-test-private#v999.9.9',
          'ncu-return-version': 'git+https://raineorshine@github.com/ncu-return-version#v999.9.9',
          'ncu-test-v2': '^1.0.0',
        },
        { loglevel: 'silent' },
      )

      expect(upgrades).toStrictEqual({
        'ncu-test-v2': {
          version: '2.0.0',
        },
      })
    })

    it('github urls should upgrade the embedded semver version range', async () => {
      const upgrades = await queryVersions(
        {
          'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2#semver:^1.0.0',
        },
        { loglevel: 'silent' },
      )

      expect(upgrades).toStrictEqual({
        'ncu-test-v2': {
          version: 'https://github.com/raineorshine/ncu-test-v2#semver:^2.0.0',
        },
      })
    })

    it('github urls should support --target greatest', async () => {
      const upgrades = await queryVersions(
        {
          'ncu-test-greatest-not-newest': 'https://github.com/raineorshine/ncu-test-greatest-not-newest#semver:^1.0.0',
        },
        { loglevel: 'silent', target: 'newest' },
      )

      expect(upgrades).toStrictEqual({
        'ncu-test-greatest-not-newest': {
          version: 'https://github.com/raineorshine/ncu-test-greatest-not-newest#semver:^2.0.0-beta',
        },
      })
    })

    it('github urls should support --target newest', async () => {
      const upgrades = await queryVersions(
        {
          'ncu-test-greatest-not-newest': 'https://github.com/raineorshine/ncu-test-greatest-not-newest#semver:^1.0.0',
        },
        { loglevel: 'silent', target: 'newest' },
      )

      expect(upgrades).toStrictEqual({
        'ncu-test-greatest-not-newest': {
          version: 'https://github.com/raineorshine/ncu-test-greatest-not-newest#semver:^2.0.0-beta',
        },
      })
    })

    it('github urls should support --target minor', async () => {
      const upgrades = await queryVersions(
        {
          'ncu-test-return-version': 'https://github.com/raineorshine/ncu-test-return-version#semver:^0.1.0',
        },
        { loglevel: 'silent', target: 'minor' },
      )

      expect(upgrades).toStrictEqual({
        'ncu-test-return-version': {
          version: 'https://github.com/raineorshine/ncu-test-return-version#semver:^0.2.0',
        },
      })
    })

    it('github urls should support --target patch', async () => {
      const upgrades = await queryVersions(
        {
          'ncu-test-return-version': 'https://github.com/raineorshine/ncu-test-return-version#semver:^1.0.0',
        },
        { loglevel: 'silent', target: 'patch' },
      )

      expect(upgrades).toStrictEqual({
        'ncu-test-return-version': {
          version: 'https://github.com/raineorshine/ncu-test-return-version#semver:^1.0.1',
        },
      })
    })

    it('github urls should not upgrade embedded semver version ranges to prereleases by default', async () => {
      const upgrades = await queryVersions(
        {
          'ncu-test-greatest-not-newest': 'https://github.com/raineorshine/ncu-test-greatest-not-newest#semver:^1.0.0',
        },
        { loglevel: 'silent' },
      )

      expect(upgrades).toStrictEqual({
        'ncu-test-greatest-not-newest': {
          version: 'https://github.com/raineorshine/ncu-test-greatest-not-newest#semver:^1.0.1',
        },
      })
    })

    it('github urls should upgrade embedded semver version ranges to prereleases with --target greatest and newest', async () => {
      const upgradesNewest = await queryVersions(
        {
          'ncu-test-greatest-not-newest': 'https://github.com/raineorshine/ncu-test-greatest-not-newest#semver:^1.0.0',
        },
        { loglevel: 'silent', target: 'newest' },
      )

      expect(upgradesNewest).toStrictEqual({
        'ncu-test-greatest-not-newest': {
          version: 'https://github.com/raineorshine/ncu-test-greatest-not-newest#semver:^2.0.0-beta',
        },
      })

      const upgradesGreatest = await queryVersions(
        {
          'ncu-test-greatest-not-newest': 'https://github.com/raineorshine/ncu-test-greatest-not-newest#semver:^1.0.0',
        },
        { loglevel: 'silent', target: 'greatest' },
      )

      expect(upgradesGreatest).toStrictEqual({
        'ncu-test-greatest-not-newest': {
          version: 'https://github.com/raineorshine/ncu-test-greatest-not-newest#semver:^2.0.0-beta',
        },
      })
    })
  })
})
