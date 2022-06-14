import prompts from 'prompts'
import { satisfies } from 'semver'
import { colorizeDiff } from '../version-util'
import { print } from '../logging'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { Version } from '../types/Version'
import { VersionSpec } from '../types/VersionSpec'

/**
 * @returns String safe for use in `new RegExp()`
 */
function escapeRegexp(s: string) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') // Thanks Stack Overflow!
}

/**
 * Upgrade the dependency declarations in the package data.
 *
 * @param pkgData The package.json data, as utf8 text
 * @param oldDependencies Old dependencies {package: range}
 * @param newDependencies New dependencies {package: range}
 * @param newVersions New versions {package: version}
 * @param [options={}]
 * @returns The updated package data, as utf8 text
 * @description Side Effect: prompts
 */
async function upgradePackageData(
  pkgData: string,
  oldDependencies: Index<VersionSpec>,
  newDependencies: Index<VersionSpec>,
  newVersions: Index<Version>,
  options: Options = {},
) {
  let newPkgData = pkgData

  // interactive mode needs a newline before prompts
  if (options.interactive) {
    print(options, '')
  }

  // eslint-disable-next-line fp/no-loops
  for (const dependency in newDependencies) {
    if (!options.minimal || !satisfies(newVersions[dependency], oldDependencies[dependency])) {
      if (options.interactive) {
        const to = colorizeDiff(oldDependencies[dependency], newDependencies[dependency] || '')
        const response = await prompts({
          type: 'confirm',
          name: 'value',
          message: `Do you want to upgrade: ${dependency} ${oldDependencies[dependency]} → ${to}?`,
          initial: true,
          onState: state => {
            if (state.aborted) {
              process.nextTick(() => process.exit(1))
            }
          },
        })
        if (!response.value) {
          // continue loop to next dependency and skip updating newPkgData
          continue
        }
      }
      const expression = `"${dependency}"\\s*:\\s*"${escapeRegexp(`${oldDependencies[dependency]}"`)}`
      const regExp = new RegExp(expression, 'g')
      newPkgData = newPkgData.replace(regExp, `"${dependency}": "${newDependencies[dependency]}"`)
    }
  }

  return newPkgData
}

export default upgradePackageData
