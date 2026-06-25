/** Type guard that narrows an unknown value to a string. */
const isString = (x: unknown): x is string => typeof x === 'string'

export default isString
