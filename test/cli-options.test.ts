import chai from 'chai'
import cliOptionsSorted from '../src/cli-options'

chai.should()

describe('cli-options', () => {

  it('require long and description properties', () => {
    cliOptionsSorted.forEach(option => {
      option.should.have.property('long')
      option.should.have.property('description')
    })
  })

})
