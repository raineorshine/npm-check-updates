import type { Formatters } from '../lib/formatters'

/** A function that renders extended help for an option. */
type ExtendedHelp = string | ((options: { markdown: boolean } & Formatters) => string)

export default ExtendedHelp
