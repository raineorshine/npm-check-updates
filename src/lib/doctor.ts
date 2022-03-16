import fs from 'fs'
import Chalk from 'chalk'
import rimraf from 'rimraf'
import upgradePackageData from './upgradePackageData'
import { printUpgrades } from '../logging'
import spawn from 'spawn-please'
import spawnYarn from '../package-managers/yarn'
import spawnNpm from '../package-managers/npm'
import { Index, Options, PackageFile, SpawnOptions, VersionSpec } from '../types'

type Run = (options?: Options) => Promise<PackageFile | Index<VersionSpec> | void>

/** Run the npm CLI in CI mode. */
const npm = (args: string[], options: Options & SpawnOptions, print?: boolean) => {

  const chalk = options.color ? new Chalk.Instance({ level: 1 }) : Chalk

  if (print) {
    console.log(chalk.blue([options.packageManager, ...args].join(' ')))
  }

  const spawnOptions = {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, CI: '1' },
    ...options
  }

  return (options.packageManager === 'yarn' ? spawnYarn : spawnNpm)(args, options, spawnOptions)
}

/** Load and validate package file and tests. */
const loadPackageFile = async (options: Options) => {

  let pkg, pkgFile

  // assert no --packageData or --packageFile
  if (options.packageData || options.packageFile) {
    throw new Error('--packageData and --packageFile are not allowed with --doctor. You must execute "ncu --doctor" in a directory with a package file so it can install dependencies and test them.')
  }

  // assert package.json
  try {
    pkgFile = fs.readFileSync('package.json', 'utf-8')
    pkg = JSON.parse(pkgFile)
  }
  catch (e) {
    throw new Error('Missing or invalid package.json')
  }

  // assert npm script "test" (unless a custom test script is specified)
  if (!options.doctorTest && !pkg.scripts?.test) {
    throw new Error('No npm "test" script defined. You must define a "test" script in the "scripts" section of your package.json to use --doctor.')
  }

  return { pkg, pkgFile }
}

/** Iteratively installs upgrades and runs tests to identify breaking upgrades. */
// we have to pass run directly since it would be a circular require if doctor included this file
const doctor = async (run: Run, options: Options) => {

  const chalk = options.color ? new Chalk.Instance({ level: 1 }) : Chalk
  const lockFileName = options.packageManager === 'yarn' ? 'yarn.lock' : 'package-lock.json'
  const { pkg, pkgFile } = await loadPackageFile(options)

  const allDependencies = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
    ...pkg.bundleDependencies,
  }

  /** Install dependencies using "npm run install" or a custom script given by --doctorInstall. */
  const runInstall = async () => {
    if (options.doctorInstall) {
      const [installCommand, ...testArgs] = options.doctorInstall.split(' ')
      await spawn(installCommand, testArgs)
    }
    else {
      await npm(['install'], { packageManager: options.packageManager }, true)
    }
  }

  /** Run the tests using "npm run test" or a custom script given by --doctorTest. */
  const runTests = async (spawnOptions?: SpawnOptions) => {
    if (options.doctorTest) {
      const [testCommand, ...testArgs] = options.doctorTest.split(' ')
      await spawn(testCommand, testArgs, spawnOptions)
    }
    else {
      await npm(['run', 'test'], {
        packageManager: options.packageManager,
        ...spawnOptions,
      }, true)
    }
  }

  console.log(`Running tests before upgrading`)

  // install and load lock file
  await runInstall()

  let lockFile = ''
  try {
    lockFile = fs.readFileSync(lockFileName, 'utf-8')
  }
  catch (e) {
  }

  // make sure current tests pass before we begin
  try {
    await runTests({
      stderr: (data: string) => console.error(chalk.red(data.toString()))
    })
  }
  catch (e) {
    throw new Error('Tests failed before we even got started!')
  }

  console.log(`Upgrading all dependencies and re-running tests`)

  // upgrade all dependencies
  // save upgrades for later in case we need to iterate
  console.log(chalk.blue('ncu ' + process.argv.slice(2).filter(arg => arg !== '--doctor').join(' ')))
  const upgrades = await run({
    ...options,
    silent: true,
    doctor: false, // --doctor triggers the initial call to doctor, but the internal call executes npm-check-updates normally in order to upgrade the dependencies
  }) as Index<string>

  if (Object.keys(upgrades || {}).length === 0) {
    console.log('All dependencies are up-to-date ' + chalk.green.bold(':)'))
    return
  }

  // npm install
  await runInstall()

  // run tests on all upgrades
  try {

    await runTests()

    console.log(`${chalk.green('✓')} Tests pass`)

    const numUpgraded = Object.keys(upgrades || {}).length

    printUpgrades(options, {
      current: allDependencies,
      upgraded: upgrades,
      numUpgraded,
      total: numUpgraded
    })

    console.log('\nAll dependencies upgraded and installed ' + chalk.green(':)'))

  }
  catch (e) {

    console.error(chalk.red('Tests failed'))
    console.log(`Identifying broken dependencies`)

    // restore package file, lockFile and re-install
    fs.writeFileSync('package.json', pkgFile)

    if (lockFile) {
      fs.writeFileSync(lockFileName, lockFile)
    }
    else {
      rimraf.sync(lockFileName)
    }

    // save the last package file with passing tests
    let lastPkgFile = pkgFile

    await runInstall()

    // iterate upgrades
    for (const [name, version] of Object.entries(upgrades)) { // eslint-disable-line fp/no-loops

      // install single dependency
      await npm([...options.packageManager === 'yarn' ? ['add'] : ['install', '--no-save'], `${name}@${version}`], { packageManager: options.packageManager }, true)

      try {
        await runTests()
        console.log(`  ${chalk.green('✓')} ${name} ${allDependencies[name]} → ${version}`)

        // save upgraded package data so that passing versions can still be saved even when there is a failure
        lastPkgFile = (await upgradePackageData(lastPkgFile, { [name]: allDependencies[name] }, { [name]: version }, {}, { ...options, interactive: false })).newPkgData

        // save working lock file
        lockFile = fs.readFileSync(lockFileName, 'utf-8')

      }
      catch (e) {
        // print failing package
        console.error(`  ${chalk.red('✗')} ${name} ${allDependencies[name]} → ${version}\n`)
        console.error(chalk.red(e))

        // restore last good lock file
        fs.writeFileSync(lockFileName, lockFile)

        // restore package.json since yarn doesn't have --no-save option
        if (options.packageManager === 'yarn') {
          fs.writeFileSync('package.json', lastPkgFile)
        }
      }
    }

    // silently restore last passing package file and lock file
    // only print message if package file is updated
    if (lastPkgFile !== pkgFile) {
      console.log('Saving partially upgraded package.json')
      fs.writeFileSync('package.json', lastPkgFile)
    }

    // re-install from restored package.json and lockfile
    await runInstall()
  }
}

export default doctor
