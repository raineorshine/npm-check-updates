import chai from 'chai'
import upgradeDependencies from '../src/lib/upgradeDependencies'

chai.should()
process.env.NCU_TESTS = 'true'

describe('upgradeDependencies', () => {

  it('upgrade simple, non-semver versions', () => {
    upgradeDependencies({ foo: '1' }, { foo: '2' }).should.eql({ foo: '2' })
    upgradeDependencies({ foo: '1.0' }, { foo: '1.1' }).should.eql({ foo: '1.1' })
    upgradeDependencies({ 'ncu-test-simple-tag': 'v1' }, { 'ncu-test-simple-tag': 'v3' }).should.eql({ 'ncu-test-simple-tag': 'v3' })
  })

  it('upgrade github dependencies', () => {
    upgradeDependencies({ foo: 'github:foo/bar#v1' }, { foo: 'github:foo/bar#v2' }).should.eql({ foo: 'github:foo/bar#v2' })
    upgradeDependencies({ foo: 'github:foo/bar#v1.0' }, { foo: 'github:foo/bar#v2.0' }).should.eql({ foo: 'github:foo/bar#v2.0' })
    upgradeDependencies({ foo: 'github:foo/bar#v1.0.0' }, { foo: 'github:foo/bar#v2.0.0' }).should.eql({ foo: 'github:foo/bar#v2.0.0' })
  })

  it('upgrade latest versions that already satisfy the specified version', () => {
    upgradeDependencies({ mongodb: '^1.0.0' }, { mongodb: '1.4.30' }).should.eql({
      mongodb: '^1.4.30'
    })
  })

  it('do not downgrade', () => {
    upgradeDependencies({ mongodb: '^2.0.7' }, { mongodb: '1.4.30' }).should.eql({})
  })

  it('use the preferred wildcard when converting <, closed, or mixed ranges', () => {
    upgradeDependencies({ a: '1.*', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.*' })
    upgradeDependencies({ a: '1.x', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.x' })
    upgradeDependencies({ a: '~1', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '~3.0' })
    upgradeDependencies({ a: '^1', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '^3.0' })

    upgradeDependencies({ a: '1.*', mongodb: '1.0 < 2.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.*' })
    upgradeDependencies({ mongodb: '1.0 < 2.*' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.*' })
  })

  it('convert closed ranges to caret (^) when preferred wildcard is unknown', () => {
    upgradeDependencies({ mongodb: '1.0 < 2.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '^3.0' })
  })

  it('ignore packages with empty values', () => {
    upgradeDependencies({ mongodb: null }, { mongodb: '1.4.30' })
      .should.eql({})
    upgradeDependencies({ mongodb: '' }, { mongodb: '1.4.30' })
      .should.eql({})
  })

})
