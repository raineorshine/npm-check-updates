import fs from 'fs'
import { promisify } from 'util'
import * as cint from 'cint'
import _ from 'lodash'
import Chalk from 'chalk'
import jph from 'json-parse-helpfulerror'
import { satisfies } from 'semver'
import { print, printJson, printUpgrades, printIgnoredUpdates } from '../logging'
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

  // split the deps into satisfied and unsatisfied to display in two separate tables
  const deps = Object.keys(upgraded)
  const satisfied = cint.toObject(deps, (dep: string) => ({
    [dep]: satisfies(latest[dep], current[dep]),
  }))

  const isSatisfied = _.propertyOf(satisfied)
  const filteredUpgraded = options.minimal ? cint.filterObject(upgraded, (dep: string) => !isSatisfied(dep)) : upgraded
  const ownersChangedDeps = (options.format || []).includes('ownerChanged')
    ? await getOwnerPerDependency(current, filteredUpgraded, options)
    : undefined

  // do not print upgrades for interactive mode
  // interactive mode handles its own output
  if (!options.interactive && (!options.json || options.deep)) {
    printUpgrades(options, {
      current,
      upgraded: filteredUpgraded,
      total: Object.keys(upgraded).length,
      ownersChangedDeps,
      errors,
    })
    if (options.peer) {
      const ignoredUpdates = await getIgnoredUpgrades(current, upgraded, upgradedPeerDependencies!, options)
      if (!_.isEmpty(ignoredUpdates)) {
        printIgnoredUpdates(options, ignoredUpdates)
      }
    }
  }

  const newPkgData = await upgradePackageData(pkgData!, current, upgraded, latest, options)

  const output = options.jsonAll
    ? (jph.parse(newPkgData) as PackageFile)
    : options.jsonDeps
    ? _.pick(jph.parse(newPkgData) as PackageFile, 'dependencies', 'devDependencies', 'optionalDependencies')
    : upgraded

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
        // do not await until end
        writePromise = writePackageFile(pkgFile, newPkgData).then(() => {
          print(
            options,
            `\nRun ${chalk.cyan(
              options.packageManager === 'yarn' ? 'yarn install' : 'npm install',
            )} to install new versions.\n`,
          )
        })
      } else {
        const ncuCmd = process.env.npm_lifecycle_event === 'npx' ? 'npx npm-check-updates' : 'ncu'
        print(options, `\nRun ${chalk.cyan(`${ncuCmd} -u`)} to upgrade ${getPackageFileName(options)}`)
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
