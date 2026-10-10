import { type Index } from '../types/IndexType.ts'
import { type VersionResult } from '../types/VersionResult.ts'
import keyValueBy from './keyValueBy.ts'

/** Extracts the publish times and the versions withheld by cooldown or ignore rules from version results. */
const getCooldownInfo = (results: Index<VersionResult>) => {
  const time = keyValueBy(results, (key, result) => {
    const time = result.time ?? result.cooldownInfo?.currentVersionTime
    return time ? { [key]: time } : null
  })
  const skippedByCooldown = keyValueBy(results, (key, result) =>
    result.cooldownInfo ? { [key]: result.cooldownInfo } : null,
  )
  const skippedByIgnore = keyValueBy(results, (key, result) =>
    result.ignoreInfo ? { [key]: result.ignoreInfo } : null,
  )
  return { time, skippedByCooldown, skippedByIgnore, numCooldown: Object.keys(skippedByCooldown).length }
}

export default getCooldownInfo
