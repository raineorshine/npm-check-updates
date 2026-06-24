import { type RunnerTestFile } from 'vitest'
import { npmApi } from '../../src/package-managers/npm'
import { type MockedVersions } from '../../src/types/MockedVersions'
import { registerStub, stubRegistry } from './stubs/stubVersionsSetup'

/**
 * Stubs for npmApi (fetchUpgradedPackumentMemo, fetchPartialPackument, spawn mode).
 *
 * - Each stub registers itself using registerStub() from stubVersionsSetup.ts.
 * - Tests should NOT call mockRestore() manually; cleanup is automatic.
 * - Do not call stubVersions() twice in the same test.
 *
 * This file imports npmApi; stubVersionsSetup.ts must not.
 */

/**
 * Ensures a test does NOT initialize stubVersions() twice.
 * If it does, we throw with file + test name like before.
 */
function ensureSingleStub(stubName: string) {
  const store = stubRegistry.getStore()
  if (!store) return

  if (store.size > 0) {
    const state = expect.getState()
    const file = { filepath: state.testPath } as RunnerTestFile

    const message =
      `Stub called twice in the same test:\n` +
      `  Stub: ${stubName}\n` +
      `  Test: ${state.currentTestName}\n` +
      `  File: ${file.filepath}\n` +
      `  Fix: A test may only initialize this stub once.`

    throw new Error(message)
  }
}

/**
 * Stubs package version fetching for testing. Returns a stub object.
 * Call `stub.mockRestore()` after assertions to clean up the environment.
 * * @param spawn - Set to `true` if the test mimics or explicitly runs a child process.
 */
const stubVersions = (mockReturnedVersions: MockedVersions, { spawn }: { spawn?: boolean } = {}) => {
  // If running or mimicking a child-process environment, pass mock data through process env.
  // Note: Most tests have been optimized to run in-process, but this flag remains for legacy
  // or explicit multi-process isolation tests.
  //
  // ⚠️ WARNING: Before removing any existing {spawn: true} from calls to stubVersions,
  // make sure that the serialized data passed to stubVersions is compatible with
  // the `npmApi.mockFetchUpgradedPackument` schema.
  if (spawn) {
    process.env.STUB_VERSIONS = JSON.stringify(mockReturnedVersions)
    const stub = {
      mockRestore() {
        // Changed name to match your global find-and-replace
        process.env.STUB_VERSIONS = ''
      },
    }
    registerStub(stub)
    return stub
  }

  ensureSingleStub('stubVersions')

  // Save the original memoized method reference to avoid fast-memoize side effects
  const originalMethod = npmApi.fetchUpgradedPackumentMemo

  // Create a clean standalone Vitest mock function
  const mockFn = vi.fn().mockImplementation(npmApi.mockFetchUpgradedPackument(mockReturnedVersions))

  // Directly overwrite the property on the api object
  npmApi.fetchUpgradedPackumentMemo = mockFn

  const stub = {
    mockRestore() {
      // Cleanly swap the original memoized method back into place
      npmApi.fetchUpgradedPackumentMemo = originalMethod
    },
  }
  registerStub(stub)
  return stub
}

/** Stubs fetchPartialPackument. Returns the stub object. Call stub.mockRestore() after assertions to restore the original function. */
export const stubFetchPartialPackument = (mockReturnedVersions: MockedVersions) => {
  ensureSingleStub('stubFetchPartialPackument')

  const originalMethod = npmApi.fetchPartialPackument

  const mockFn = vi.fn().mockImplementation(npmApi.mockFetchPartialPackument(mockReturnedVersions))

  npmApi.fetchPartialPackument = mockFn

  const stub = {
    mockRestore() {
      npmApi.fetchPartialPackument = originalMethod
    },
  }
  registerStub(stub)
  return stub
}

export default stubVersions
