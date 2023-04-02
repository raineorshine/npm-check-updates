/** Wraps a string by inserting newlines every n characters. Wraps on word break. Default: 92 chars. */
const wrap = (s: string, maxLineLength = 92) => {
  /* eslint-disable fp/no-mutating-methods */
  const linesIn = s.split('\n')
  const linesOut: string[] = []
  linesIn.forEach(lineIn => {
    let i = 0
    if (lineIn.length === 0) {
      linesOut.push('')
      return
    }

    // eslint-disable-next-line fp/no-loops
    while (i < lineIn.length) {
      const lineFull = lineIn.slice(i, i + maxLineLength + 1)

      // if the line is within the line length, push it as the last line and break
      const lineTrimmed = lineFull.trimEnd()
      if (lineTrimmed.length <= maxLineLength) {
        linesOut.push(lineTrimmed)
        break
      }

      // otherwise, wrap before the last word that exceeds the wrap length
      // do not wrap in the middle of a word
      // reverse the string and use match to find the first non-word character to wrap on
      const wrapOffset =
        lineFull
          .split('')
          .reverse()
          .join('')
          // add [^\W] to not break in the middle of --registry
          .match(/[ -][^\W]/)?.index || 0
      const line = lineFull.slice(0, lineFull.length - wrapOffset)

      // make sure we do not end up in an infinite loop
      if (line.length === 0) break

      linesOut.push(line.trimEnd())
      i += line.length
    }
    i = 0
  })
  return linesOut.join('\n').trim()
}

export default wrap
