import spawn from 'spawn-please'
import keyValueBy from '../lib/keyValueBy'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { Version } from '../types/Version'
import { list as npmList } from './npm'

// return type of pnpm ls --json
type PnpmList = {
  path: string
  private: boolean
  dependencies: Index<{
    from: string
    version: Version
    resolved: string
  }>
}[]

/** Fetches the list of all installed packages. */
export const list = async (options: Options = {}): Promise<Index<string | undefined>> => {
  // use npm for local ls
  if (!options.global) return npmList(options)

  const cmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const result = JSON.parse(await spawn(cmd, ['ls', '-g', '--json'])) as PnpmList
  const list = keyValueBy(result[0].dependencies || {}, (name, { version }) => ({
    [name]: version,
  }))
  return list
}

export {
  defaultPrefix,
  distTag,
  getPeerDependencies,
  greatest,
  latest,
  minor,
  patch,
  newest,
  packageAuthorChanged,
} from './npm'
