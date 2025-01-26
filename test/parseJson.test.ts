import parseJson from '../src/lib/utils/parseJson'
import chaiSetup from './helpers/chaiSetup'

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
         *  Here could be some very important comment, but there is none.
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

  it('shows a snippet of code surrounded by 4 surrounding lines', () => {
    const string = `{
      "test": {
          "a": test
        }
  }`
    ;(() => parseJson(string)).should.throw(
      SyntaxError,
      `Error at line 3, column 16: InvalidSymbol
{
      "test": {
          "a": test
               ^
        }
  }


Error at line 4, column 9: ValueExpected
      "test": {
          "a": test
        }
        ^
  }

`,
    )
  })

  it('show an empty line hint', () => {
    // This string misses the last bracket, but since the line is '', it would show nothing.
    const string = `{
      "test": {
          "a": 5
        }
`
    ;(() => parseJson(string)).should.throw(
      SyntaxError,
      `Error at line 5, column 1: CloseBraceExpected
          "a": 5
        }
<empty>
^`,
    )
  })
})
