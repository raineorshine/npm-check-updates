import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import ncu from '../src'
import { Index } from '../src/types/IndexType'
import stubNpmView from './helpers/stubNpmView'

chai.should()
process.env.NCU_TESTS = 'true'

describe('filter', () => {
  it('filter by package name with one arg', async () => {
    const stub = stubNpmView('99.9.9')
    const upgraded = (await ncu({
      packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package2.json'), 'utf-8'),
      filter: ['lodash.map'],
    })) as Index<string>
    upgraded.should.have.property('lodash.map')
    upgraded.should.not.have.property('lodash.filter')
    stub.restore()
  })

  it('filter by package name with multiple args', async () => {
    const stub = stubNpmView('99.9.9')
    const upgraded = (await ncu({
      packageData: await fs.readFile(path.join(__dirname, 'test-data/ncu/package2.json'), 'utf-8'),
      filter: ['lodash.map', 'lodash.filter'],
    })) as Index<string>
    upgraded.should.have.property('lodash.map')
    upgraded.should.have.property('lodash.filter')
    stub.restore()
  })

  it('filter with wildcard', async () => {
    const stub = stubNpmView('99.9.9')
    const upgraded = (await ncu({
      packageData: {
        dependencies: {
          lodash: '2.0.0',
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0',
        },
      },
      filter: ['lodash.*'],
    })) as Index<string>
    upgraded.should.have.property('lodash.map')
    upgraded.should.have.property('lodash.filter')
    stub.restore()
  })

  it('filter with wildcard for scoped package', async () => {
    const stub = stubNpmView('99.9.9')
    const pkg = {
      dependencies: {
        vite: '1.0.0',
        '@vitejs/plugin-react': '1.0.0',
        '@vitejs/plugin-vue': '1.0.0',
      },
    }

    {
      const upgraded = await ncu({ packageData: pkg, filter: ['vite'] })
      upgraded!.should.have.property('vite')
      upgraded!.should.not.have.property('@vitejs/plugin-react')
      upgraded!.should.not.have.property('@vitejs/plugin-vue')
    }

    {
      const upgraded = await ncu({ packageData: pkg, filter: ['@vite*'] })
      upgraded!.should.not.have.property('vite')
      upgraded!.should.have.property('@vitejs/plugin-react')
      upgraded!.should.have.property('@vitejs/plugin-vue')
    }

    {
      const upgraded = await ncu({ packageData: pkg, filter: ['*vite*'] })
      upgraded!.should.have.property('vite')
      upgraded!.should.have.property('@vitejs/plugin-react')
      upgraded!.should.have.property('@vitejs/plugin-vue')
    }

    {
      const upgraded = await ncu({ packageData: pkg, filter: ['*vite*/*react*'] })
      upgraded!.should.not.have.property('vite')
      upgraded!.should.have.property('@vitejs/plugin-react')
      upgraded!.should.not.have.property('@vitejs/plugin-vue')
    }

    {
      const upgraded = await ncu({ packageData: pkg, filter: ['*vite*vue*'] })
      upgraded!.should.not.have.property('vite')
      upgraded!.should.not.have.property('@vitejs/plugin-react')
      upgraded!.should.have.property('@vitejs/plugin-vue')
    }

    stub.restore()
  })

  it('filter with negated wildcard', async () => {
    const stub = stubNpmView('99.9.9')
    const upgraded = (await ncu({
      packageData: {
        dependencies: {
          lodash: '2.0.0',
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0',
        },
      },
      filter: ['!lodash.*'],
    })) as Index<string>
    upgraded.should.have.property('lodash')
    stub.restore()
  })

  it('filter with regex string', async () => {
    const stub = stubNpmView('99.9.9')
    const upgraded = (await ncu({
      packageData: {
        dependencies: {
          lodash: '2.0.0',
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0',
        },
      },
      filter: '/lodash\\..*/',
    })) as Index<string>
    upgraded.should.have.property('lodash.map')
    upgraded.should.have.property('lodash.filter')
    stub.restore()
  })

  it('filter with array of strings', async () => {
    const stub = stubNpmView('99.9.9')
    const upgraded = (await ncu({
      packageData: {
        dependencies: {
          lodash: '2.0.0',
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0',
        },
      },
      filter: ['lodash.map', 'lodash.filter'],
    })) as Index<string>
    upgraded.should.have.property('lodash.map')
    upgraded.should.have.property('lodash.filter')
    stub.restore()
  })

  it('filter with array of regex', async () => {
    const stub = stubNpmView('99.9.9')
    const upgraded = (await ncu({
      packageData: {
        dependencies: {
          'fp-and-or': '0.1.0',
          lodash: '2.0.0',
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0',
        },
      },
      filter: [/lodash\..*/, /fp.*/],
    })) as Index<string>
    upgraded.should.have.property('lodash.map')
    upgraded.should.have.property('lodash.filter')
    upgraded.should.have.property('fp-and-or')
    stub.restore()
  })

  it('filter with array of regex strings', async () => {
    const stub = stubNpmView('99.9.9')
    const upgraded = (await ncu({
      packageData: {
        dependencies: {
          'fp-and-or': '0.1.0',
          lodash: '2.0.0',
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0',
        },
      },
      filter: ['/lodash\\..*/', '/fp.*/'],
    })) as Index<string>
    upgraded.should.have.property('lodash.map')
    upgraded.should.have.property('lodash.filter')
    upgraded.should.have.property('fp-and-or')
    stub.restore()
  })
})
