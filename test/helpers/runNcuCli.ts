import path, { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import prompts from 'prompts-ncu'
import { ncuCli } from '../../src/ncuCli'
import { cliMutex } from './createMutex'
import { ExitSuccessSignal, captureCliIO } from './mockIO'

const __dirname = dirname(fileURLToPath(import.meta.url))

const CLI_BIN_PATH = path.join(__dirname, '../../build/cli.js')

type PromptValue = string[] | boolean

interface RunCliOptions {
  cwd?: string
  env?: Record<string, string | undefined>
  inject?: PromptValue[]
  rejectOnError?: boolean
  stdin?: string
  silenceRunnerWarning?: boolean
}

/** shorten error message */
function shorten(p: string) {
  // Show only last 2 path segments for readability
  const parts = p.replace(/\\/g, '/').split('/')
  if (parts.length <= 2) return p
  return `…/${parts.slice(-2).join('/')}`
}

/** Tests must not specify both --cwd and options.cwd */
function validateCwdConflict(args: string[], options: RunCliOptions) {
  if (!options.cwd) return

  const index = args.indexOf('--cwd')
  if (index === -1) return

  const argValue = shorten(args[index + 1])
  const optValue = shorten(options.cwd)

  throw new Error(
    `Conflicting cwd values:\n` +
      `  options.cwd → ${optValue}\n` +
      `  args --cwd → ${argValue}\n\n` +
      `Tests must not specify both. Remove --cwd from args or remove options.cwd.`,
  )
}

/**
 * Executes the NCU CLI in-process for testing.
 * Simulates a full command-line execution by forwarding arguments directly to the
 * application entry point without mutating the global `process.argv`. Captures all
 * standard outputs, intercepts early process exits (such as `--help` or `--version`),
 * and ensures localized directory and environment state cleanup.
 *
 * @param args - Array of CLI arguments to pass to NCU (e.g., `['--jsonAll', '-u']`).
 * @param options - Configuration overrides for environment, working directory, and mock inputs.
 * @returns An object containing the accumulated `stdout` and `stderr` strings.
 */
async function runNcuCliInternal(args: string[] = [], options: RunCliOptions = {}) {
  if (options.cwd) {
    validateCwdConflict(args, options)
    args.push('--cwd', options.cwd)
  }

  const original = {
    argv: process.argv,
    env: { ...process.env },
    stdin: process.stdin,
  }

  if (options.env) Object.assign(process.env, options.env)
  if (options.inject) prompts.inject(options.inject)

  process.argv = ['node', CLI_BIN_PATH, ...args]

  if (args.includes('--stdin')) {
    const stdinSource = options.stdin !== undefined ? [options.stdin] : []
    const mockStdin = Readable.from(stdinSource)
    // @ts-expect-error - Node internal stream compatibility
    mockStdin.isTTY = false
    Object.defineProperty(process, 'stdin', { value: mockStdin, configurable: true })
  }

  const io = captureCliIO()

  try {
    await io.captureDuring(() => ncuCli())
    return io.result()
  } catch (error: any) {
    const isSuccessSignal = error instanceof ExitSuccessSignal
    if (!isSuccessSignal && typeof error === 'string' && error.startsWith('Exceeded global timeout')) {
      // ⏳ runUpgrades() continues running in the background after the global timeout fires.
      // It may still emit console logs even after runNcuCli() has already rejected.
      // Give the background task a brief window to flush its pending logs before assertions run.
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    if (options.rejectOnError !== false && !isSuccessSignal) {
      throw error
    }
    return io.result()
  } finally {
    io.restore()

    try {
      process.argv = original.argv
      Object.defineProperty(process, 'stdin', { value: original.stdin, configurable: true })
      for (const key in options.env) {
        if (key in original.env) {
          process.env[key] = original.env[key]
        } else {
          delete process.env[key]
        }
      }
    } catch (error) {
      console.warn('⚠️ Error during state restoration:', error)
    }

    if (io.general.trim() && !options.silenceRunnerWarning) {
      console.log(io.general.trim())
    }
  }
}

/**
 * Serialized wrapper around runNcuCliInternal().
 *
 * Why this wrapper exists:
 * ------------------------
 * runNcuCliInternal mutates global process state (argv, env, stdin, stdout,
 * stderr, exit). Running two CLI calls at the same time inside the same process
 * would corrupt each other.
 *
 * The mutex ensures that only ONE CLI invocation runs at a time, even if the
 * test calls Promise.all([runCli(), runCli()]).
 */
export async function runNcuCli(args: string[] = [], options: RunCliOptions = {}) {
  await cliMutex.acquire()
  try {
    return await runNcuCliInternal(args, options)
  } finally {
    cliMutex.release()
  }
}
