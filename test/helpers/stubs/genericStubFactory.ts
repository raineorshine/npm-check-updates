import type { CacheManager, ContextBuilder, DefaultCtx, StubHandler } from '../../types/stubsTypes'
import { MockHandler } from './MockHandler'

/** make sure we get the original function */
function ensureNotMock(fn: unknown, key: string | number | symbol): void {
  if (vi.isMockFunction(fn)) {
    throw new Error(
      `createStub: The function "${key.toString()}" is already mocked. ` +
        `Call createStub BEFORE other mocks or only once.`,
    )
  }
}

/**
 * A specialized factory utility that initializes a `MockHandler` and automatically
 * configures it as a traditional Vitest runtime spy (`vi.spyOn`).
 * It automatically extracts the target function signature from the provided object
 * and key, maintaining absolute type safety across handlers and contexts while
 * encapsulating Vitest's `beforeAll` and `afterAll` spy lifecycles.
 * @template Target The type of the object containing the method to spy on.
 * @template Key The string or symbol key of the method on the target object.
 * @param spyTarget The host object containing the function/method.
 * @param spyKey The specific property key name of the method to spy on.
 * @param [buildContext] Optional transformer to map raw execution arguments to a typed custom context.
 */
export function createStub<
  Target extends Record<string | number | symbol, any>,
  Key extends keyof Target,
  F extends Target[Key] = Target[Key],
  Cache = CacheManager,
  Ctx = DefaultCtx<F, Cache>,
>(spyTarget: Target, spyKey: Key, buildContext?: ContextBuilder<F, Cache, Ctx>) {
  const original = spyTarget[spyKey] as F

  ensureNotMock(original, spyKey)

  const stub = new MockHandler<F, Cache, Ctx>(spyKey.toString(), original, buildContext)

  const originalRegister = stub.register.bind(stub)

  stub.register = (cacheManager: Cache, defaultHandlers?: StubHandler<Ctx, F>[]) => {
    originalRegister(cacheManager, defaultHandlers, instance => {
      return vi.spyOn(spyTarget, spyKey as any).mockImplementation(instance.handleExecution.bind(instance) as any)
    })
  }

  return stub
}
