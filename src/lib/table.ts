import Table from 'cli-table3'
import wrap from './wrap'

/** Wraps the second column in a list of 2-column cli-table rows. */
const wrapRows = (rows: string[][]) => rows.map(([col1, col2]) => [col1, wrap(col2)])

/** Renders an HTML row. */
const row = (cells: string[]) => '\n  <tr>' + cells.map(cell => `<td>${cell}</td>`).join('') + '</tr>'

/** Renders a table for the CLI or markdown. */
const table = ({
  colAligns,
  markdown,
  rows,
}: {
  colAligns?: ('left' | 'right')[]
  markdown?: boolean
  rows: string[][]
}): string => {
  // return HTML table for Github-flavored markdown
  if (markdown) {
    return `<table>${rows.map(row).join('')}\n</table>`
  }
  // otherwise use cli-table3
  else {
    const t = new Table({ ...(colAligns ? { colAligns } : null) })
    // eslint-disable-next-line fp/no-mutating-methods
    t.push(...(markdown ? rows : wrapRows(rows)))
    return t.toString()
  }
}

export default table
