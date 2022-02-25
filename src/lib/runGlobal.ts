import _ from 'lodash'
import Chalk from 'chalk'
import { print, printJson, printUpgrades } from '../logging'
import getInstalledPackages from './getInstalledPackages'
import upgradePackageDefinitions from './upgradePackageDefinitions'
import { Index, Options } from '../types'

/** Checks global dependencies for upgrades. */
async function runGlobal(options: Options): Promise<Index<string>|void> {

  const chalk = options.color ? new Chalk.Instance({ level: 1 }) : Chalk

  print(options, 'Getting installed packages', 'verbose')

  const globalPackages = await getInstalledPackages(
    _.pick(options, ['cwd', 'filter', 'filterVersion', 'global', 'packageManager', 'prefix', 'reject', 'rejectVersion'])
  )

  print(options, 'globalPackages', 'silly')
  print(options, globalPackages, 'silly')
  print(options, '', 'silly')
  print(options, `Fetching ${options.target} versions`, 'verbose')

  const [upgraded, latest] = await upgradePackageDefinitions(globalPackages, options)
  print(options, latest, 'silly')

  const upgradedPackageNames = Object.keys(upgraded)
  printUpgrades(options, {
    current: globalPackages,
    upgraded,
    // since an interactive upgrade of globals is not available, the numUpgraded is always all
    numUpgraded: upgradedPackageNames.length,
    total: upgradedPackageNames.length,
  })

  const instruction = upgraded
    ? upgradedPackageNames.map(pkg => pkg + '@' + upgraded[pkg]).join(' ')
    : '[package]'

  if (options.json) {
    // since global packages do not have a package.json, return the upgraded deps directly (no version range replacements)
    printJson(options, upgraded)
  }
  else if (instruction.length) {
    const upgradeCmd = options.packageManager === 'yarn' ? 'yarn global upgrade' : 'npm -g install'

    print(options, '\n' + chalk.cyan('ncu') + ' itself cannot upgrade global packages. Run the following to upgrade all global packages: \n\n' + chalk.cyan(`${upgradeCmd} ` + instruction) + '\n')
  }

  // if errorLevel is 2, exit with non-zero error code
  if (options.cli && options.errorLevel === 2 && upgradedPackageNames.length > 0) {
    process.exit(1)
  }
  return upgraded
}

export default runGlobal
