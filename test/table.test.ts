import { describe, expect, it } from 'vitest'
import table from '../src/lib/table.ts'

describe('table', () => {
  it('renders an HTML table for markdown, converting backticks to <code>', () => {
    const result = table({ markdown: true, rows: [['--foo', 'use `bar`']] })
    expect(result).toContain('<table>')
    expect(result).toContain('<td>--foo</td>')
    expect(result).toContain('<code>bar</code>')
  })

  it('renders a cli-table for the terminal', () => {
    const result = table({ rows: [['--foo', 'description']] })
    expect(result).toContain('--foo')
    expect(result).toContain('description')
  })
})
