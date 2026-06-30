import { vi } from 'vitest'
import { npmApi } from '../../src/package-managers/npm.ts'
import { type MockedVersions } from '../../src/types/MockedVersions.ts'

/** Stubs the npmView function from package-managers/npm. Returns the stub object. Call stub.restore() after assertions to restore the original function. Set spawn:true to stub ncu spawned as a child process. */
const stubVersions = (mockReturnedVersions: MockedVersions, { spawn }: { spawn?: boolean } = {}) => {
  // stub child process
  // the only way to stub functionality in spawned child processes is to pass data through process.env and stub internally
  if (spawn) {
    // namespace by worker so parallel vitest workers don't clobber each other
    const stubKey = `STUB_VERSIONS_${process.env.VITEST_POOL_ID ?? '0'}`
    process.env[stubKey] = JSON.stringify(mockReturnedVersions)
    return {
      restore: () => {
        process.env[stubKey] = ''
      },
    }
  }
  // stub module
  else {
    const stub = vi
      .spyOn(npmApi, 'fetchUpgradedPackumentMemo')
      .mockImplementation(npmApi.mockFetchUpgradedPackument(mockReturnedVersions))
    return {
      restore: () => {
        stub.mockRestore()
      },
    }
  }
}

export default stubVersions
