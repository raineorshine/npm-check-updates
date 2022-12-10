import fs from 'fs/promises'
import rimraf from 'rimraf'
import spawn from 'spawn-please'
import { printUpgrades } from '../lib/logging'
import spawnNpm from '../package-managers/npm'
import spawnYarn from '../package-managers/yarn'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { PackageFile } from '../types/PackageFile'
import { PackageInfo } from '../types/PackageInfo'
import { SpawnOptions } from '../types/SpawnOptions'
import { VersionSpec } from '../types/VersionSpec'
import chalk, { chalkInit } from './chalk'
import loadPackageInfoFromFile from './loadPackageInfoFromFile'
import upgradePackageData from './upgradePackageData'

type Run = (options?: Options) => Promise<PackageFile | Index<VersionSpec> | void>

/** Run the npm CLI in CI mode. */
const npm = (
  args: string[],
  options: Options,
  print?: boolean,
  { spawnOptions }: { spawnOptions?: SpawnOptions } = {},
): Promise<string> => {
  if (print) {
    console.log(chalk.blue([options.packageManager, ...args].join(' ')))
  }

  const spawnOptionsMerged = {
    cwd: options.cwd || process.cwd(),
    env: {
      ...process.env,
      CI: '1',
      FORCE_COLOR: '1',
      ...spawnOptions?.env,
    },
    ...spawnOptions,
  }

  const npmOptions = {
    ...(options.global ? { location: 'global' } : null),
    ...(options.prefix ? { prefix: options.prefix } : null),
  }

  return (options.packageManager === 'yarn' ? spawnYarn : spawnNpm)(args, npmOptions, spawnOptionsMerged)
}

/** Load and validate package file and tests. */
const loadPackageFileForDoctor = async (options: Options): Promise<PackageInfo> => {
  // assert no --packageData or --packageFile
  if (options.packageData || options.packageFile) {
    console.error(
      '--packageData and --packageFile are not allowed with --doctor. You must execute "ncu --doctor" in a directory with a package file so it can install dependencies and test them.',
    )
    process.exit(1)
  }

  let packageInfo: PackageInfo
  // assert package.json
  try {
    packageInfo = await loadPackageInfoFromFile('package.json')
  } catch (e) {
    console.error('Missing or invalid package.json')
    process.exit(1)
  }

  // assert npm script "test" (unless a custom test script is specified)
  if (!options.doctorTest && !packageInfo.pkg.scripts?.test) {
    console.error(
      'No npm "test" script defined. You must define a "test" script in the "scripts" section of your package.json to use --doctor.',
    )
    process.exit(1)
  }

  return packageInfo
}

/** Iteratively installs upgrades and runs tests to identify breaking upgrades. */
// we have to pass run directly since it would be a circular require if doctor included this file
const doctor = async (run: Run, options: Options): Promise<void> => {
  await chalkInit()
  const lockFileName = options.packageManager === 'yarn' ? 'yarn.lock' : 'package-lock.json'
  const { pkg, pkgFile }: PackageInfo = await loadPackageFileForDoctor(options)

  // flatten all deps into one so we can iterate over them
  const allDependencies: Index<VersionSpec> = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
    ...pkg.bundleDependencies,
  }

  /** Install dependencies using "npm run install" or a custom script given by --doctorInstall. */
  const runInstall = async (): Promise<void> => {
    if (options.doctorInstall) {
      const [installCommand, ...testArgs] = options.doctorInstall.split(' ')
      await spawn(installCommand, testArgs)
    } else {
      await npm(['install'], { packageManager: options.packageManager }, true)
    }
  }

  /** Run the tests using "npm run test" or a custom script given by --doctorTest. */
  const runTests = async (): Promise<void> => {
    const spawnOptions = {
      stderr: (data: string): void => {
        console.error(chalk.red(data.toString()))
      },
      // Test runners typically write to stdout, so we need to print stdout.
      // Otherwise test failures will be silenced.
      stdout: (data: string): void => {
        process.stdout.write(data.toString())
      },
    }

    if (options.doctorTest) {
      const [testCommand, ...testArgs] = options.doctorTest.split(' ')
      await spawn(testCommand, testArgs, spawnOptions)
    } else {
      await npm(
        ['run', 'test'],
        {
          packageManager: options.packageManager,
        },
        true,
        { spawnOptions },
      )
    }
  }

  console.log(`Running tests before upgrading`)

  // initial install
  await runInstall()

  // save lock file if there is one
  let lockFile = ''
  try {
    lockFile = await fs.readFile(lockFileName, 'utf-8')
  } catch (e) {}

  // make sure current tests pass before we begin
  try {
    await runTests()
  } catch (e) {
    console.error('Tests failed before we even got started!')
    process.exit(1)
  }

  if (!options.interactive) {
    console.log(`Upgrading all dependencies and re-running tests`)
  }

  // upgrade all dependencies
  // save upgrades for later in case we need to iterate
  console.log(
    chalk.blue(
      'ncu ' +
        process.argv
          .slice(2)
          .filter(arg => arg !== '--doctor')
          .join(' '),
    ),
  )
  process.env.NCU_DOCTOR = '1'
  const upgrades: Index<VersionSpec> = (await run({
    ...options,
    silent: true,
    // --doctor triggers the initial call to doctor, but the internal call needs to executes npm-check-updates normally in order to upgrade the dependencies
    doctor: false,
  })) as Index<VersionSpec>

  if (Object.keys(upgrades || {}).length === 0) {
    console.log('All dependencies are up-to-date ' + chalk.green.bold(':)'))
    return
  }

  // track if installing dependencies was successful
  // this allows us to skip re-installing when it fails and proceed straight to installing individual dependencies
  let installAllSuccess = false

  // run tests on all upgrades
  try {
    // install after all upgrades
    await runInstall()
    installAllSuccess = true

    // run tests after all upgrades
    await runTests()

    console.log(`${chalk.green('✓')} Tests pass`)

    await printUpgrades(options, {
      current: allDependencies,
      upgraded: upgrades,
      total: Object.keys(upgrades || {}).length,
    })

    console.log(`\n${options.interactive ? 'Chosen' : 'All'} dependencies upgraded and installed ${chalk.green(':)')}`)
  } catch {
    console.error(chalk.red(installAllSuccess ? 'Tests failed' : 'Install failed'))
    console.log(`Identifying broken dependencies`)

    // restore package file, lockFile and re-install
    await fs.writeFile('package.json', pkgFile)

    if (lockFile) {
      await fs.writeFile(lockFileName, lockFile)
    } else {
      rimraf.sync(lockFileName)
    }

    // save the last package file with passing tests
    let lastPkgFile = pkgFile

    // re-install after restoring package file and lock file
    // only re-install if the tests failed, not if npm install failed
    if (installAllSuccess) {
      try {
        await runInstall()
      } catch (e) {
        const installCommand = (options.packageManager || 'npm') + ' install'
        throw new Error(
          `Error: Doctor mode was about to test individual upgrades, but ${chalk.cyan(
            installCommand,
          )} failed after rolling back to your existing package and lock files. This is unexpected since the initial install before any upgrades succeeded. Either npm failed to revert a partial install, or failed anomalously on the second run. Please check your internet connection and retry. If doctor mode fails consistently, report a bug with your complete list of dependency versions at https://github.com/raineorshine/npm-check-updates/issues.`,
        )
      }
    }

    // iterate upgrades
    let name: string, version: VersionSpec
    // eslint-disable-next-line fp/no-loops
    for ([name, version] of Object.entries(upgrades)) {
      try {
        // install single dependency
        await npm(
          [...(options.packageManager === 'yarn' ? ['add'] : ['install', '--no-save']), `${name}@${version}`],
          { packageManager: options.packageManager },
          true,
        )

        // if there is a prepare script, we need to run it manually since --no-save does not run prepare automatically
        // https://github.com/raineorshine/npm-check-updates/issues/1170
        if (pkg.scripts?.prepare) {
          try {
            await npm(['run', 'prepare'], { packageManager: options.packageManager }, true)
          } catch (e) {
            console.error(chalk.red('Prepare script failed'))
            throw e
          }
        }

        // run tests after individual upgrade
        await runTests()
        console.log(`  ${chalk.green('✓')} ${name} ${allDependencies[name]} → ${version}`)

        // save upgraded package data so that passing versions can still be saved even when there is a failure
        lastPkgFile = await upgradePackageData(
          lastPkgFile,
          { [name]: allDependencies[name] },
          { [name]: version },
          options,
        )

        // save working lock file
        lockFile = await fs.readFile(lockFileName, 'utf-8')
      } catch (e) {
        // print failing package
        console.error(`  ${chalk.red('✗')} ${name} ${allDependencies[name]} → ${version}\n`)
        console.error(chalk.red(e))

        // restore last good lock file
        await fs.writeFile(lockFileName, lockFile)

        // restore package.json since yarn doesn't have --no-save option
        if (options.packageManager === 'yarn') {
          await fs.writeFile('package.json', lastPkgFile)
        }
      }
    }

    // silently restore last passing package file and lock file
    // only print message if package file is updated
    if (lastPkgFile !== pkgFile) {
      console.log('Saving partially upgraded package.json')
      await fs.writeFile('package.json', lastPkgFile)
    }

    // re-install from restored package.json and lockfile
    await runInstall()
  }
}

export default doctor
