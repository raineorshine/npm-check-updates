import { AsyncLocalStorage } from 'node:async_hooks'
import { format, formatWithOptions } from 'node:util'
import { vi } from 'vitest'
import { getOutputHeader } from './testNameStore'

type ActiveBuffers = { stdout: string; stderr: string; general: string }
const buffersStore = new AsyncLocalStorage<ActiveBuffers>()

/** Get the current active buffers for this async context */
function getActiveBuffers(): ActiveBuffers | undefined {
  return buffersStore.getStore()
}

/**
 * Get the effective buffer to use.
 * Checks: active context > cached buffers > current buffers
 * Note: AsyncLocalStorage automatically cleans up when context exits.
 */
function getEffectiveBuffer(currentBuf: ActiveBuffers, cachedBuf: ActiveBuffers | null): ActiveBuffers {
  return getActiveBuffers() || cachedBuf || currentBuf
}

/**
 * Custom signaling class to cleanly pass successful early exits (like --help or --version)
 * back through the asynchronous control flow chain.
 */
export class ExitSuccessSignal extends Error {
  constructor() {
    super('Process exited successfully')
    this.name = 'ExitSuccessSignal'
  }
}

/** Detect logs that are not part of the output */
function isGeneralLog(text: string): boolean {
  const patterns = [
    // Must be at the start
    /^NCU_DEBUG:/,

    // Can be anywhere
    /Warning: (?:Label|No such label) '.*' (?:already exists for console\.time\(\)|for console\.timeEnd\(\))/,
    /MaxListenersExceededWarning/,
    /trace-warnings/,
    /DeprecationWarning/,
    /ExperimentalWarning/,
  ]

  return patterns.some(pattern => pattern.test(text))
}

/** for internal text  */
export const uiAccent = (text: string) => `\x1b[2m\x1b[37m${text}\x1b[22m\x1b[39m`

/**
 * Replaces global console methods with interceptors.
 * Should be called once in vitest.setup.ts.
 */
export function startGlobalIOCapture() {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    time: console.time,
    timeEnd: console.timeEnd,
    trace: console.trace,
  }

  type LogMethod = keyof typeof original

  /** console log mock */
  const mockedConsoleLog = (method: LogMethod, ...a: any[]) => {
    const coloredText = formatWithOptions({ colors: true }, ...a) + '\n'
    const activeBuffers = getActiveBuffers()
    if (activeBuffers) {
      const targetBuffer = method === 'warn' || method === 'error' ? 'stderr' : 'stdout'
      const plainText = formatWithOptions({ colors: false }, ...a)
      if (isGeneralLog(plainText)) {
        activeBuffers.general += coloredText
      } else {
        activeBuffers[targetBuffer] += plainText + '\n'
      }
    } else {
      const header = getOutputHeader() ?? ''
      if (header) {
        original.log(uiAccent(header))
      }
      const text = coloredText.replace(/NCU_DEBUG/g, uiAccent('NCU_DEBUG'))
      if (method === 'warn' || method === 'error') {
        original.error(text)
      } else {
        original.log(text)
      }
    }
  }

  const restoreConsole = [
    vi.spyOn(console, 'log').mockImplementation((...a) => mockedConsoleLog('log', ...a)),
    vi.spyOn(console, 'info').mockImplementation((...a) => mockedConsoleLog('info', ...a)),
    vi.spyOn(console, 'warn').mockImplementation((...a) => mockedConsoleLog('warn', ...a)),
    vi.spyOn(console, 'error').mockImplementation((...a) => mockedConsoleLog('error', ...a)),

    // Traces → general
    vi.spyOn(console, 'trace').mockImplementation((...a) => {
      const activeBuffers = getActiveBuffers()
      if (activeBuffers) {
        activeBuffers.general += `[trace] ${format(...a)}\n`
      } else {
        original.error(...a)
      }
    }),
  ]

  return {
    mockRestore() {
      for (const spy of restoreConsole) {
        if (spy && typeof spy.mockRestore === 'function') {
          spy.mockRestore()
        }
      }
    },
  }
}

/**
 * Registers beforeEach/afterEach to install global IO capture.
 * Call this once from vitest.setup.ts.
 */
export const mockIO = {
  register() {
    let mock: { mockRestore(): void }

    beforeEach(() => {
      mock = startGlobalIOCapture()
    })

    afterEach(() => {
      mock.mockRestore()
    })
  },
}

/**
 * Activates log capturing for the duration of the test.
 */
export function captureCliIO() {
  const buffers: ActiveBuffers = { stdout: '', stderr: '', general: '' }
  let finalBuffers: ActiveBuffers | null = null

  const writeStdout = vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
    const text = typeof chunk === 'string' ? chunk : format(chunk)
    const active = getActiveBuffers() || buffers
    if (isGeneralLog(text)) active.general += text
    else active.stdout += text
    return true
  })

  const writeStderr = vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
    const text = typeof chunk === 'string' ? chunk : format(chunk)
    const active = getActiveBuffers() || buffers
    if (isGeneralLog(text)) active.general += text
    else active.stderr += text
    return true
  })

  const exitMock = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null): never => {
    const active = getActiveBuffers() || buffers
    if (code && code !== 0) {
      const msg = active.stderr.trim() || `CLI exited with code ${code}`
      const err = new Error(msg)
      Error.captureStackTrace(err, exitMock)
      throw err
    }
    throw new ExitSuccessSignal()
  })

  /** activate buffer for this run */
  async function captureDuring(fn: () => Promise<void>) {
    return buffersStore.run(buffers, fn)
  }

  /** return stdout stderr to the test */
  function result() {
    const buf = getEffectiveBuffer(buffers, finalBuffers)
    return { stdout: buf.stdout, stderr: buf.stderr }
  }

  /** restore all mocks */
  function restore() {
    finalBuffers = { ...(getActiveBuffers() || buffers) }
    writeStdout.mockRestore()
    writeStderr.mockRestore()
    exitMock.mockRestore()
  }

  return {
    captureDuring,
    result,
    get stdout() {
      return result().stdout
    },
    get stderr() {
      return result().stderr
    },
    get general() {
      const buf = getEffectiveBuffer(buffers, finalBuffers)
      return buf.general
    },
    restore,
  }
}
