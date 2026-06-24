/**
 * Global error‑handling utilities for npm‑check‑updates.
 *
 * This module provides:
 * - A shared global state (using a Symbol) to track whether error handlers
 * have already been installed in the current Node process.
 * - A flag indicating whether any unhandled rejection occurred.
 * - A function to install global error handlers exactly once per process,
 * even when the module is imported multiple times (CLI, library mode, tests).
 *
 * Vitest workers, CLI entrypoints, and library consumers may all load this file.
 * Using a Symbol ensures the state is shared safely without polluting globals.
 */

const NCU_GLOBAL = Symbol.for('ncu.global')

type NcuGlobalState = {
  /**
   * Whether global error handlers have already been installed.
   * Prevents duplicate listeners and MaxListenersExceededWarning.
   */
  hasErrorHandlers: boolean

  /**
   * Tracks whether any unhandled rejection occurred.
   * The CLI uses this to exit with a non‑zero code at process end,
   * while still allowing all errors to be printed first.
   */
  unhandledRejectionError: boolean
}

const g = globalThis as any

// Initialize shared global state once per process
if (!g[NCU_GLOBAL]) {
  g[NCU_GLOBAL] = {
    hasErrorHandlers: false,
    unhandledRejectionError: false,
  } satisfies NcuGlobalState
}

export const errorState = g[NCU_GLOBAL] as NcuGlobalState

/**
 * Installs global error handlers exactly once per process.
 *
 * These handlers:
 * - Log unhandled rejections and uncaught exceptions immediately.
 * - Mark that an unhandled rejection occurred, so the CLI can exit with an error.
 * - Do NOT rethrow, allowing multiple errors to be printed before exit.
 *
 * Safe to call from multiple modules — only installs once.
 */
export function installGlobalErrorHandlers() {
  if (errorState.hasErrorHandlers) return

  errorState.hasErrorHandlers = true

  process.on('unhandledRejection', reason => {
    console.error('[Unhandled Rejection]:', reason)
    errorState.unhandledRejectionError = true
  })

  process.on('uncaughtException', error => {
    console.error('[Uncaught Exception]:', error)
    errorState.unhandledRejectionError = true
  })
}
