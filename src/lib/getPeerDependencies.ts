import fs from 'fs/promises'
import jph from 'json-parse-helpfulerror'
import { print } from '../lib/logging.js'
import { Index } from '../types/IndexType.js'
import { Options } from '../types/Options.js'
import { VersionSpec } from '../types/VersionSpec.js'
import getCurrentDependencies from './getCurrentDependencies.js'

/** Get peer dependencies from installed packages */
async function getPeerDependencies(current: Index<VersionSpec>, options: Options): Promise<Index<Index<string>>> {
  const basePath = options.cwd || './'
  const accum: Index<Index<string>> = {}

  for (const dep in current) {
    const path = basePath + `node_modules/${dep}/package.json`
    let peers: Index<string> = {}
    try {
      const pkgData = await fs.readFile(path, 'utf-8')
      const pkg = jph.parse(pkgData)
      peers = getCurrentDependencies(pkg, { ...options, dep: 'peer' })
    } catch (e) {
      print(options, `Could not read peer dependencies for package ${dep}. Is this package installed?`, 'warn')
    }
    accum[dep] = peers
  }

  return accum
}

export default getPeerDependencies
