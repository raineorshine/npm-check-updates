const fs = require('fs')
const path = require('path')
const spawn = require('spawn-please')

const readLockFile = () =>
  JSON.parse(fs.readFileSync('package-lock.json', 'utf-8'))

const validate = async options => {

  let pkg, lockfile

  // assert no --packageData or --packageFile
  if (options.packageData || options.packageFile) {
    throw new Error('--packageData and --packageFile are not allowed with --doctor. You must execute "ncu --doctor" in a directory with a package file so it can install dependencies and test them.')
  }

  // assert package.json
  try {
    pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
  }
  catch (e) {
    throw new Error('Missing or invalid package.json')
  }

  // assert npm script "test"
  if (!pkg.scripts || !pkg.scripts.test) {
    throw new Error('No npm "test" script defined. You must define a "test" script in the "scripts" section of your package.json to use --doctor.')
  }

  // read lockfile
  try {
    lockfile = readLockFile()
  }
  catch (e) {
    console.log('No package-lock.json found. Running npm install to generate initial lockfile.')
    await spawn('npm', ['install'], { cwd: process.cwd() })
  }

  // recreate missing lockfile
  if (!lockfile) {
    try {
      lockfile = JSON.parse(fs.readFileSync('package-lock.json', 'utf-8'))
    }
    catch (e) {
      throw new Error('Failed to recreate lockfile.')
    }
  }

}

const doctor = async options => {
  await validate(options)
}

module.exports = doctor
