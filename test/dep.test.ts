import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import path from 'path'
import * as ncu from '../src/'
import stubNpmView from './helpers/stubNpmView'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

it('do not upgrade peerDependencies by default', async () => {
  const stub = stubNpmView('99.9.9')

  const upgraded = await ncu.run({
    packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package-dep.json'), 'utf-8'),
  })

  upgraded!.should.have.property('express')
  upgraded!.should.have.property('chalk')
  upgraded!.should.not.have.property('mocha')

  stub.restore()
})

it('only upgrade devDependencies with --dep dev', async () => {
  const stub = stubNpmView('99.9.9')

  const upgraded = await ncu.run({
    packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package-dep.json'), 'utf-8'),
    dep: 'dev',
  })

  upgraded!.should.not.have.property('express')
  upgraded!.should.have.property('chalk')
  upgraded!.should.not.have.property('mocha')

  stub.restore()
})

it('only upgrade devDependencies and peerDependencies with --dep dev,peer', async () => {
  const upgraded = await ncu.run({
    packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package-dep.json'), 'utf-8'),
    dep: 'dev,peer',
  })

  upgraded!.should.not.have.property('express')
  upgraded!.should.have.property('chalk')
  upgraded!.should.have.property('mocha')
})
