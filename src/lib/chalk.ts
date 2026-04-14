/*

This chalk wrapper allows synchronous chalk.COLOR(...) syntax with special support for:

1) force color on all instances
2) disable color on all instances

Call await chalkInit(color) at the beginning of execution and the chalk instance will be available everywhere.

It is a hacky solution, but it is the easiest way to import and pass the color option to all chalk instances without brutalizing the syntax.

*/
import chalkDefault, { Chalk } from 'chalk'
import keyValueBy from './keyValueBy'

// Updated type to ensure the function itself has the chaining properties
type ChalkMethod = {
  (s: any): string
  bold: (s: any) => string
  underline: (s: any) => string
}

const chalkMethods = {
  blue: true,
  bold: true,
  cyan: true,
  dim: true,
  gray: true,
  green: true,
  magenta: true,
  red: true,
  reset: true,
  underline: true,
  yellow: true,
}

// A chalk instance that passes strings through as-is, without color. Used with color: null. */
const chalkNoop = keyValueBy(chalkMethods, name => ({
  [name]: Object.assign((s: any) => s.toString(), {
    bold: (s: any) => s.toString(),
    underline: (s: any) => s.toString(),
  }),
})) as Record<keyof typeof chalkMethods, ChalkMethod>

// a global instance of a chalk instance that can optionally force or ignore color
let chalkInstance: Record<keyof typeof chalkMethods, any>

/** Returns a chalk instance based on the provided color option. */
export const getChalk = (color?: boolean | null) => {
  return color === true ? new Chalk({ level: 1 }) : color === null ? chalkNoop : chalkDefault
}

/** Initializes the global chalk instance with an optional flag for forced color. Idempotent. */
export const chalkInit = (color?: boolean | null) => {
  chalkInstance = getChalk(color)
}

/** Asserts that chalk has been imported. */
const assertChalk = () => {
  if (!chalkInstance) {
    throw new Error(`Chalk has not been imported yet.`)
  }
}

const chalkGlobal = keyValueBy(chalkMethods, name => {
  /**
   * A proxy method that applies the chalk style to the given input.
   * Ensures that the global chalk instance is initialized before execution.
   */
  const method = (s: any) => {
    assertChalk()
    return chalkInstance[name as keyof typeof chalkInstance](s)
  }

  method.bold = (s: any) => {
    assertChalk()
    return chalkInstance[name as keyof typeof chalkInstance].bold(s)
  }

  method.underline = (s: any) => {
    assertChalk()
    return chalkInstance[name as keyof typeof chalkInstance].underline(s)
  }

  return { [name]: method as ChalkMethod }
}) as Record<keyof typeof chalkMethods, ChalkMethod>

export default chalkGlobal
