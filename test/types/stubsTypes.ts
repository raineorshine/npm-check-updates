import type spawnPleaseDefault from 'spawn-please'
import { type TestCacheManager } from '../helpers/TestCacheManager'

export type CacheManager = TestCacheManager

// BuildContext: transforms raw args → typed context
export type DefaultCtx<F extends (...args: any) => any, Cache = CacheManager> = {
  raw: Parameters<F>
  original: F
  cache: Cache | undefined
}

export type ContextBuilder<F extends (...args: any) => any, Cache, Ctx> = (input: DefaultCtx<F, Cache>) => Ctx

export type StubHandler<Ctx, F extends (...args: any) => any> = (
  ctx: Ctx,
) => Awaited<ReturnType<F>> | undefined | Promise<Awaited<ReturnType<F>> | undefined>

export type MockSpyInstance = ReturnType<typeof vi.spyOn>

export type SpawnPlease = typeof spawnPleaseDefault

export type BaseSpawnCtx = DefaultCtx<typeof spawnPleaseDefault>

export type SpawnCtx = BaseSpawnCtx & {
  command: string
  args: string[]
  key: string
}
