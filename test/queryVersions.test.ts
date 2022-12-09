import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import queryVersions from '../src/lib/queryVersions'
import stubNpmView from './helpers/stubNpmView'

chai.should()
chai.use(chaiAsPromised)
process.env.NCU_TESTS = 'true'

describe('queryVersions', function () {
  it('valid single package', async () => {
    const stub = stubNpmView('99.9.9')
    const latestVersions = await queryVersions({ async: '1.5.1' }, { loglevel: 'silent' })
    latestVersions.should.have.property('async')
    stub.restore()
  })

  it('valid packages', async () => {
    const stub = stubNpmView('99.9.9')
    const latestVersions = await queryVersions({ async: '1.5.1', npm: '3.10.3' }, { loglevel: 'silent' })
    latestVersions.should.have.property('async')
    latestVersions.should.have.property('npm')
    stub.restore()
  })

  it('unavailable packages should be ignored', async () => {
    const result = await queryVersions({ abchdefntofknacuifnt: '1.2.3' }, { loglevel: 'silent' })
    result.should.deep.equal({})
  })

  it('local file urls should be ignored', async () => {
    const result = await queryVersions(
      { 'eslint-plugin-internal': 'file:devtools/eslint-rules' },
      { loglevel: 'silent' },
    )
    result.should.deep.equal({})
  })

  it('set the target explicitly to latest', async () => {
    const stub = stubNpmView('99.9.9')
    const result = await queryVersions({ async: '1.5.1' }, { target: 'latest', loglevel: 'silent' })
    result.should.have.property('async')
    stub.restore()
  })

  it('set the target to greatest', async () => {
    const stub = stubNpmView('99.9.9')
    const result = await queryVersions({ async: '1.5.1' }, { target: 'greatest', loglevel: 'silent' })
    result.should.have.property('async')
    stub.restore()
  })

  it('return an error for an unsupported target', () => {
    const a = queryVersions({ async: '1.5.1' }, { target: 'foo', loglevel: 'silent' } as any)
    return a.should.be.rejected
  })

  it('npm aliases should upgrade the installed package', async () => {
    const result = await queryVersions(
      {
        request: 'npm:ncu-test-v2@1.0.0',
      },
      { loglevel: 'silent' },
    )
    result.should.deep.equal({
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

      upgrades.should.deep.equal({
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

      upgrades.should.deep.equal({})
    })

    it('git+https urls should upgrade the embedded version tag', async () => {
      const upgrades = await queryVersions(
        {
          'ncu-test-v2': 'git+https://github.com/raineorshine/ncu-test-v2#v1.0.0',
        },
        { loglevel: 'silent' },
      )

      upgrades.should.deep.equal({
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

      upgrades1.should.deep.equal({
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

      upgrades2.should.deep.equal({
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

      upgrades.should.deep.equal({
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
      upgrades.should.deep.equal({})
    })

    it('valid but non-existent github urls with tags should be ignored', async () => {
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

      upgrades.should.deep.equal({
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

      upgrades.should.deep.equal({
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

      upgrades.should.deep.equal({
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

      upgrades.should.deep.equal({
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

      upgrades.should.deep.equal({
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

      upgrades.should.deep.equal({
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

      upgrades.should.deep.equal({
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

      upgradesNewest.should.deep.equal({
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

      upgradesGreatest.should.deep.equal({
        'ncu-test-greatest-not-newest': {
          version: 'https://github.com/raineorshine/ncu-test-greatest-not-newest#semver:^2.0.0-beta',
        },
      })
    })
  })
})
