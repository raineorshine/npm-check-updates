import type { Formatters } from '../lib/formatters'

/** A function that renders extended help for an option. */
type ExtendedHelp = string | ((formatters: Formatters) => string)

export default ExtendedHelp
