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
 *
 * Always spawns with rejectOnError: spawn-please attaches no error listener without it, so a spawn
 * error crashes the process and the promise never settles. Non-zero exits are swallowed here instead.
 */
async function spawnCommand(
  command: string,
  args: string[],
  spawnPleaseOptions: SpawnPleaseOptions = {},
  spawnOptions?: SpawnOptions,
): Promise<SpawnResult> {
  const commands = getSpawnCommands(command)
  const { rejectOnError = true, stdout: onStdout, stderr: onStderr, ...rest } = spawnPleaseOptions

  for (const [index, resolvedCommand] of commands.entries()) {
    // spawn-please discards its own output when it rejects
    let stdout = ''
    let stderr = ''

    try {
      const result = await spawn(
        resolvedCommand,
        args,
        {
          ...rest,
          rejectOnError: true,
          stdout: (data: string) => {
            stdout += data
            onStdout?.(data)
          },
          stderr: (data: string) => {
            stderr += data
            onStderr?.(data)
          },
        },
        spawnOptions,
      )
      return { ...result, command: [resolvedCommand, ...args].join(' ') }
    } catch (e) {
      // a non-zero exit rejects with stderr as a string; a spawn error rejects with an Error
      if (!(e instanceof Error)) {
        if (rejectOnError) throw e
        return { stdout, stderr, command: [resolvedCommand, ...args].join(' ') }
      }

      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || index === commands.length - 1) {
        throw e
      }
    }
  }

  throw new Error(`No spawn commands available for ${command}`)
}

export default spawnCommand
