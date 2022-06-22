import Chalk from 'chalk'
import prompts, { PromptObject } from 'prompts'
import { satisfies } from 'semver'
import { print, printUpgrades, toDependencyTable } from '../logging'
import keyValueBy from '../lib/keyValueBy'
import { partChanged } from '../version-util'
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
  const chalk = options.color ? new Chalk.Instance({ level: 1 }) : Chalk

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

    let depsSelected: string[] = []

    if (options.format?.includes('group')) {
      depsSelected = []

      const groups = keyValueBy<string, Index<string>>(newDependenciesFiltered, (dep, to, accum) => {
        const from = oldDependencies[dep]
        const partUpgraded = partChanged(from, to)
        return {
          ...accum,
          [partUpgraded]: {
            ...accum[partUpgraded],
            [dep]: to,
          },
        }
      })

      const choicesPatch = Object.keys(groups.patch || {}).map(dep => ({
        title: formattedLines[dep],
        value: dep,
        selected: true,
      }))

      const choicesMinor = Object.keys(groups.minor || {}).map(dep => ({
        title: formattedLines[dep],
        value: dep,
        selected: true,
      }))

      const choicesMajor = Object.keys(groups.major || {}).map(dep => ({
        title: formattedLines[dep],
        value: dep,
        selected: false,
      }))

      const choicesNonsemver = Object.keys(groups.nonsemver || {}).map(dep => ({
        title: formattedLines[dep],
        value: dep,
        selected: false,
      }))

      const response = await prompts({
        choices: [
          { title: chalk.green(chalk.bold('Patch') + '   Backwards-compatible bug fixes.'), disabled: true },
          ...choicesPatch,
          { title: chalk.cyan(chalk.bold('Minor') + '   Backwards-compatible features.'), disabled: true },
          ...choicesMinor,
          { title: chalk.red(chalk.bold('Major') + '   Potentially breaking API changes.'), disabled: true },
          ...choicesMajor,
          { title: chalk.magenta(chalk.bold('Non-Semver') + '  Versions less than 1.0.0.'), disabled: true },
          ...choicesNonsemver,
        ],
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

      depsSelected = response.value
    } else {
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

      depsSelected = response.value
    }

    newDependenciesFiltered = keyValueBy(depsSelected, (dep: string) => ({ [dep]: newDependencies[dep] }))

    // in interactive mode, do not group upgrades afterwards since the prompts are grouped
    printUpgrades(
      { ...options, format: (options.format || []).filter(formatType => formatType !== 'group') },
      {
        current: oldDependencies,
        upgraded: newDependenciesFiltered,
        total: Object.keys(newDependencies).length,
      },
    )
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
