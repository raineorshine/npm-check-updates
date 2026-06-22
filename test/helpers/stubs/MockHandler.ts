import type { CacheManager, DefaultCtx, MockSpyInstance, StubHandler } from '../../types/stubsTypes'

/**
 * A standalone, generic routing and state execution engine designed to manage
 * the lifecycle, cache context, and middleware execution chain of an intercepted
 * function or module.
 * @template F The type of the function being mocked or spied upon.
 * @template Cache The type of the cache manager instance, defaults to `CacheManager`.
 * @template Ctx The evaluation context type passed down to execution handlers.
 */
export class MockHandler<F extends (...args: any[]) => any, Cache = CacheManager, Ctx = DefaultCtx<F, Cache>> {
  public handlers: StubHandler<Ctx, F>[] = []
  public key: string = ''
  public realOriginal: F
  public spyInstance: MockSpyInstance | null = null

  private currentCacheManager: Cache | null = null
  private buildContextFn?: (input: DefaultCtx<F, Cache>) => Ctx

  constructor(key: string, realOriginal: F, buildContextFn?: (input: DefaultCtx<F, Cache>) => Ctx) {
    this.key = key
    this.realOriginal = realOriginal
    this.buildContextFn = buildContextFn
  }

  public use(handler: StubHandler<Ctx, F>): void {
    this.handlers.push(handler)
  }

  public useFirst(handler: StubHandler<Ctx, F>): void {
    this.handlers.unshift(handler)
  }

  public setCache(manager: Cache): void {
    this.currentCacheManager = manager
  }

  public clearHandlers(): void {
    this.handlers = []
    this.currentCacheManager = null
  }

  public restore(): void {
    this.clearHandlers()
    if (this.spyInstance) {
      this.spyInstance.mockRestore()
      this.spyInstance = null
    }
  }

  public async handleExecution(...args: Parameters<F>): Promise<Awaited<ReturnType<F>>> {
    const payload: DefaultCtx<F, Cache> = {
      raw: args,
      original: this.realOriginal,
      cache: this.currentCacheManager ?? undefined,
    }

    // Safely deduce context matching ContextBuilder rules
    const ctx = this.buildContextFn ? this.buildContextFn(payload) : (payload as unknown as Ctx)

    for (const handler of this.handlers) {
      const result = await handler(ctx)
      if (result !== undefined) return result
    }

    return await this.realOriginal(...args)
  }

  public register(
    cacheManager: Cache,
    defaultHandlers: StubHandler<Ctx, F>[] = [],
    setupMockFn?: (instance: this) => MockSpyInstance | null,
  ): void {
    beforeAll(() => {
      this.clearHandlers()
      for (const handler of defaultHandlers) {
        this.use(handler)
      }
      this.setCache(cacheManager)

      if (setupMockFn && !this.spyInstance) {
        this.spyInstance = setupMockFn(this)
      }
    })

    afterAll(() => {
      this.restore()
    })
  }
}
