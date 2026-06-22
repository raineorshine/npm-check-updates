import { type MockInstance, type TestContext } from 'vitest'
import { type TestSandbox } from '../helpers/TestSandbox'

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface MockInstance<T = any> {
    mockRestore(): void
    mockRestore(context?: TestContext): void
  }
}

declare global {
  type MockImplementation<T> = Parameters<MockInstance<T>>[0]
  var sandbox: TestSandbox
}

export {}
