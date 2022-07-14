/*

This chalk wrapper allows synchronous chalk.COLOR(...) syntax with special support for:

1) dynamic import as pure ESM module
2) force color on all instances

Call await chalkInit(color) at the beginning of execution and the chalk instance will be available everywhere.

It is a hacky solution, but it is the easiest way to import and pass the color option to all chalk instances without brutalizing the syntax.

*/
import keyValueBy from './keyValueBy'

type ChalkMethod = ((s: any) => string) & { bold: (s: any) => string }

// a Promise of a chalk instance that can optionally force color
let chalkInstance: Record<keyof typeof chalkMethods, ChalkMethod>

/** Initializes the global chalk instance with an optional flag for forced color. Idempotent. */
export const chalkInit = async (color?: boolean) => {
  const chalkModule = await import('chalk')
  const { default: chalkDefault, Chalk } = chalkModule
  chalkInstance = color ? new Chalk({ level: 1 }) : chalkDefault
}

/** Asserts that chalk has been imported. */
const assertChalk = () => {
  if (!chalkInstance) {
    throw new Error(
      `Chalk has not been imported yet. Chalk is a dynamic import and requires that you await { chalkInit } from './lib/chalk'.`,
    )
  }
}

const chalkMethods = {
  blue: true,
  bold: true,
  cyan: true,
  gray: true,
  green: true,
  magenta: true,
  red: true,
  yellow: true,
}

// generate an async method for each chalk method that calls a chalk instance with global.color for forced color
const chalkGlobal = keyValueBy(chalkMethods, name => {
  /** Chained bold method. */
  const bold = (s: any) => {
    assertChalk()
    return chalkInstance[name as keyof typeof chalkInstance].bold(s)
  }
  /** Chalk method. */
  const method = (s: any) => {
    assertChalk()
    return chalkInstance[name as keyof typeof chalkInstance](s)
  }
  method.bold = bold
  return {
    [name]: method,
  }
}) as Record<keyof typeof chalkMethods, ChalkMethod>

export default chalkGlobal
