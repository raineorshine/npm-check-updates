/**
 * Quotes a global package install spec (e.g. `@scope/name@version`) if it would otherwise be misinterpreted by a shell.
 *
 * PowerShell interprets `@` at the start of a token as the splatting operator. When the scope contains a `.`
 * (e.g. `@bomb.sh/tab`), PowerShell parses `@bomb` as a splat reference followed by member access `.sh`, which
 * throws a ParserError. Wrapping such specs in double quotes makes them paste-safe across supported shells.
 */
const quoteGlobalPackageSpec = (spec: string): string =>
  // quote scoped specs whose scope (the portion between `@` and `/`) contains a `.`
  /^@[^/]*\./.test(spec) ? `"${spec}"` : spec

export default quoteGlobalPackageSpec
