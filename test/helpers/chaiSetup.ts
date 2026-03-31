import { config, should as initShould, use } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Global chai setup. */
const chaiSetup = () => {
  // In Chai 5+, should() is an imported function that initializes the prototype
  const should = initShould()

  // Use the named 'use' function instead of 'chai.use'
  use(chaiAsPromised)
  use(chaiString)

  // do not truncate strings in error messages
  config.truncateThreshold = 0

  process.env.NCU_TESTS = 'true'

  return should
}

/**
 * A helper to simulate __dirname in ESM.
 * Must be called as: getDirname(import.meta.url)
 */
export const getDirname = (importMetaUrl: string) => dirname(fileURLToPath(importMetaUrl))

export default chaiSetup
