const fs = require('fs')
const spawn = require('spawn-please')
const chalk = require('chalk')
const { upgradePackageData } = require('./versionmanager')
const { printUpgrades } = require('./logging')

/** Run the npm CLI. */
const npm = (args, options) => spawn('npm', args, { cwd: process.cwd(), ...options })

/** Load and validate package file and tests. */
const loadPackageFile = async options => {

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

  // assert npm script "test"
  if (!pkg.scripts || !pkg.scripts.test) {
    throw new Error('No npm "test" script defined. You must define a "test" script in the "scripts" section of your package.json to use --doctor.')
  }

  return { pkg, pkgFile }
}

const cleanup = (pkgFile, lockFile) => {
  fs.writeFileSync('package.json', pkgFile)
  fs.writeFileSync('package-lock.json', lockFile)
}

// we have to pass run directly since it would be a circular require if doctor included this file
const doctor = async (run, options) => {

  const { pkg, pkgFile } = await loadPackageFile(options)

  const allDependencies = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
    ...pkg.peerDependencies,
    ...pkg.bundleDependencies,
  }

  // install and load lock file
  console.log(chalk.blue('npm install'))
  await npm(['install'])

  const lockFile = fs.readFileSync('package-lock.json', 'utf-8')

  // make sure current tests pass before we begin
  try {
    console.log(chalk.blue('npm run test'))
    await npm(['run', 'test'], {
      stderr: data => console.error(chalk.red(data.toString()))
    })
  }
  catch (e) {
    throw new Error('Tests failed before we even got started!')
  }

  // upgrade all dependencies
  // save upgrades for later in case we need to iterate
  console.log(chalk.blue('ncu ' + process.argv.slice(2).filter(arg => arg !== '--doctor').join(' ')))
  const upgrades = await run({
    ...options,
    silent: true,
    doctor: false, // --doctor triggers the initial call to doctor, but the internal call executes npm-check-updates normally in order to upgrade the dependencies
  })

  if (Object.keys(upgrades).length === 0) {
    console.log('All dependencies are up-to-date ' + chalk.green.bold(':)'))
    return
  }

  // npm install
  console.log(chalk.blue('npm install'))
  await npm(['install'])

  // run tests on all upgrades
  try {
    let failing = false

    console.log(chalk.blue('npm run test'))
    await npm(['run', 'test'], {
      // stream stderr so user does not have to wait for promise to resolve
      stderr: data => {
        if (!failing) {
          console.log('Failing tests found:')
          failing = true
        }
        console.error(chalk.red(data.toString()))
      }
    })

    console.log(`${chalk.green('✓')} Tests pass`)

    const numUpgraded = Object.keys(upgrades).length

    printUpgrades(options, {
      current: allDependencies,
      upgraded: upgrades,
      numUpgraded,
      total: numUpgraded
    })

    console.log('\nAll dependencies upgraded ' + chalk.green(':)'))

  }
  catch (e) {
    console.log('Now let\'s identify the culprit, shall we?')

    // restore package file, lockFile and re-install
    console.log('Restoring package.json')
    fs.writeFileSync('package.json', pkgFile)
    console.log('Restoring package-lock.json')
    fs.writeFileSync('package-lock.json', lockFile)

    // save the last package file with passing tests
    let lastPkgFile = pkgFile

    console.log(chalk.blue('npm install'))
    await npm(['install'])

    // iterate upgrades
    for (const [name, version] of Object.entries(upgrades)) { // eslint-disable-line fp/no-loops

      // install single dependency
      console.log(chalk.blue(`npm install --no-save ${name}@${version}`))
      await npm(['install', '--no-save', `${name}@${version}`])

      try {
        console.log(chalk.blue('npm run test'))
        await npm(['run', 'test'])
        console.log(`  ${chalk.green('✓')} ${name} ${allDependencies[name]} → ${version}`)

        // save upgraded package data so that passing versions can still be saved even when there is a failure
        lastPkgFile = (await upgradePackageData(lastPkgFile, { [name]: allDependencies[name] }, { [name]: version })).newPkgData
      }
      catch (e) {
        // print error with failing package
        console.error(`  ${chalk.red('✗')} ${name} ${allDependencies[name]} → ${version}`)

        // restore package file and lockFile
        // only print message if package file is updated
        if (lastPkgFile !== pkgFile) {
          console.log(chalk.blue('Saving partially upgraded package.json'))
        }
        cleanup(lastPkgFile, lockFile)

        break
      }
    }
  }
}

module.exports = doctor
