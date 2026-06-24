import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as npm from '../../../src/package-managers/npm'
import { type MockedVersions } from '../../../src/types/MockedVersions'
import stubVersions, { stubFetchPartialPackument } from '../../helpers/stubVersions'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('npm', function () {
  let versionStub: { mockRestore: () => void }
  afterEach(() => {
    versionStub?.mockRestore()
  })

  it('list', async () => {
    const versionObject = await npm.list({ cwd: __dirname })
    versionObject.should.have.property('express')
  })

  it('latest', async () => {
    versionStub = stubVersions('2.0.0')
    const { version } = await npm.latest('express', '', { cwd: __dirname })
    parseInt(version!, 10).should.be.above(1)
  })

  it('greatest', async () => {
    versionStub = stubVersions('2.0.0-beta')
    const { version } = await npm.greatest('ncu-test-greatest-not-newest', '', { pre: true, cwd: __dirname })
    version!.should.equal('2.0.0-beta')
  })

  it('ownerChanged', async () => {
    const stub = stubFetchPartialPackument({
      mocha: {
        version: '8.0.1',
        versions: {
          '7.1.0': { _npmUser: { name: 'author-a' } },
          '8.0.1': { _npmUser: { name: 'author-b' } },
        },
      },
      htmlparser2: {
        version: '4.0.0',
        versions: {
          '3.10.1': { _npmUser: { name: 'author-a' } },
          '4.0.0': { _npmUser: { name: 'author-a' } },
        },
      },
      'ncu-test-v2': {
        version: '2.2.0',
        versions: {
          '1.0.0': { _npmUser: { name: 'author-a' } },
          '2.2.0': { _npmUser: { name: 'author-a' } },
        },
      },
    } as MockedVersions)
    try {
      await npm.packageAuthorChanged('mocha', '^7.1.0', '8.0.1').should.eventually.equal(true)
      await npm.packageAuthorChanged('htmlparser2', '^3.10.1', '^4.0.0').should.eventually.equal(false)
      await npm.packageAuthorChanged('ncu-test-v2', '^1.0.0', '2.2.0').should.eventually.equal(false)
    } finally {
      stub.mockRestore()
    }
  })

  it('getPeerDependencies', async () => {
    const spawnOptions = { cwd: __dirname }
    await npm.getPeerDependencies('ncu-test-return-version', '1.0.0', spawnOptions).should.eventually.deep.equal({})
    await npm.getPeerDependencies('ncu-test-peer', '1.0.0', spawnOptions).should.eventually.deep.equal({
      'ncu-test-return-version': '1.x',
    })
  })

  it('getEngines', async () => {
    const stub = stubFetchPartialPackument({
      del: {
        version: '2.0.0',
        engines: { node: '>=0.10.0' },
      },
      'ncu-test-return-version': {
        version: '1.0.0',
        engines: {},
      },
    } as MockedVersions)
    try {
      await npm.getEngines('del', '2.0.0').should.eventually.deep.equal({ node: '>=0.10.0' })
      await npm.getEngines('ncu-test-return-version', '1.0.0').should.eventually.deep.equal({})
      await npm
        .getEngines('ncu-test-return-version', '1.0')
        .should.eventually.be.rejectedWith('404 Not Found - GET https://registry.npmjs.org/ncu-test-return-version/1.0')
    } finally {
      stub.mockRestore()
    }
  })
})
