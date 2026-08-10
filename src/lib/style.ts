/*

This styleText wrapper allows synchronous style.COLOR(...) syntax with special support for:

1) force color everywhere
2) disable color everywhere

Call styleInit(color) at the beginning of execution and the style instance will be available everywhere.

It is a hacky solution, but it is the easiest way to import and pass the color option to all call sites without brutalizing the syntax.

*/
import { styleText } from 'node:util'
import keyValueBy from './keyValueBy.ts'

type StyleMethod = {
  (s: any): string
  bold: (s: any) => string
  underline: (s: any) => string
}

const styleNames = {
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

type StyleName = keyof typeof styleNames
type Styles = Record<StyleName, StyleMethod>

/** Builds the full set of style methods from a formatter. */
const buildStyles = (format: (names: StyleName[], s: any) => string): Styles =>
  keyValueBy(styleNames, name => {
    const styleName = name as StyleName
    return {
      [name]: Object.assign((s: any) => format([styleName], s), {
        bold: (s: any) => format([styleName, 'bold'], s),
        underline: (s: any) => format([styleName, 'underline'], s),
      }),
    }
  }) as Styles

/** Styles a string. validateStream is off because styleText re-runs color detection on every call. */
const paint = (names: StyleName[], s: string) => styleText(names, s, { validateStream: false })

/**
 * styleText throws on non-strings and leaves the style open across newlines, unlike chalk.
 * Styling each line separately keeps it out of the borders boxen and cli-table draw.
 */
const stylize = (names: StyleName[], value: any): string => {
  const text = String(value)
  if (text === '') return text
  if (!text.includes('\n')) return paint(names, text)
  return text
    .split(/(\r?\n)/)
    .map(part => (part === '' || part === '\n' || part === '\r\n' ? part : paint(names, part)))
    .join('')
}

const stylesOn = buildStyles(stylize)
const stylesOff = buildStyles((_names, s) => String(s))

// a global instance that can optionally force or ignore color
let styleInstance: Styles | undefined

/** Returns whether stdout supports color. process.stdout.getColorDepth is undefined when piped, so probe styleText instead. */
const colorSupported = () => styleText('red', 'x') !== 'x'

/** Returns a style instance based on the provided color option. Only undefined auto-detects. */
export const getStyle = (color?: boolean | null): Styles =>
  color === undefined ? (colorSupported() ? stylesOn : stylesOff) : color ? stylesOn : stylesOff

/** Initializes the global style instance with an optional flag for forced color. Idempotent. */
export const styleInit = (color?: boolean | null) => {
  styleInstance = getStyle(color)
}

/** Asserts that the global style instance has been initialized. */
const assertStyle = () => {
  if (!styleInstance) {
    throw new Error('Style has not been initialized yet.')
  }
}

const styleGlobal = keyValueBy(styleNames, name => {
  /** Applies the style using the global instance. */
  const method = (s: any) => {
    assertStyle()
    return styleInstance![name as StyleName](s)
  }

  method.bold = (s: any) => {
    assertStyle()
    return styleInstance![name as StyleName].bold(s)
  }

  method.underline = (s: any) => {
    assertStyle()
    return styleInstance![name as StyleName].underline(s)
  }

  return { [name]: method as StyleMethod }
}) as Styles

export default styleGlobal
