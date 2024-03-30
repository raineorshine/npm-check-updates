import cliOptions from '../src/cli-options.js'
import chaiSetup from './helpers/chaiSetup.js'

chaiSetup()

describe('cli-options', () => {
  it('require long and description properties', () => {
    cliOptions.forEach(option => {
      option.should.have.property('long')
      option.should.have.property('description')
    })
  })
})
