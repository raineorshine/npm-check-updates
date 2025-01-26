import { ParseError, ParseErrorCode, parse, stripComments } from 'jsonc-parser'

const stdoutColumns = process.stdout.columns || 80

/**
 * Ensures the code line or a hint is always displayed for the code snippet.
 * If the line is empty, it outputs `<empty>`.
 * If the line is larger than a line of the terminal windows, it will display as too big. This also prevents minified json files
 * to be displayed in the snippet.
 *
 * @param line - target line to check.
 * @returns either the hint or the actual line for the code snippet.
 */
function ensureLineDisplay(line: string): string {
  if (!line.length) return '<empty>\n'
  return line.length > stdoutColumns ? '<line too long to display>\n' : `${line}\n`
}

/**
 * Builds a marker line to point to the position of the found error.
 *
 * @param length - positions to the right of the error line.
 * @returns the marker line.
 */
function getMarker(length: number): string {
  return `${' '.repeat(length - 1)}^\n`
}

/**
 * Builds a json code snippet to mark and contextualize the found error.
 * This snippet consists off 5 lines and the erroneous line is always in the middle.
 *
 * @param lines - all lines of the json file.
 * @param errorLine - erroneous line.
 * @param columnNumber - the error position inside the line.
 * @returns the entire code snippet.
 */
function showSnippet(lines: string[], errorLine: number, columnNumber: number): string {
  const len = lines.length
  if (len === 0) return '<empty>'
  if (len === 1) return `${ensureLineDisplay(lines[0])}${getMarker(columnNumber)}`
  // Show an area of lines around the error line for a more detailed snippet.
  const snippetEnd = Math.min(errorLine + 2, len)
  let snippet = ''
  for (let i = Math.max(errorLine - 2, 1); i <= snippetEnd; i++) {
    // Lines in the output are counted starting from one, so choose the previous line
    snippet += ensureLineDisplay(lines[i - 1])
    if (i === errorLine) snippet += getMarker(columnNumber)
  }
  return `${snippet}\n`
}

/**
 * Parses a json string, while also handling errors and comments.
 *
 * @param jsonString - target json string.
 * @returns the parsed json object.
 */
export default function parseJson(jsonString: string) {
  jsonString = stripComments(jsonString)
  try {
    return JSON.parse(jsonString)
  } catch {
    const errors: ParseError[] = []
    const json = parse(jsonString, errors)

    // If no errors were found, just return the parsed json file
    if (errors.length === 0) return json
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
      errorString += `Error at line ${lineNumber}, column ${columnNumber}: ${ParseErrorCode[error.error]}\n${showSnippet(lines, lineNumber, columnNumber)}\n`
    }
    throw new SyntaxError(errorString)
  }
}
