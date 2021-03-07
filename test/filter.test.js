'use strict'

const fs = require('fs')
const path = require('path')
const chai = require('chai')
const repoUrl = require('../lib/repo-url')
const ncu = require('../lib/index')

const should = chai.should()

describe('filter', () => {

  it('filter by package name with one arg', async () => {
    const upgraded = await ncu.run({
      packageData: fs.readFileSync(path.join(__dirname, '/ncu/package2.json'), 'utf-8'),
      args: ['lodash.map']
    })
    upgraded.should.have.property('lodash.map'),
    upgraded.should.not.have.property('lodash.filter')
  })

  it('filter by package name with multiple args', async () => {
    const upgraded = await ncu.run({
      packageData: fs.readFileSync(path.join(__dirname, '/ncu/package2.json'), 'utf-8'),
      args: ['lodash.map', 'lodash.filter']
    })
    upgraded.should.have.property('lodash.map'),
    upgraded.should.have.property('lodash.filter')
  })

})
