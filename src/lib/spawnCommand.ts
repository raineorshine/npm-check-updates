import { type SpawnOptions } from 'node:child_process'
import spawn from 'spawn-please'
import { type SpawnPleaseOptions } from '../types/SpawnPleaseOptions.ts'
import { type SpawnResult } from '../types/SpawnResult.ts'

/** Returns the command names to try for a spawned executable. */
export const getSpawnCommands = (command: string, platform: NodeJS.Platform = process.platform) =>
  platform === 'win32' && command !== 'bun' ? [`${command}.cmd`, command] : [command]

/**
 * Spawn a command. On Windows, prefer `<command>.cmd` but fall back to `<command>` when the
 * `.cmd` shim is not available (e.g. mise, scoop).
 */
async function spawnCommand(
  command: string,
  args: string[],
  spawnPleaseOptions?: SpawnPleaseOptions,
  spawnOptions?: SpawnOptions,
): Promise<SpawnResult> {
  const commands = getSpawnCommands(command)

  for (const [index, resolvedCommand] of commands.entries()) {
    try {
      const result = await spawn(resolvedCommand, args, spawnPleaseOptions, spawnOptions)
      return { ...result, command: [resolvedCommand, ...args].join(' ') }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || index === commands.length - 1) {
        throw e
      }
    }
  }

  throw new Error(`No spawn commands available for ${command}`)
}

export default spawnCommand
