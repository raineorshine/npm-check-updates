import prompts, { PromptObject } from 'prompts'
import { satisfies } from 'semver'
import { print, printUpgrades, toDependencyTable } from '../logging'
import keyValueBy from '../lib/keyValueBy'
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

  let newDependenciesFiltered = keyValueBy(newDependencies, (dep, version) =>
    !options.minimal || !satisfies(newVersions[dep], oldDependencies[dep]) ? { [dep]: version } : null,
  )

  if (options.interactive) {
    // use toDependencyTable to create choices that are properly padded to align vertically
    const table = toDependencyTable({
      from: oldDependencies,
      to: newDependencies,
      format: options.format,
    })

    const formattedLines = keyValueBy(table.toString().split('\n'), line => {
      const dep = line.trim().split(' ')[0]
      return {
        [dep]: line.trim(),
      }
    })

    const choices = Object.keys(newDependenciesFiltered).map(dep => ({
      title: formattedLines[dep],
      value: dep,
      selected: true,
    }))

    const response = await prompts({
      choices,
      hint: 'Space to deselect. Enter to upgrade.',
      instructions: false,
      message: 'Choose which packages to update',
      name: 'value',
      optionsPerPage: 50,
      type: 'multiselect',
      onState: (state: any) => {
        if (state.aborted) {
          process.nextTick(() => process.exit(1))
        }
      },
    } as PromptObject) // coerce to PromptObject until optionsPerPage is added to @types/prompts

    newDependenciesFiltered = keyValueBy(response.value, (dep: string) => ({ [dep]: newDependencies[dep] }))

    printUpgrades(options, {
      current: oldDependencies,
      upgraded: newDependenciesFiltered,
      total: Object.keys(newDependencies).length,
    })
  }

  // eslint-disable-next-line fp/no-loops
  for (const dependency in newDependenciesFiltered) {
    const expression = `"${dependency}"\\s*:\\s*"${escapeRegexp(`${oldDependencies[dependency]}"`)}`
    const regExp = new RegExp(expression, 'g')
    newPkgData = newPkgData.replace(regExp, `"${dependency}": "${newDependencies[dependency]}"`)
  }

  return newPkgData
}

export default upgradePackageData
