import { ParseError, ParseErrorCode, parse } from 'jsonc-parser'

/**
 * Parses a json string, while also handling errors and comments.
 *
 * @param jsonString - target json string.
 * @returns the parsed json object.
 */
export default function parseJson(jsonString: string) {
  const errors: ParseError[] = []
  const json = parse(jsonString, errors)

  if (errors.length > 0) {
    let errorString = ''
    const lines = jsonString.split('\n')
    for (const error of errors) {
      const offset = error.offset
      let lineNumber = 1
      let columnNumber = 1
      let currentOffset = 0
      // Calculate line and column from the offset
      for (const line of lines) {
        if (currentOffset + line.length >= offset) {
          columnNumber = offset - currentOffset + 1
          break
        }
        currentOffset += line.length + 1 // +1 for the newline character
        lineNumber++
      }
      // @ts-expect-error due to --isolatedModules forbidding to implement ambient constant enums.
      errorString += `Error at line ${lineNumber}, column ${columnNumber}: ${ParseErrorCode[error.error]}\n${lines[lineNumber - 1]}\n${' '.repeat(columnNumber - 1)}^\n\n`
    }

    throw new SyntaxError(errorString)
  }
  return json
}
