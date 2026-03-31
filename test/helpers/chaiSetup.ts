import { config, should as initShould, use } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'

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

  // --- NODE 25 / MOCHA MEMORY LEAK WORKAROUND ---
  // Increase the limit to 50 to handle multiple 'exit' listeners added
  // by Mocha and ncu's run() function across a large test suite.
  process.setMaxListeners(50)

  return should
}

export default chaiSetup
