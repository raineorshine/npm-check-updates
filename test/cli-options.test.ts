import cliOptions from '../src/cli-options'
import chaiSetup from './helpers/chaiSetup'

chaiSetup()

describe('cli-options', () => {
  it('require long and description properties', () => {
    cliOptions.forEach(option => {
      option.should.have.property('long')
      option.should.have.property('description')
    })
  })
})
