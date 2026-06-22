import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../../')
const normalizedRoot = projectRoot.replace(/\\/g, '/')

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'

export const packageManagerLockfiles: Record<PackageManager, string> = {
  npm: 'package-lock.json',
  yarn: 'yarn.lock',
  pnpm: 'pnpm-lock.yaml',
  bun: 'bun.lock',
}

/** replacing dynamic system data with static placeholders */
function sanitize(output: string): string {
  if (!output) return output
  return (
    output
      // Remove npm log paths (e.g., ...\_logs\2026-05-31...-debug-0.log)
      .replace(/C:\\.*\\_logs\\[^ ]+\.log/g, '<NPM_LOG_PATH>')
      // Remove Node process IDs (e.g., (node:8260))
      .replace(/\(node:\d+\)/g, '(node:<PID>)')
      // Remove dynamic timestamps often found in log paths or messages
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}_\d{3}Z/g, '<TIMESTAMP>')
      // Remove every single box‑drawing character
      .replace(/[\u2500-\u257F]/g, '')
  )
}

/** Tokenizes absolute developer paths to safe forward-slashed placeholders */
function serializeTokens(value: string): string {
  /** make safe value for regex  */
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  if (!value) return value
  const normalized = value.replace(/\\+(?!["'])/g, '/')
  const rootA = escapeRegex(normalizedRoot)
  const rootB = escapeRegex(sandbox.cwd)
  const rootRegex = new RegExp(`${rootA}|${rootB}`, 'g')
  return normalized.replace(rootRegex, '<ROOT>')
}

/**
 * Applies both sanitization and tokenization:
 * Replaces dynamic system data (log paths, PIDs, timestamps)
 * Normalizes and tokenizes absolute developer paths to %root%
 */
export function sanitizeAndSerialize(value: string): string {
  if (!value) return value
  const sanitized = sanitize(value)
  return serializeTokens(sanitized)
}

/**
 * Normalizes a command by stripping OS-specific executable extensions (.cmd, .exe, .bat)
 * and replace absolute developer paths in arguments to safe forward-slashed placeholders
 */
export function normalizeCommand(command: string, args: string[] = [], _spawnPleaseOptions?: any, _options?: any) {
  const normalized = { command: command.replace(/\.(cmd|exe|bat)$/i, ''), args: args.map(serializeTokens), key: '' }
  /** make readable cache key */
  const quoteIfNeeded = (s: string) => (s.includes(' ') ? JSON.stringify(s) : s)
  normalized.key =
    args.length > 0
      ? `command: ${normalized.command}, args: ${normalized.args.map(quoteIfNeeded).join(' :: ')}`
      : `command: ${normalized.command}, args: <none>`

  return normalized
}

/**
 * Recursively sorts all object keys to produce a fully deterministic structure.
 *
 * This is used when generating test fixtures to ensure that the serialized output
 * is stable across runs, regardless of how JavaScript chooses to order object keys.
 *
 * Behavior:
 * - Objects: keys are sorted alphabetically, and values are processed recursively.
 * - Arrays: preserved as-is, but each element is processed recursively.
 * - Primitives (string, number, boolean, null, undefined): returned unchanged.
 *
 * The result is a deeply normalized object whose JSON.stringify() output is
 * guaranteed to be consistent, making fixture comparisons reliable and preventing
 * unnecessary file rewrites caused by key-order differences.
 */
export function sortObjectDeep(value: any): any {
  if (Array.isArray(value)) {
    return value.map(sortObjectDeep)
  }

  if (value !== null && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = sortObjectDeep(value[key])
          return acc
        },
        {} as Record<string, any>,
      )
  }

  return value
}

// Unique error code for sandbox cwd violations
export const SANDBOX_CWD_ERROR = Symbol('SANDBOX_CWD_ERROR')

/**
 * Ensures that a spawned child process receives a proper cwd.
 * This is required because Vitest workers cannot change the real OS cwd,
 * and process.cwd() is mocked only inside the worker, not in child processes.
 */
export function ensureChildProcessCwd(cmd: string, args?: string[], _spawnPleaseOptions?: any, options?: any) {
  if (options?.cwd) {
    return
  }

  throw Object.assign(
    new Error(
      [
        `Sandbox violation: a child process was started without a "cwd".`,
        ``,
        `Vitest runs tests inside worker threads, and workers cannot change the real`,
        `OS working directory. We mock process.cwd() to point to the sandbox, but this`,
        `mock affects only the test worker — not child processes.`,
        ``,
        `A child process without an explicit { cwd } will run in the REAL project`,
        `directory instead of the sandbox.`,
        ``,
        `Fix: ensure the tested function passes { cwd: sandbox.cwd } (or inject it in`,
        `your wrapper before calling spawn/execFile).`,
        ``,
        `Command executed:`,
        `  ${cmd} ${args?.join(' ') || ''}`,
      ].join('\n'),
    ),
    { code: SANDBOX_CWD_ERROR },
  )
}
