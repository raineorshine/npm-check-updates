import fs from 'fs'
import path from 'path'
import chai from 'chai'
import ncu from '../index'
import { Index } from '../types'

chai.should()
process.env.NCU_TESTS = 'true'

describe('filter', () => {

  it('filter by package name with one arg', async () => {
    const upgraded = await ncu({
      packageData: fs.readFileSync(path.join(__dirname, '../../test/ncu/package2.json'), 'utf-8'),
      filter: ['lodash.map']
    }) as Index<string>
    upgraded.should.have.property('lodash.map')
    upgraded.should.not.have.property('lodash.filter')
  })

  it('filter by package name with multiple args', async () => {
    const upgraded = await ncu({
      packageData: fs.readFileSync(path.join(__dirname, '../../test/ncu/package2.json'), 'utf-8'),
      filter: ['lodash.map', 'lodash.filter']
    }) as Index<string>
    upgraded.should.have.property('lodash.map')
    upgraded.should.have.property('lodash.filter')
  })

  it('filter with wildcard', async () => {
    const upgraded = await ncu({
      packageData: JSON.stringify({
        dependencies: {
          lodash: '2.0.0',
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0'
        }
      }),
      filter: ['lodash.*']
    }) as Index<string>
    upgraded.should.have.property('lodash.map')
    upgraded.should.have.property('lodash.filter')
  })

  it('filter with negated wildcard', async () => {
    const upgraded = await ncu({
      packageData: JSON.stringify({
        dependencies: {
          lodash: '2.0.0',
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0'
        }
      }),
      filter: ['!lodash.*']
    }) as Index<string>
    upgraded.should.have.property('lodash')
  })

  it('filter with regex string', async () => {
    const upgraded = await ncu({
      packageData: JSON.stringify({
        dependencies: {
          lodash: '2.0.0',
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0'
        }
      }),
      filter: '/lodash\\..*/'
    }) as Index<string>
    upgraded.should.have.property('lodash.map')
    upgraded.should.have.property('lodash.filter')
  })

  it('filter with array of strings', async () => {
    const upgraded = await ncu({
      packageData: JSON.stringify({
        dependencies: {
          lodash: '2.0.0',
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0'
        }
      }),
      filter: ['lodash.map', 'lodash.filter']
    }) as Index<string>
    upgraded.should.have.property('lodash.map')
    upgraded.should.have.property('lodash.filter')
  })

  it('filter with array of regex', async () => {
    const upgraded = await ncu({
      packageData: JSON.stringify({
        dependencies: {
          'fp-and-or': '0.1.0',
          lodash: '2.0.0',
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0'
        }
      }),
      filter: [/lodash\..*/, /fp.*/]
    }) as Index<string>
    upgraded.should.have.property('lodash.map')
    upgraded.should.have.property('lodash.filter')
    upgraded.should.have.property('fp-and-or')
  })

  it('filter with array of regex strings', async () => {
    const upgraded = await ncu({
      packageData: JSON.stringify({
        dependencies: {
          'fp-and-or': '0.1.0',
          lodash: '2.0.0',
          'lodash.map': '2.0.0',
          'lodash.filter': '2.0.0'
        }
      }),
      filter: ['/lodash\\..*/', '/fp.*/']
    }) as Index<string>
    upgraded.should.have.property('lodash.map')
    upgraded.should.have.property('lodash.filter')
    upgraded.should.have.property('fp-and-or')
  })

})
