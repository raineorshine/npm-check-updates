import fs from 'node:fs'
import path from 'node:path'
import { type BaseSpawnCtx, type CacheManager, type SpawnCtx, type SpawnPlease } from '../../types/stubsTypes'
import { MockHandler } from './MockHandler'
import {
  type PackageManager,
  ensureChildProcessCwd,
  normalizeCommand,
  packageManagerLockfiles,
  sanitizeAndSerialize,
} from './utils'

export type SpawnStubManager = MockHandler<SpawnPlease, CacheManager, SpawnCtx>

/** SpawnCommand context builder */
const buildSpawnContext = ({ raw, original, cache }: BaseSpawnCtx): SpawnCtx => {
  // throw if we are missing cwd in spawnOptions
  ensureChildProcessCwd(...raw)
  return { raw, original, cache, ...normalizeCommand(...raw) }
}

/** mock install command for tests  */
const installHandler = async (ctx: SpawnCtx) => {
  const { command, args, raw } = ctx

  const validLockFile = packageManagerLockfiles[command as PackageManager]
  const isInstall = validLockFile && args.length === 1 && args[0] === 'install'

  if (isInstall) {
    const cwd = raw[3]?.cwd?.toString()
    if (cwd) {
      // Create the empty lockfile and empty node_module
      fs.mkdirSync(path.join(cwd, 'node_modules'), { recursive: true })

      try {
        const lockfilePath = path.join(cwd, validLockFile)
        fs.writeFileSync(lockfilePath, '', { flag: 'wx', encoding: 'utf8' })
      } catch (err: any) {
        // ignore error if the file exist
        if (err.code !== 'EEXIST') {
          throw err
        }
      }
    }
    return { stdout: `stubSpawnCommand for '${command} install' finished successfully.`, stderr: '' }
  }

  return undefined
}

/** cache handler */
const cacheHandler = async (ctx: SpawnCtx) => {
  const { cache, key, original, raw } = ctx
  return cache?.getOrSet('spawnPlease', key, async () => {
    const result = await original(...raw)
    if (result.stdout) result.stdout = sanitizeAndSerialize(result.stdout)
    if (result.stderr) result.stderr = sanitizeAndSerialize(result.stderr)
    return result
  })
}

// It starts with a placeholder function that we will replace inside vi.mock
const handler: SpawnStubManager = new MockHandler(
  'spawnPlease',
  ((..._args: any[]) => Promise.resolve({ stdout: '', stderr: '' })) as SpawnPlease,
  buildSpawnContext,
)

// spy instance for testing
const spy = vi.fn(handler.handleExecution.bind(handler))

/** run in vitest.setup */
export const stubSpawnPlease = {
  register(cacheManager: CacheManager) {
    handler.register(cacheManager, [installHandler, cacheHandler])
  },
  setRealOriginal: (original: SpawnPlease) => {
    handler.realOriginal = original
  },
  spy,
  useFirst: handler.useFirst.bind(handler),
}
