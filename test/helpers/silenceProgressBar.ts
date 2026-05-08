import ProgressBar from 'progress'
import Sinon from 'sinon'

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
    Sinon.stub(ProgressBar.prototype, 'render'),
    Sinon.stub(ProgressBar.prototype, 'tick'),
    Sinon.stub(ProgressBar.prototype, 'update'),
  ]

  afterEach(() => {
    stubs.forEach(s => s.restore())
  })
}
