const fs = require('fs')
const path = require('path')
const spawn = require('spawn-please')
const chalk = require('chalk')

const ncu = (...args) => spawn(path.join(__dirname, '../bin/ncu.js'), ...args)
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

const doctor = async options => {

  const { pkg, pkgFile } = await loadPackageFile(options)

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
  console.log(chalk.blue('ncu -u'))
  const output = await ncu(['-u', '--jsonUpgraded'])
  const upgrades = JSON.parse(output)

  if (Object.keys(upgrades).length === 0) {
    console.log('All dependencies are up-to-date ' + chalk.green.bold(':)'))
    return
  }

  // npm install
  console.log(chalk.blue('npm install'))
  await npm(['install'])

  // run tests on all upgrades
  try {
    console.log(chalk.blue('npm run test'))
    let failing = false
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
  }
  catch (e) {
    console.log('Now let\'s identify the culprit, shall we?')

    // restore package file, lockFile and re-install
    console.log('Restoring package.json')
    fs.writeFileSync('package.json', pkgFile)
    console.log('Restoring package-lock.json')
    fs.writeFileSync('package-lock.json', lockFile)
    console.log(chalk.blue('npm install'))
    await npm(['install'])

    // iterate upgrades
    for (const [name, version] of Object.entries(upgrades)) { // eslint-disable-line fp/no-loops

      // install single dependency
      console.log(chalk.blue(`npm install ${name}@${version}`))
      await npm(['install', `${name}@${version}`])

      try {
        console.log(chalk.blue('npm run test'))
        await npm(['run', 'test'])
        console.log(`  ${chalk.green('✓')} ${name} ${pkg.dependencies[name]} → ${version}`)
      }
      catch (e) {
        // restore package file and lockFile silently
        cleanup(pkgFile, lockFile)

        // throw error with failing package
        console.error(`  ${chalk.red('✗')} ${name} ${pkg.dependencies[name]} → ${version}`)
        break
      }
    }
  }

  // restore package file and lockFile silently
  cleanup(pkgFile, lockFile)
}

module.exports = doctor
