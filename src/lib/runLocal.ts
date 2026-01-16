import fs from 'fs/promises'
import prompts from 'prompts-ncu'
import nodeSemver from 'semver'
import { parseDocument } from 'yaml'
import { DependencyGroup } from '../types/DependencyGroup'
import { Index } from '../types/IndexType'
import { Maybe } from '../types/Maybe'
import { Options } from '../types/Options'
import { PackageFile } from '../types/PackageFile'
import { Version } from '../types/Version'
import { VersionSpec } from '../types/VersionSpec'
import chalk from './chalk'
import getCurrentDependencies from './getCurrentDependencies'
import { getIgnoredUpgradesDueToEnginesNode } from './getIgnoredUpgradesDueToEnginesNode'
import getIgnoredUpgradesDueToPeerDeps from './getIgnoredUpgradesDueToPeerDeps'
import getPackageManager from './getPackageManager'
import getPeerDependenciesFromRegistry from './getPeerDependenciesFromRegistry'
import keyValueBy from './keyValueBy'
import {
  print,
  printIgnoredUpdatesDueToEnginesNode,
  printIgnoredUpdatesDueToPeerDeps,
  printJson,
  printSorted,
  printUpgrades,
  toDependencyTable,
} from './logging'
import { pick } from './pick'
import programError from './programError'
import resolveDepSections from './resolveDepSections'
import upgradePackageData from './upgradePackageData'
import upgradePackageDefinitions from './upgradePackageDefinitions'
import parseJson from './utils/parseJson'
import { getDependencyGroups } from './version-util'

const INTERACTIVE_HINT = `
  ↑/↓: Select a package
  Space: Toggle selection
  a: Toggle all
  Enter: Upgrade`

/**
 * Fetches how many options per page can be listed in the dependency table.
 *
 * @param groups - found dependency groups.
 * @returns the amount of options that can be displayed per page.
 */
function getOptionsPerPage(showHint: boolean, groups?: DependencyGroup[]): number {
  const hintRows = showHint ? INTERACTIVE_HINT.split('\n').length : 0
  return process.stdout.rows ? Math.max(3, process.stdout.rows - hintRows - 1 - (groups?.length ?? 0) * 2) : 50
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
  const packageManager = getPackageManager(options, options.packageManager)
  return await Object.keys(toVersion).reduce(
    async (accum, dep) => {
      const from = fromVersion[dep] || null
      const to = toVersion[dep] || null
      const ownerChanged = await packageManager.packageAuthorChanged!(dep, from!, to!, options)
      return {
        ...(await accum),
        [dep]: ownerChanged,
      }
    },
    {} as Promise<Index<boolean>>,
  )
}

/** Prompts the user to choose which upgrades to upgrade. */
const chooseUpgrades = async (
  oldDependencies: Index<string>,
  newDependencies: Index<string>,
  pkgFile: Maybe<string>,
  options: Options,
): Promise<Index<string>> => {
  let chosenDeps: string[] = []

  // Hide the interactive hint if the terminal is small.  This gives more space for the scrollable list of available updates
  const showHint = process.stdout.rows > 18

  // use toDependencyTable to create choices that are properly padded to align vertically
  const table = await toDependencyTable({
    from: oldDependencies,
    to: newDependencies,
    format: options.format,
    pkgFile: pkgFile || undefined,
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
    print(options, '')

    if (options.format?.includes('group')) {
      const groups = getDependencyGroups(newDependencies, oldDependencies, options)

      const choices = groups.flatMap(({ heading, groupName, packages }) => {
        return [
          { title: '\n' + heading, heading: true },
          ...Object.keys(packages)
            .sort()
            .map(dep => ({
              title: formattedLines[dep],
              value: dep,
              selected: ['patch', 'minor'].includes(groupName),
            })),
        ]
      })

      const response = await prompts({
        choices: [...choices, { title: ' ', heading: true }],
        hint: showHint && INTERACTIVE_HINT,
        instructions: false,
        message: 'Choose which packages to update',
        name: 'value',
        optionsPerPage: getOptionsPerPage(showHint, groups),
        type: 'multiselect',
        onState: (state: any) => {
          if (state.aborted) {
            process.nextTick(() => process.exit(1))
          }
        },
      })

      chosenDeps = response.value
    } else {
      const choices = Object.keys(newDependencies)
        .sort()
        .map(dep => ({
          title: formattedLines[dep],
          value: dep,
          selected: true,
        }))

      const response = await prompts({
        choices: [...choices, { title: ' ', heading: true }],
        hint: showHint && INTERACTIVE_HINT + '\n',
        instructions: false,
        message: 'Choose which packages to update',
        name: 'value',
        optionsPerPage: getOptionsPerPage(showHint),
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
export default async function runLocal(
  options: Options,
  pkgData?: Maybe<string>,
  pkgFile?: Maybe<string>,
): Promise<PackageFile | Index<VersionSpec>> {
  print(options, '\nOptions:', 'verbose')
  printSorted(options, options, 'verbose')

  let pkg: PackageFile

  try {
    if (!pkgData) {
      programError(options, 'Missing package data')
    } else {
      pkg = parseJson(pkgData)
    }
  } catch (e: any) {
    programError(
      options,
      `Invalid package file${pkgFile ? `: ${pkgFile}` : ' from stdin'}. Error details:\n${e.message}`,
    )
  }

  const current = getCurrentDependencies(pkg, options)

  print(options, '\nCurrent versions:', 'verbose')
  print(options, current, 'verbose')

  if (options.enginesNode) {
    options.nodeEngineVersion = pkg?.engines?.node
  }

  if (options.peer) {
    options.peerDependencies = await getPeerDependenciesFromRegistry(
      Object.fromEntries(
        Object.entries(current).map(([packageName, versionSpec]) => {
          return [
            packageName,
            // git urls and other non-semver versions are ignored.
            // Make sure versionSpec is a valid semver range; otherwise, minVersion will throw.
            nodeSemver.validRange(versionSpec)
              ? (nodeSemver.minVersion(versionSpec)?.version ?? versionSpec)
              : versionSpec,
          ]
        }),
      ),
      options,
    )
  }

  const [upgraded, latestResults, upgradedPeerDependencies] = await upgradePackageDefinitions(current, options)
  const latest = keyValueBy(latestResults, (key, result) => (result.version ? { [key]: result.version } : null))
  const errors = keyValueBy(latestResults, (key, result) => (result.error ? { [key]: result.error } : null))
  const time = keyValueBy(latestResults, (key, result) => (result.time ? { [key]: result.time } : null))

  if (options.peer) {
    print(options, '\nupgradedPeerDependencies:', 'verbose')
    print(options, upgradedPeerDependencies, 'verbose')
  }

  print(
    options,
    `\n${
      typeof options.target === 'string' ? `${options.target[0].toUpperCase()}${options.target.slice(1)}` : 'Fetched'
    } versions:`,
    'verbose',
  )
  print(options, latest, 'verbose')

  print(options, '\nUpgraded versions:', 'verbose')
  print(options, upgraded, 'verbose')

  // filter out satisfied deps when using --minimal
  const filteredUpgraded = options.minimal
    ? keyValueBy(upgraded, (dep, version) =>
        !nodeSemver.satisfies(latest[dep], current[dep]) ? { [dep]: version } : null,
      )
    : upgraded

  const ownersChangedDeps = (options.format || []).includes('ownerChanged')
    ? await getOwnerPerDependency(current, filteredUpgraded, options)
    : undefined

  const chosenUpgraded = options.interactive
    ? await chooseUpgrades(current, filteredUpgraded, pkgFile, options)
    : filteredUpgraded

  if (!options.json || options.deep) {
    await printUpgrades(
      // in interactive mode, do not group upgrades afterwards since the prompts are grouped
      options.interactive
        ? { ...options, format: (options.format || []).filter(formatType => formatType !== 'group') }
        : options,
      {
        current,
        upgraded: chosenUpgraded,
        total: Object.keys(upgraded).length,
        latest: latestResults,
        ownersChangedDeps,
        pkgFile: pkgFile || undefined,
        errors,
        time,
      },
    )
    if (options.peer) {
      const ignoredUpdates = await getIgnoredUpgradesDueToPeerDeps(
        current,
        upgraded,
        upgradedPeerDependencies!,
        options,
      )
      if (Object.keys(ignoredUpdates).length > 0) {
        printIgnoredUpdatesDueToPeerDeps(options, ignoredUpdates)
      }
    }
    if (options.enginesNode) {
      const ignoredUpdates = await getIgnoredUpgradesDueToEnginesNode(current, upgraded, options)
      if (Object.keys(ignoredUpdates).length > 0) {
        printIgnoredUpdatesDueToEnginesNode(options, ignoredUpdates)
      }
    }
  }

  const newPkgData = await upgradePackageData(pkgData, current, chosenUpgraded, options, pkgFile || undefined)

  const output: PackageFile | Index<VersionSpec> = options.jsonAll
    ? pkgFile?.endsWith('.yaml') || pkgFile?.endsWith('.yml')
      ? parseDocument(newPkgData).toJSON()
      : (parseJson(newPkgData) as PackageFile)
    : options.jsonDeps && pkgFile?.endsWith('.json')
      ? pick(parseJson(newPkgData) as PackageFile, resolveDepSections(options.dep))
      : chosenUpgraded

  // will be overwritten with the result of fs.writeFile so that the return promise waits for the package file to be written
  let writePromise

  if (options.json && !options.deep) {
    printJson(options, output)
  }

  if (Object.keys(filteredUpgraded).length > 0) {
    // if there is a package file, write the new package data
    // otherwise, suggest ncu -u
    if (pkgFile) {
      if (options.upgrade) {
        // do not await until the end
        writePromise = fs.writeFile(pkgFile.replace('#catalog', ''), newPkgData)
      } else {
        const ncuCmd = process.env.npm_lifecycle_event === 'npx' ? 'npx npm-check-updates' : 'ncu'
        // quote arguments with spaces
        const argv = process.argv
          .slice(2)
          .map(arg => (arg.includes(' ') ? `"${arg}"` : arg))
          .join(' ')
        const ncuOptions = argv ? ' ' + argv : argv
        const upgradeHint = `\nRun ${chalk.cyan(`${ncuCmd}${ncuOptions} -u`)} to upgrade ${
          options.packageFile || 'package.json'
        }`
        print(options, upgradeHint)
      }
    }
  }

  await writePromise

  return output
}
