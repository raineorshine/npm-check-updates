import tableLib from './table'

/** Pads the left side of each line in a string. */
const padLeftRaw = (s: string, n: number) =>
  s
    .split('\n')
    .map(line => `${''.padStart(n, ' ')}${line}`)
    .join('\n')

/** Creates isomorphic formatters that render differently for markdown vs CLI. */
const formatters = (markdown: boolean) => ({
  /** Formats code as inline code. Renders `code` in markdown and plain text in the CLI. */
  codeInline: (code: string) => (markdown ? `\`${code}\`` : code),

  /** Formats code as a block. Renders ```\ncode\n``` in markdown and indented text in the CLI. */
  codeBlock: (code: string) =>
    `${markdown ? '```js\n' : ''}${padLeftRaw(code, markdown ? 0 : 4)}${markdown ? '\n```' : ''}`,

  /** Renders a table. Renders an HTML table in markdown and a CLI table in the CLI. */
  table: (options: { rows: string[][]; colAligns?: ('left' | 'right')[] }) => tableLib({ ...options, markdown }),

  /** Pads the left side of text. No-op in markdown, indents in CLI. */
  padLeft: (s: string, n: number) => padLeftRaw(s, markdown ? 0 : n),
})

export type Formatters = ReturnType<typeof formatters>

export default formatters
