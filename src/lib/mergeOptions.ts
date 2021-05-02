import { Options } from '../types'

type OptionKey = keyof Options

/** Merges two arrays into one, removing duplicates. */
function mergeArrays(arr1: any[], arr2: any[]) {
  return Array.from(new Set([...arr1 || [], ...arr2 || []]))
}

/**
 * Shallow merge (specific or all) properties.
 * If some properties both are arrays, then merge them also.
 */
function mergeOptions(options1: Options, options2: Options) {
  options1 = options1 || {}
  options2 = options2 || {}
  const result = { ...options1, ...options2 }
  ;(Object.keys(result) as OptionKey[]).forEach(key => {
    if (Array.isArray(options1[key]) && Array.isArray(options2[key])) {
      result[key] = mergeArrays(options1[key] as any[], options2[key] as any[]) as any
    }
  })
  return result
}

export default mergeOptions
