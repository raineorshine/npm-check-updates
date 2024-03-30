import { MockedVersions } from '../../src/types/MockedVersions.js'

/** Stubs the npmView function from package-managers/npm. Call stub.restore() after assertions to restore the original function. Works even when running npm-check-updates as a child process. */
const stubVersions = (mockReturnedVersions: MockedVersions) => {
  // the only way to stub functionality in spawned child processes is to pass data through process.env and stub internally
  process.env.STUB_VERSIONS = JSON.stringify(mockReturnedVersions)
  return {
    restore: () => {
      process.env.STUB_VERSIONS = ''
    },
  }
}

export default stubVersions
