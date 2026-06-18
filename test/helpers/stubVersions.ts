import sinon from 'sinon'
import { npmApi } from '../../src/package-managers/npm.ts'
import { type MockedVersions } from '../../src/types/MockedVersions.ts'

/** Stubs the npmView function from package-managers/npm. Returns the stub object. Call stub.restore() after assertions to restore the original function. Set spawn:true to stub ncu spawned as a child process. */
const stubVersions = (mockReturnedVersions: MockedVersions, { spawn }: { spawn?: boolean } = {}) => {
  // stub child process
  // the only way to stub functionality in spawned child processes is to pass data through process.env and stub internally
  if (spawn) {
    // namespace by worker so parallel mocha workers don't clobber each other
    const stubKey = `STUB_VERSIONS_${process.env.MOCHA_WORKER_ID ?? '0'}`
    process.env[stubKey] = JSON.stringify(mockReturnedVersions)
    return {
      restore: () => {
        process.env[stubKey] = ''
      },
    }
  }
  // stub module
  else {
    return sinon
      .stub(npmApi, 'fetchUpgradedPackumentMemo')
      .callsFake(npmApi.mockFetchUpgradedPackument(mockReturnedVersions))
  }
}

export default stubVersions
