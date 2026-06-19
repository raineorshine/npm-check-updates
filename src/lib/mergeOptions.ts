import { type Options } from '../types/Options.ts'

type OptionKey = keyof Options

/** Merges two arrays into one, removing duplicates. */
function mergeArrays<T>(arr1: T[], arr2: T[]): T[] {
  return [...new Set([...(arr1 || []), ...(arr2 || [])])]
}

/**
 * Shallow merge (specific or all) properties.
 * If some properties both are arrays, then merge them also.
 */
function mergeOptions(rawOptions1: Options | null, rawOptions2: Options | null) {
  const options1: Options = rawOptions1 || {}
  const options2: Options = rawOptions2 || {}
  const result = { ...options1, ...options2 }

  for (const key of Object.keys(result) as OptionKey[]) {
    if (Array.isArray(options1[key]) && Array.isArray(options2[key])) {
      ;(result as Record<OptionKey, unknown>)[key] = mergeArrays(options1[key] as unknown[], options2[key] as unknown[])
    }
  }
  return result
}

export default mergeOptions
