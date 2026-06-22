import ProgressBar from 'progress'

/**
 * Silences the ProgressBar output during tests.
 *
 * Use this helper in `describe` blocks where:
 * - `loglevel` is NOT "silent" or "verbose"
 * - and the ProgressBar would normally write to stdout
 *
 * Returns a `{ restore }` handle so the caller controls lifecycle.
 * Use inside `beforeEach`/`afterEach` hooks (not inside `it()` bodies),
 * because Vitest does not support registering lifecycle hooks inside test bodies.
 *
 * @example
 * describe('my suite', () => {
 *   let pb: ReturnType<typeof silenceProgressBar>
 *   beforeEach(() => { pb = silenceProgressBar() })
 *   afterEach(() => pb.mockRestore())
 * })
 */
export function silenceProgressBar() {
  const spies = [
    vi.spyOn(ProgressBar.prototype, 'render').mockImplementation(() => {}),
    vi.spyOn(ProgressBar.prototype, 'tick').mockImplementation(() => {}),
    vi.spyOn(ProgressBar.prototype, 'update').mockImplementation(() => {}),
  ]

  return {
    mockRestore() {
      for (const s of spies) {
        s.mockRestore()
      }
    },
  }
}
