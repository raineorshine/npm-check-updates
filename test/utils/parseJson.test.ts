import parseJson from '../../src/lib/utils/parseJson'
import chaiSetup from '../helpers/chaiSetup'

chaiSetup()

describe('parseJson', async function () {
  it('handles valid json strings', async () => {
    parseJson('{}').should.deep.equal({})
    parseJson('{"name": "John", "age": 30, "city": "New York"}').should.deep.equal({
      name: 'John',
      age: 30,
      city: 'New York',
    })
  })

  it('handles valid jsonc strings', () => {
    const string1 = `
  {
    "name": "John",
    // Now the age
    "age": 30
}
`
    const string2 = `
      {
        "a": "b",
        /**
         *  Here could be some very important comment, but it's isn't.
         */
        "c": ["d", "e", "f"]
    }
    `
    parseJson(string1).should.deep.equal({ name: 'John', age: 30 })
    parseJson(string2).should.deep.equal({ a: 'b', c: ['d', 'e', 'f'] })
  })

  it('shows descriptive and helpful error messages', () => {
    ;(() => parseJson('{"name": "John", "age": 30, "city": "New York"')).should.throw(SyntaxError)
    ;(() => parseJson('{"name": "John", "age": 30, "city": "New York"')).should.throw(
      SyntaxError,
      'Error at line 1, column 47: CloseBraceExpected\n{"name": "John", "age": 30, "city": "New York"\n                                              ^\n\n',
    )
  })
})
