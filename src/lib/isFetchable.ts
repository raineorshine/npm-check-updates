import { type VersionSpec } from '../types/VersionSpec'
import isPackageManagerProtocol from './isPackageManagerProtocol'

/** Returns true if the dependency spec is not fetchable from the registry and is ignored. */
function isFetchable(spec: VersionSpec): boolean {
  return (
    !isPackageManagerProtocol(spec) &&
    // short github urls that are ignored, e.g. raineorshine/foo
    !/^[^/:@]+\/\w+/.test(spec)
  )
}

export default isFetchable
