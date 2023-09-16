import pick from 'lodash/pick'
import { print, printJson, printSorted, printUpgrades } from '../lib/logging'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import chalk from './chalk'
import getInstalledPackages from './getInstalledPackages'
import { keyValueBy } from './keyValueBy'
import upgradePackageDefinitions from './upgradePackageDefinitions'

/** Checks global dependencies for upgrades. */
async function runGlobal(options: Options): Promise<Index<string> | void> {
  print(options, '\nOptions:', 'verbose')
  printSorted(options, options, 'verbose')

  print(options, '\nGetting installed packages', 'verbose')
  const globalPackages = await getInstalledPackages(
    pick(options, [
      'cli',
      'cwd',
      'filter',
      'filterVersion',
      'global',
      'packageManager',
      'prefix',
      'reject',
      'rejectVersion',
    ]),
  )

  print(options, 'globalPackages:', 'verbose')
  print(options, globalPackages, 'verbose')
  print(options, '', 'verbose')
  print(options, `Fetching ${options.target} versions`, 'verbose')

  const [upgraded, latest] = await upgradePackageDefinitions(globalPackages, options)
  print(options, latest, 'verbose')

  const time = keyValueBy(latest, (key, result) => (result.time ? { [key]: result.time } : null))

  const upgradedPackageNames = Object.keys(upgraded)
  await printUpgrades(options, {
    current: globalPackages,
    upgraded,
    latest,
    total: upgradedPackageNames.length,
    time,
  })

  const instruction = upgraded ? upgradedPackageNames.map(pkg => pkg + '@' + upgraded[pkg]).join(' ') : '[package]'

  if (options.json) {
    // since global packages do not have a package.json, return the upgraded deps directly (no version range replacements)
    printJson(options, upgraded)
  } else if (instruction.length) {
    const upgradeCmd =
      options.packageManager === 'yarn'
        ? 'yarn global upgrade'
        : options.packageManager === 'pnpm'
        ? 'pnpm -g add'
        : options.packageManager === 'bun'
        ? 'bun add -g'
        : 'npm -g install'

    print(
      options,
      '\n' +
        chalk.cyan('ncu') +
        ' itself cannot upgrade global packages. Run the following to upgrade all global packages: \n\n' +
        chalk.cyan(`${upgradeCmd} ` + instruction) +
        '\n',
    )
  }

  // if errorLevel is 2, exit with non-zero error code
  if (options.cli && options.errorLevel === 2 && upgradedPackageNames.length > 0) {
    process.exit(1)
  }
  return upgraded
}

export default runGlobal
