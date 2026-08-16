import { type Index } from '../types/IndexType.ts'
import { type VersionResult } from '../types/VersionResult.ts'
import keyValueBy from './keyValueBy.ts'

/** Extracts the publish times and the versions withheld by cooldown from version results. */
const getCooldownInfo = (results: Index<VersionResult>) => {
  const time = keyValueBy(results, (key, result) => {
    const time = result.time ?? result.cooldownInfo?.currentVersionTime
    return time ? { [key]: time } : null
  })
  const skippedByCooldown = keyValueBy(results, (key, result) =>
    result.cooldownInfo ? { [key]: result.cooldownInfo } : null,
  )
  return { time, skippedByCooldown, numCooldown: Object.keys(skippedByCooldown).length }
}

export default getCooldownInfo
