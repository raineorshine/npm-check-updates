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

  return should
}

export default chaiSetup
