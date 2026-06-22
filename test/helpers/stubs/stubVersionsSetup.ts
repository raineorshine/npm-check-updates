import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Stub lifecycle for stubVersions only.
 *
 * - aroundEach creates a fresh Set for each test.
 * - stubVersions.ts registers its stubs into this Set.
 * - After each test, all registered stubs are restored automatically.
 *
 * This file must NOT import npmApi or any app code.
 * It only manages the lifecycle; stubVersions.ts provides the actual stubs.
 */

export const stubRegistry = new AsyncLocalStorage<Set<{ mockRestore: () => void }>>()
/** call from each stub to register it */
export function registerStub(stub: { mockRestore: () => void }) {
  const store = stubRegistry.getStore()
  if (!store) {
    throw new Error('registerStub() called outside of test context')
  }
  store.add(stub)
}

/**
 * Registers the lifecycle that restores all stubs after each test.
 */
export const stubVersionsSetup = {
  register() {
    aroundEach(async runTest => {
      const set = new Set<{ mockRestore: () => void }>()

      return stubRegistry.run(set, async () => {
        await runTest()
        const store = stubRegistry.getStore()
        if (!store) return

        for (const stub of store) {
          try {
            stub.mockRestore()
          } catch {
            // ignore restore errors
          }

          // Prevent double-restore warnings
          stub.mockRestore = () => {}
        }
      })
    })
  },
}
