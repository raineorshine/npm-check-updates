import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as bun from '../../src/package-managers/bun.ts'
import chaiSetup from '../helpers/chaiSetup.ts'
import { testFail, testPass } from '../helpers/doctorHelpers.ts'
import stubVersions from '../helpers/stubVersions.ts'

chaiSetup()
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const mockNpmVersions = {
  emitter20: '2.0.0',
  'ncu-test-return-version': '2.0.0',
  'ncu-test-tag': '1.1.0',
  'ncu-test-v2': '2.0.0',
}

describe('bun', function () {
  // Use a synchronous check to fail the suite immediately if bun is missing
  before('check-environment', function () {
    const result = spawnSync('bun', ['--version'], {
      shell: true,
      encoding: 'utf8',
    })

    // On Windows, if 'bun' is missing, status is 1 and error is null.
    // On Linux, if 'bun' is missing, status is 127 and error is null.
    if (result.status !== 0 || result.error) {
      const details = result.stderr?.trim() || result.error?.message || 'Unknown error'

      throw new Error(
        `Required executable 'bun' not found in PATH.\n` +
          `To run these tests, please install Bun: https://bun.sh/docs/installation\n` +
          `System Error: ${details}`,
      )
    }
  })

  it('list', async () => {
    const result = await bun.list({ cwd: __dirname })
    result.should.have.property('ncu-test-v2')
  })

  it('latest', async () => {
    const { version } = await bun.latest('ncu-test-v2', '1.0.0', { cwd: __dirname })
    version!.should.equal('2.0.0')
  })

  it('packageAuthorChanged', async () => {
    await bun.packageAuthorChanged('mocha', '^7.1.0', '8.0.1', { cwd: __dirname }).should.eventually.equal(true)
    await bun
      .packageAuthorChanged('htmlparser2', '^3.10.1', '^4.0.0', { cwd: __dirname })
      .should.eventually.equal(false)
    await bun.packageAuthorChanged('ncu-test-v2', '^1.0.0', '2.2.0', { cwd: __dirname }).should.eventually.equal(false)
  })

  it('getPeerDependencies', async () => {
    const spawnOptions = { cwd: __dirname }
    await bun.getPeerDependencies('ncu-test-return-version', '1.0.0', spawnOptions).should.eventually.deep.equal({})
    await bun.getPeerDependencies('ncu-test-peer', '1.0.0', spawnOptions).should.eventually.deep.equal({
      'ncu-test-return-version': '1.x',
    })
  })

  it('getEngines', async () => {
    await bun.getEngines('del', '2.0.0', { cwd: __dirname }).should.eventually.deep.equal({ node: '>=0.10.0' })
    await bun.getEngines('ncu-test-return-version', '1.0.0', { cwd: __dirname }).should.eventually.deep.equal({})
    await bun.getEngines('ncu-test-return-version', '9999.0.0', { cwd: __dirname }).should.eventually.be.rejected
  })

  describe('doctor', function () {
    this.timeout(3 * 60 * 1000)

    let stub: { restore: () => void }
    before(() => (stub = stubVersions(mockNpmVersions, { spawn: true })))
    after(() => stub.restore())

    testPass({ packageManager: 'bun' })
    testFail({ packageManager: 'bun' })
  })
})
