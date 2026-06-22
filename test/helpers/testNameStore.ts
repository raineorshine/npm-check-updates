import { AsyncLocalStorage } from 'node:async_hooks'

const store = new AsyncLocalStorage<{ name: string; fullName: string; header: string }>()

/**
 * Lifecycle hook wrapper for Vitest to capture and track the active test's metadata.
 * Uses Node's `AsyncLocalStorage` to expose the test context deeply across asynchronous call stacks
 * without explicitly passing context parameters down your function chains.
 */
export const testNameStore = {
  /** Registers the `aroundEach` hook. Must be called early inside `vitest.setup.ts`. */
  register() {
    aroundEach(async (runTest, context) => {
      const fileName = context.task.file?.name ?? 'unknown'
      const testName = context.task.name ?? 'unknown'
      const fullTestName = context.task.fullTestName ?? 'unknown'
      const header = `${fileName} > ${testName}`

      return store.run({ name: testName, fullName: fullTestName, header }, async () => {
        await runTest()
      })
    })
  },
}

const errorMsg = 'called outside of a test context. Ensure testNameStore.register() runs early in vitest.setup.ts.'

/** Returns the short name of the currently running test. */
export function getTestName() {
  const storeValue = store.getStore()
  if (!storeValue) {
    throw new Error(`getTestName ${errorMsg}`)
  }
  return storeValue.name
}

/** Returns the fully qualified name (including parent suites) of the currently running test. */
export function getFullTestName() {
  const storeValue = store.getStore()
  if (!storeValue) {
    throw new Error(`getFullTestName ${errorMsg}`)
  }
  return storeValue.fullName
}

/** Returns a formatted string combining the filename and test name for console/logging output headers. */
export function getOutputHeader() {
  const storeValue = store.getStore()
  if (!storeValue) {
    throw new Error(`getOutputHeader ${errorMsg}`)
  }
  return storeValue.header
}
