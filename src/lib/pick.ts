/** Creates an object composed of the picked `object` properties. */
export function pick<T extends object, U extends keyof T>(obj: T, props: U[]): Pick<T, U> {
  const newObject = {} as Pick<T, U>

  for (const prop of props) {
    newObject[prop] = obj[prop]
  }

  return newObject
}

/**
 * Creates an object composed of the `object` properties `predicate` returns
 * truthy for. The predicate is invoked with two arguments: (value, key).
 */
export function pickBy<R, K extends keyof R>(
  object: R | null | undefined,
  predicate: (value: R[K], key: keyof R) => any,
): Record<K, R[K]> {
  const newObject = {} as Record<K, R[K]>

  for (const [key, value] of Object.entries<R[K]>(object ?? {})) {
    const _key = key as K
    if (predicate(value, _key)) {
      newObject[_key] = value
    }
  }

  return newObject
}
