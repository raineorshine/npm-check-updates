/**
 * A minimal async mutex used to serialize access to a shared resource.
 *
 * Why this exists:
 * ----------------
 * runNcuCli mutates global process state (argv, env, stdin, stdout, stderr, exit).
 * If two CLI calls run at the same time inside the same Node process, they will
 * corrupt each other. Vitest runs tests in parallel threads, but inside each thread
 * we must guarantee that only ONE CLI invocation runs at a time.
 *
 * This mutex ensures:
 * - runNcuCli() calls never overlap
 * - Promise.all([runCli(), runCli()]) is safe
 * - no race conditions corrupt stdout/stderr or exit mocks
 * - no nondeterministic failures
 *
 * This implementation is intentionally tiny, dependency‑free, and extremely fast.
 */
export function createMutex() {
  let locked = false
  const queue: (() => void)[] = []

  /**
   * Acquire the lock.
   *
   * If the mutex is free, lock immediately.
   * If locked, wait until the current holder releases it.
   */
  async function acquire(): Promise<void> {
    if (!locked) {
      locked = true
      return
    }

    // Wait until release() resolves this promise
    await new Promise<void>(resolve => {
      queue.push(resolve)
    })
  }

  /**
   * Release the lock.
   *
   * If other callers are waiting, wake the next one.
   * Otherwise mark the mutex as unlocked.
   */
  function release(): void {
    const next = queue.shift()

    if (next) {
      // Wake the next waiter
      next()
    } else {
      // No waiters → unlock
      locked = false
    }
  }

  return { acquire, release }
}

/**
 * Singleton mutex instance used by runNcuCli().
 * Only one CLI call may run at a time inside a single process.
 */
export const cliMutex = createMutex()
