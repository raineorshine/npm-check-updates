import fs from 'fs'
import { promisify } from 'util'
import * as cint from 'cint'
import _ from 'lodash'
import Chalk from 'chalk'
import jph from 'json-parse-helpfulerror'
import { satisfies } from 'semver'
import * as vm from '../versionmanager'
import { print, printJson, printUpgrades, printIgnoredUpdates } from '../logging'
import getIgnoredUpgrades from './getIgnoredUpgrades'
import getPackageFileName from './getPackageFileName'
import getPeerDependencies from './getPeerDependencies'
import programError from './programError'
import upgradePackageDefinitions from './upgradePackageDefinitions'
import { Index, Maybe, Options, PackageFile, VersionDeclaration } from '../types'

const writePackageFile = promisify(fs.writeFile)

/** Recreate the options object sorted. */
function sortOptions(options: Options): Options {
  // eslint-disable-next-line fp/no-mutating-methods
  return _.transform(Object.keys(options).sort(), (accum, key) => {
    accum[key] = options[key as keyof Options]
  }, {} as any)
}

/** Checks local project dependencies for upgrades. */
async function runLocal(options: Options, pkgData?: Maybe<string>, pkgFile?: Maybe<string>): Promise<PackageFile | Index<VersionDeclaration>> {

  let pkg

  const chalk = options.color ? new Chalk.Instance({ level: 1 }) : Chalk

  try {
    if (!pkgData) {
      throw new Error('pkgData: ' + pkgData)
    }
    else {
      pkg = jph.parse(pkgData)
    }
  }
  catch (e) {
    programError(options, chalk.red(`Invalid package file${pkgFile ? `: ${pkgFile}` : ' from stdin'}. Error details:\n${e.message}`))
  }

  const current = vm.getCurrentDependencies(pkg, options)

  print(options, `Fetching ${options.target} versions`, 'verbose')

  if (options.enginesNode) {
    options.nodeEngineVersion = _.get(pkg, 'engines.node')
  }

  print(options, '\nOptions:', 'verbose')
  print(options, sortOptions(options), 'verbose')

  if (options.peer) {
    options.peerDependencies = getPeerDependencies(current, options)
  }

  const [upgraded, latest, upgradedPeerDependencies] = await upgradePackageDefinitions(current, options)

  if (options.peer) {
    print(options, '\nupgradedPeerDependencies:', 'verbose')
    print(options, upgradedPeerDependencies, 'verbose')
  }

  print(options, '\nFetched:', 'verbose')
  print(options, latest, 'verbose')

  print(options, '\nUpgraded:', 'verbose')
  print(options, upgraded, 'verbose')

  const { newPkgData, selectedNewDependencies } = await vm.upgradePackageData(pkgData!, current, upgraded, latest, options)

  const output = options.jsonAll ? jph.parse(newPkgData) as PackageFile :
    options.jsonDeps ?
      _.pick(jph.parse(newPkgData) as PackageFile, 'dependencies', 'devDependencies', 'optionalDependencies') :
      selectedNewDependencies

  // will be overwritten with the result of writePackageFile so that the return promise waits for the package file to be written
  let writePromise = Promise.resolve()

  // split the deps into satisfied and unsatisfied to display in two separate tables
  const deps = Object.keys(selectedNewDependencies)
  const satisfied = cint.toObject(deps, (dep: string) => ({
    [dep]: satisfies(latest[dep], current[dep])
  }))

  const isSatisfied = _.propertyOf(satisfied)
  const filteredUpgraded = options.minimal ? cint.filterObject(selectedNewDependencies, (dep: string) => !isSatisfied(dep)) : selectedNewDependencies
  const numUpgraded = Object.keys(filteredUpgraded).length

  const ownersChangedDeps = (options.format || []).includes('ownerChanged')
    ? await vm.getOwnerPerDependency(current, filteredUpgraded, options)
    : undefined

  // print
  if (options.json && !options.deep) {
    // use the selectedNewDependencies dependencies data to generate new package data
    // INVARIANT: we don't need try-catch here because pkgData has already been parsed as valid JSON, and vm.upgradePackageData simply does a find-and-replace on that
    printJson(options, output)
  }
  else {
    printUpgrades(options, {
      current,
      upgraded: filteredUpgraded,
      numUpgraded,
      total: Object.keys(upgraded).length,
      ownersChangedDeps
    })
    if (options.peer) {
      const ignoredUpdates = await getIgnoredUpgrades(current, upgraded, upgradedPeerDependencies!, options)
      if (!_.isEmpty(ignoredUpdates)) {
        printIgnoredUpdates(options, ignoredUpdates)
      }
    }
  }

  if (numUpgraded > 0) {

    // if there is a package file, write the new package data
    // otherwise, suggest ncu -u
    if (pkgFile) {
      if (options.upgrade) {
        // do not await until end
        writePromise = writePackageFile(pkgFile, newPkgData)
          .then(() => {
            print(options, `\nRun ${chalk.cyan(options.packageManager === 'yarn' ? 'yarn install' : 'npm install')} to install new versions.\n`)
          })
      }
      else {
        print(options, `\nRun ${chalk.cyan('ncu -u')} to upgrade ${getPackageFileName(options)}`)
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
