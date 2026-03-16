import { SpawnOptions } from 'child_process'
import spawn from 'spawn-please'
import { SpawnPleaseOptions } from '../types/SpawnPleaseOptions'

/**
 * Spawn a command. On Windows, prefer `<command>.cmd` but fall back to `<command>` when the
 * `.cmd` shim is not available (e.g. mise, scoop).
 */
async function spawnCommand(
  command: string,
  args: string[],
  spawnPleaseOptions?: SpawnPleaseOptions,
  spawnOptions?: SpawnOptions,
) {
  if (process.platform !== 'win32' || command === 'bun') {
    return spawn(command, args, spawnPleaseOptions, spawnOptions)
  }

  try {
    return spawn(`${command}.cmd`, args, spawnPleaseOptions, spawnOptions)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return spawn(command, args, spawnPleaseOptions, spawnOptions)
    }

    throw e
  }
}

export default spawnCommand
