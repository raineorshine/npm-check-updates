import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import * as ncu from '../src/'
import stubNpmView from './helpers/stubNpmView'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

const packageData = JSON.stringify({
  dependencies: {
    'ncu-test-v2': '0.1.0',
  },
  devDependencies: {
    'ncu-test-tag': '0.1.0',
  },
  peerDependencies: {
    'ncu-test-10': '0.1.0',
  },
})

it('do not upgrade peerDependencies by default', async () => {
  const stub = stubNpmView('99.9.9')

  const upgraded = await ncu.run({ packageData })

  upgraded!.should.have.property('ncu-test-v2')
  upgraded!.should.have.property('ncu-test-tag')
  upgraded!.should.not.have.property('ncu-test-10')

  stub.restore()
})

it('only upgrade devDependencies with --dep dev', async () => {
  const stub = stubNpmView('99.9.9')

  const upgraded = await ncu.run({ packageData, dep: 'dev' })

  upgraded!.should.not.have.property('ncu-test-v2')
  upgraded!.should.have.property('ncu-test-tag')
  upgraded!.should.not.have.property('ncu-test-10')

  stub.restore()
})

it('only upgrade devDependencies and peerDependencies with --dep dev,peer', async () => {
  const upgraded = await ncu.run({ packageData, dep: 'dev,peer' })

  upgraded!.should.not.have.property('ncu-test-v2')
  upgraded!.should.have.property('ncu-test-tag')
  upgraded!.should.have.property('ncu-test-10')
})
