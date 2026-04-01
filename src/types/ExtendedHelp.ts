/** A function that renders extended help for an option. */
type ExtendedHelp =
  | string
  | ((options: {
      /** If true, the help is going to be rendered in a markdown-compatible environment, i.e. README.md. Use the isomorphic code formatters for easy formatting without checking `markdown` every time. */
      markdown: boolean
      /** Isomorphically formats code as inline code. Renders `code` in markdown and plain text in the CLI. */
      codeInline: (code: string) => string
      /** Isomorphically formats code as a block. Renders ```\ncode\n``` in markdown and indented text in the CLI. */
      codeBlock: (code: string) => string
      /** Isomorphically renders a table. Renders an HTML table in markdown and a CLI table in the CLI. */
      table: (options: { rows: string[][]; colAligns?: ('left' | 'right')[] }) => string
      /** Isomorphically pads. No-op in markdown, indents in CLI. */
      padLeft: (s: string, n: number) => string
    }) => string)

export default ExtendedHelp
