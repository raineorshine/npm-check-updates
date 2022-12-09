import chai from 'chai'
import ncu from '../src'
import stubNpmView from './helpers/stubNpmView'

chai.should()
process.env.NCU_TESTS = 'true'

describe('filterVersion', () => {
  it('filter by package version with string', async () => {
    const stub = stubNpmView({
      'ncu-test-v2': '2.0.0',
      'ncu-test-return-version': '2.0.0',
    })

    const pkg = {
      dependencies: {
        'ncu-test-v2': '1.0.0',
        'ncu-test-return-version': '1.0.1',
      },
    }

    const upgraded = await ncu({
      packageData: pkg,
      filterVersion: '1.0.0',
    })

    upgraded!.should.have.property('ncu-test-v2')
    upgraded!.should.not.have.property('ncu-test-return-version')

    stub.restore()
  })

  it('filter by package version with space-delimited list of strings', async () => {
    const stub = stubNpmView({
      'ncu-test-v2': '2.0.0',
      'ncu-test-return-version': '2.0.0',
      'fp-and-or': '0.1.3',
    })

    const pkg = {
      dependencies: {
        'ncu-test-v2': '1.0.0',
        'ncu-test-return-version': '1.0.1',
        'fp-and-or': '0.1.0',
      },
    }

    const upgraded = await ncu({
      packageData: pkg,
      filterVersion: '1.0.0 0.1.0',
    })

    upgraded!.should.have.property('ncu-test-v2')
    upgraded!.should.not.have.property('ncu-test-return-version')
    upgraded!.should.have.property('fp-and-or')

    stub.restore()
  })

  it('filter by package version with comma-delimited list of strings', async () => {
    const stub = stubNpmView({
      'ncu-test-v2': '2.0.0',
      'ncu-test-return-version': '2.0.0',
      'fp-and-or': '0.1.3',
    })

    const pkg = {
      dependencies: {
        'ncu-test-v2': '1.0.0',
        'ncu-test-return-version': '1.0.1',
        'fp-and-or': '0.1.0',
      },
    }

    const upgraded = await ncu({
      packageData: pkg,
      filterVersion: '1.0.0,0.1.0',
    })

    upgraded!.should.have.property('ncu-test-v2')
    upgraded!.should.not.have.property('ncu-test-return-version')
    upgraded!.should.have.property('fp-and-or')

    stub.restore()
  })

  it('filter by package version with RegExp', async () => {
    const stub = stubNpmView({
      'ncu-test-v2': '2.0.0',
      'ncu-test-return-version': '2.0.0',
      'fp-and-or': '0.1.3',
    })

    const pkg = {
      dependencies: {
        'ncu-test-v2': '1.0.0',
        'ncu-test-return-version': '1.0.1',
        'fp-and-or': '0.1.0',
      },
    }

    const upgraded = await ncu({
      packageData: pkg,
      filterVersion: /^1/,
    })

    upgraded!.should.have.property('ncu-test-v2')
    upgraded!.should.have.property('ncu-test-return-version')
    upgraded!.should.not.have.property('fp-and-or')

    stub.restore()
  })

  it('filter by package version with RegExp string', async () => {
    const stub = stubNpmView({
      'ncu-test-v2': '2.0.0',
      'ncu-test-return-version': '2.0.0',
      'fp-and-or': '0.1.3',
    })

    const pkg = {
      dependencies: {
        'ncu-test-v2': '1.0.0',
        'ncu-test-return-version': '1.0.1',
        'fp-and-or': '0.1.0',
      },
    }

    const upgraded = await ncu({
      packageData: pkg,
      filterVersion: '/^1/',
    })

    upgraded!.should.have.property('ncu-test-v2')
    upgraded!.should.have.property('ncu-test-return-version')
    upgraded!.should.not.have.property('fp-and-or')

    stub.restore()
  })
})
