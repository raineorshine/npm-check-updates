const fs = require('fs')
const path = require('path')
const spawn = require('spawn-please')

const readLockFile = () =>
  JSON.parse(fs.readFileSync('package-lock.json', 'utf-8'))

const doctor = async options => {

  console.error(await spawn('ls'))

  let lockfile
  try {
    lockfile = readLockFile()
  }
  catch (e) {
    console.error('oi')
    console.log('No package-lock.json found. Running npm install to generate initial lockfile.')
    await spawn('npm', ['install'], { cwd: process.cwd() })
  }

  if (!lockfile) {
    try {
      lockfile = JSON.parse(fs.readFileSync('package-lock.json', 'utf-8'))
    }
    catch (e) {
      throw new Error('Failed to recreate lockfile.')
    }
  }

  // const output = await spawn('npm', ['install'])
  // console.log('output', output)
}

module.exports = doctor
