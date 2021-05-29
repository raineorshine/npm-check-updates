function mergeArrays(arr1, arr2) {
  return [...new Set([...arr1 || [], ...arr2 || []])]
}

/**
 * Shallow merge (specific or all) properties.
 * If some properties both are arrays, then merge them also.
 */
function mergeOptions(options1, options2) {
  options1 = options1 || {}
  options2 = options2 || {}
  const result = { ...options1, ...options2 }
  Object.keys(result).forEach(key => {
    if (Array.isArray(options1[key]) && Array.isArray(options2[key])) {
      result[key] = mergeArrays(options1[key], options2[key])
    }
  })
  return result
}

module.exports = mergeOptions
