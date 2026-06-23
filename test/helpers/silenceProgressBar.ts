import ProgressBar from 'progress'
import { afterEach, vi } from 'vitest'

/**
 * Silences the ProgressBar for the current test only.
 *
 * Use this helper in tests where:
 * - `loglevel` is NOT "silent" or "verbose"
 * - and the ProgressBar would normally write to stdout
 *
 * This prevents terminal noise while still allowing the test
 * to run normally. All stubs are automatically restored after
 * the test finishes.
 */
export function silenceProgressBar() {
  const stubs = [
    vi.spyOn(ProgressBar.prototype, 'render').mockImplementation(() => {}),
    vi.spyOn(ProgressBar.prototype, 'tick').mockImplementation(() => {}),
    vi.spyOn(ProgressBar.prototype, 'update').mockImplementation(() => {}),
  ]

  afterEach(() => {
    for (const s of stubs) {
      s.mockRestore()
    }
  })
}
