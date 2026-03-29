import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'

/** Global chai setup. */
const chaiSetup = () => {
  const should = chai.should()
  chai.use(chaiAsPromised)
  chai.use(chaiString)

  // do not truncate strings in error messages
  chai.config.truncateThreshold = 0

  process.env.NCU_TESTS = 'true'

  // --- NODE 25 / MOCHA MEMORY LEAK WORKAROUND ---
  // Increase the limit to 50 to handle multiple 'exit' listeners added
  // by Mocha and ncu's run() function across a large test suite.
  process.setMaxListeners(50)

  return should
}

export default chaiSetup
