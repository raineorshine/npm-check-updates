export default function pickBy<T>(
  object: Record<string, T> | null | undefined,
  predicate: (value: T, key: string) => any,
): Record<string, T> {
  const newObject: Record<string, T> = {}

  for (const [key, value] of Object.entries(object ?? {})) {
    if (predicate(value, key)) {
      newObject[key] = value
    }
  }

  return newObject
}
