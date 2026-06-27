/** A function that renders extended help for an option. */
type ExtendedHelp = string | ((options: { markdown?: boolean }) => string)

export type { ExtendedHelp as default }
