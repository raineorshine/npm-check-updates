import fs from 'fs'
import prompts from 'prompts-ncu'
import { promisify } from 'util'
import _ from 'lodash'
import Chalk from 'chalk'
import jph from 'json-parse-helpfulerror'
import { satisfies } from 'semver'
import { getGroupHeadings, print, printJson, printUpgrades, printIgnoredUpdates, toDependencyTable } from '../logging'
import getCurrentDependencies from './getCurrentDependencies'
import getIgnoredUpgrades from './getIgnoredUpgrades'
import getPackageFileName from './getPackageFileName'
import getPackageManager from './getPackageManager'
import keyValueBy from './keyValueBy'
import getPeerDependencies from './getPeerDependencies'
import programError from './programError'
import upgradePackageData from './upgradePackageData'
import upgradePackageDefinitions from './upgradePackageDefinitions'
import { Index } from '../types/IndexType'
import { Maybe } from '../types/Maybe'
import { Options } from '../types/Options'
import { PackageFile } from '../types/PackageFile'
import { Version } from '../types/Version'
import { VersionSpec } from '../types/VersionSpec'
import { partChanged } from '../version-util'

const writePackageFile = promisify(fs.writeFile)

/** Recreate the options object sorted. */
function sortOptions(options: Options): Options {
  return _.transform(
    Object.keys(options).sort(), // eslint-disable-line fp/no-mutating-methods
    (accum, key) => {
      accum[key] = options[key as keyof Options]
    },
    {} as any,
  )
}

/**
 * Return a promise which resolves to object storing package owner changed status for each dependency.
 *
 * @param fromVersion current packages version.
 * @param toVersion target packages version.
 * @param options
 * @returns
 */
export async function getOwnerPerDependency(fromVersion: Index<Version>, toVersion: Index<Version>, options: Options) {
  const packageManager = getPackageManager(options.packageManager)
  return await Object.keys(toVersion).reduce(async (accum, dep) => {
    const from = fromVersion[dep] || null
    const to = toVersion[dep] || null
    const ownerChanged = await packageManager.packageAuthorChanged!(dep, from!, to!, options)
    return {
      ...(await accum),
      [dep]: ownerChanged,
    }
  }, {} as Promise<Index<boolean>>)
}

/** Prompts the user to choose which upgrades to upgrade. */
const chooseUpgrades = async (
  oldDependencies: Index<string>,
  newDependencies: Index<string>,
  options: Options,
): Promise<Index<string>> => {
  let chosenDeps: string[] = []

  print(options, '')

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

  // do not prompt if there are no dependencies
  // prompts will crash if passed an empty list of choices
  if (Object.keys(newDependencies).length > 0) {
    if (options.format?.includes('group')) {
      const groups = keyValueBy<string, Index<string>>(
        newDependencies,
        (dep, to, accum) => {
          const from = oldDependencies[dep]
          const partUpgraded = partChanged(from, to)
          return {
            ...accum,
            [partUpgraded]: {
              ...accum[partUpgraded],
              [dep]: to,
            },
          }
        },
        // narrow the type of the group index signature
      ) as Record<ReturnType<typeof partChanged>, Index<string>>

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

      const choicesMajorVersionZero = Object.keys(groups.majorVersionZero || {}).map(dep => ({
        title: formattedLines[dep],
        value: dep,
        selected: false,
      }))

      const headings = getGroupHeadings(options)

      const response = await prompts({
        choices: [
          ...(choicesPatch.length > 0 ? [{ title: '\n' + headings.patch, heading: true }] : []),
          ...choicesPatch,
          ...(choicesMinor.length > 0 ? [{ title: '\n' + headings.minor, heading: true }] : []),
          ...choicesMinor,
          ...(choicesMajor.length > 0 ? [{ title: '\n' + headings.major, heading: true }] : []),
          ...choicesMajor,
          ...(choicesMajorVersionZero.length > 0 ? [{ title: '\n' + headings.majorVersionZero, heading: true }] : []),
          ...choicesMajorVersionZero,
          { title: ' ', heading: true },
        ],
        hint: `
  ↑/↓: Select a package
  Space: Toggle selection
  a: Select all
  Enter: Upgrade`,
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
      })

      chosenDeps = response.value
    } else {
      const choices = Object.keys(newDependencies).map(dep => ({
        title: formattedLines[dep],
        value: dep,
        selected: true,
      }))

      const response = await prompts({
        choices: [...choices, { title: ' ', heading: true }],
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
      })

      chosenDeps = response.value
    }
  }

  return keyValueBy(chosenDeps, dep => ({ [dep]: newDependencies[dep] }))
}

/** Checks local project dependencies for upgrades. */
async function runLocal(
  options: Options,
  pkgData?: Maybe<string>,
  pkgFile?: Maybe<string>,
): Promise<PackageFile | Index<VersionSpec>> {
  print(options, '\nOptions:', 'verbose')
  print(options, sortOptions(options), 'verbose')

  let pkg

  const chalk = options.color ? new Chalk.Instance({ level: 1 }) : Chalk

  try {
    if (!pkgData) {
      throw new Error('Missing pkgData: ' + pkgData)
    } else {
      pkg = jph.parse(pkgData)
    }
  } catch (e: any) {
    programError(
      options,
      chalk.red(`Invalid package file${pkgFile ? `: ${pkgFile}` : ' from stdin'}. Error details:\n${e.message}`),
    )
  }

  const current = getCurrentDependencies(pkg, options)

  print(options, '\nCurrent:', 'verbose')
  print(options, current, 'verbose')

  print(options, `\nFetching ${options.target} versions`, 'verbose')

  if (options.enginesNode) {
    options.nodeEngineVersion = _.get(pkg, 'engines.node')
  }

  if (options.peer) {
    options.peerDependencies = getPeerDependencies(current, options)
  }

  const [upgraded, latestResults, upgradedPeerDependencies] = await upgradePackageDefinitions(current, options)
  const latest = keyValueBy(latestResults, (key, result) => (result.version ? { [key]: result.version } : null))
  const errors = keyValueBy(latestResults, (key, result) => (result.error ? { [key]: result.error } : null))

  if (options.peer) {
    print(options, '\nupgradedPeerDependencies:', 'verbose')
    print(options, upgradedPeerDependencies, 'verbose')
  }

  print(options, '\nFetched:', 'verbose')
  print(options, latest, 'verbose')

  print(options, '\nUpgraded:', 'verbose')
  print(options, upgraded, 'verbose')

  // filter out satisfied deps when using --minimal
  const filteredUpgraded = options.minimal
    ? keyValueBy(upgraded, (dep, version) => (!satisfies(latest[dep], current[dep]) ? { [dep]: version } : null))
    : upgraded

  const ownersChangedDeps = (options.format || []).includes('ownerChanged')
    ? await getOwnerPerDependency(current, filteredUpgraded, options)
    : undefined

  const chosenUpgraded = options.interactive ? await chooseUpgrades(current, latest, options) : upgraded

  if (!options.json || options.deep) {
    printUpgrades(
      // in interactive mode, do not group upgrades afterwards since the prompts are grouped
      options.interactive
        ? { ...options, format: (options.format || []).filter(formatType => formatType !== 'group') }
        : options,
      {
        current,
        upgraded: options.interactive ? chosenUpgraded : filteredUpgraded,
        total: Object.keys(upgraded).length,
        ownersChangedDeps,
        errors,
      },
    )
    if (options.peer) {
      const ignoredUpdates = await getIgnoredUpgrades(current, upgraded, upgradedPeerDependencies!, options)
      if (!_.isEmpty(ignoredUpdates)) {
        printIgnoredUpdates(options, ignoredUpdates)
      }
    }
  }

  const newPkgData = await upgradePackageData(pkgData!, current, chosenUpgraded)

  const output = options.jsonAll
    ? (jph.parse(newPkgData) as PackageFile)
    : options.jsonDeps
    ? _.pick(jph.parse(newPkgData) as PackageFile, 'dependencies', 'devDependencies', 'optionalDependencies')
    : chosenUpgraded

  // will be overwritten with the result of writePackageFile so that the return promise waits for the package file to be written
  let writePromise = Promise.resolve()

  if (options.json && !options.deep) {
    printJson(options, output)
  }

  if (Object.keys(filteredUpgraded).length > 0) {
    // if there is a package file, write the new package data
    // otherwise, suggest ncu -u
    if (pkgFile) {
      if (options.upgrade) {
        // do not await
        writePromise = writePackageFile(pkgFile, newPkgData)
      } else {
        const ncuCmd = process.env.npm_lifecycle_event === 'npx' ? 'npx npm-check-updates' : 'ncu'
        const argv = process.argv.slice(2).join(' ')
        const ncuOptions = argv ? ' ' + argv : argv
        print(options, `\nRun ${chalk.cyan(`${ncuCmd}${ncuOptions} -u`)} to upgrade ${getPackageFileName(options)}`)
      }
    }

    // if errorLevel is 2, exit with non-zero error code
    if (options.errorLevel === 2) {
      writePromise.then(() => {
        programError(options, '\nDependencies not up-to-date')
      })
    }
  }

  await writePromise

  return output
}

export default runLocal
