import { describe, expect, it } from 'vitest'
import parseJson from '../src/lib/utils/parseJson.ts'

describe('parseJson', () => {
  it('handles valid json strings', () => {
    expect(parseJson('{}')).toStrictEqual({})
    expect(parseJson('{"name": "John", "age": 30, "city": "New York"}')).toStrictEqual({
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
    expect(parseJson(string1)).toStrictEqual({ name: 'John', age: 30 })
    expect(parseJson(string2)).toStrictEqual({ a: 'b', c: ['d', 'e', 'f'] })
  })

  it('shows descriptive and helpful error messages', () => {
    expect(() => parseJson('{"name": "John", "age": 30, "city": "New York"')).toThrow(SyntaxError)
    expect(() => parseJson('{"name": "John", "age": 30, "city": "New York"')).toThrow(
      'Error at line 1, column 47: CloseBraceExpected\n{"name": "John", "age": 30, "city": "New York"\n                                              ^\n\n',
    )
  })

  it('shows a snippet of code surrounded by 4 surrounding lines', () => {
    const string = `{
      "test": {
          "a": test
        }
  }`
    expect(() => parseJson(string)).toThrow(
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
    expect(() => parseJson(string)).toThrow(
      `Error at line 5, column 1: CloseBraceExpected
          "a": 5
        }
<empty>
^`,
    )
  })
})
