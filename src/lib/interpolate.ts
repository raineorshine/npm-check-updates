import { type Index } from '../types/IndexType.ts'

/** Safely interpolates a string as a template string. Supports `${VAR}`, `${VAR-fallback}` and `${VAR:-fallback}`. */
const interpolate = (s: string, data: Index<string | undefined>): string =>
  s.replaceAll(/\$\{(\w+)(?:(:)?-([^}]*))?\}/g, (_match, key, colon, fallback = '') => {
    const value = data[key]
    // ${VAR:-fallback} uses the fallback when unset or empty; ${VAR-fallback} only when unset
    return colon ? value || fallback : (value ?? fallback)
  })

export default interpolate
