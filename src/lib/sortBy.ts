/**
 * Creates an array of elements, sorted in ascending order by the results of
 * running each element in a collection through each iteratee. This method
 * performs a stable sort, that is, it preserves the original sort order of
 * equal elements. The iteratees are invoked with one argument: (value).
 */
export function sortBy<T>(collection: T[] | null | undefined, selector: (item: T) => any): T[] {
  if (!collection) return []
  return collection
    .map(item => ({ item, key: selector(item) }))
    .sort((a, b) => (a.key > b.key ? 1 : a.key < b.key ? -1 : 0))
    .map(({ item }) => item)
}
