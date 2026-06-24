import { TestSandbox } from '../helpers/TestSandbox'

/** global setup  */
export function setup() {
  // teardown
  return async () => {
    await TestSandbox.finalCleanup()
  }
}
