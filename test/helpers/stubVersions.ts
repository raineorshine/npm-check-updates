import sinon from 'sinon'
import * as npmPackageManager from '../../src/package-managers/npm'
import { MockedVersions } from '../../src/types/MockedVersions'

/** Stubs the npmView function from package-managers/npm. Returns the stub object. Call stub.restore() after assertions to restore the original function. Set spawn:true to stub ncu spawned as a child process. */
const stubVersions = (mockReturnedVersions: MockedVersions, { spawn }: { spawn?: boolean } = {}) => {
  // stub child process
  // the only way to stub functionality in spawned child processes is to pass data through process.env and stub internally
  if (spawn) {
    process.env.STUB_NPM_VIEW = JSON.stringify(mockReturnedVersions)
    return {
      restore: () => {
        process.env.STUB_NPM_VIEW = ''
      },
    }
  }
  // stub module
  else {
    return sinon
      .stub(npmPackageManager, 'fetchUpgradedPackumentMemo')
      .callsFake(npmPackageManager.mockFetchUpgradedPackument(mockReturnedVersions))
  }
}

export default stubVersions
