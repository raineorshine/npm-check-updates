import chai from 'chai'
import getRepoUrl from '../src/lib/getRepoUrl'

const should = chai.should()

describe('getRepoUrl', () => {
  it('return null if package is not installed', () => {
    should.equal(getRepoUrl('not-installed/package'), null)
  })
  it('return null repository field is undefined', () => {
    should.equal(getRepoUrl('package-name', {}), null)
  })
  it('return null repository field is unknown type', () => {
    should.equal(getRepoUrl('package-name', { repository: true as any /* allow to compile */ }), null)
  })
  it('return url directly from repository field if valid github url', () => {
    getRepoUrl('package-name', { repository: 'https://github.com/user/repo' })!.should.equal('https://github.com/user/repo')
  })
  it('return url directly from repository field if valid gitlab url', () => {
    getRepoUrl('package-name', { repository: 'https://gitlab.com/user/repo' })!.should.equal('https://gitlab.com/user/repo')
  })
  it('return url directly from repository field if valid bitbucket url', () => {
    getRepoUrl('package-name', { repository: 'https://bitbucket.org/user/repo' })!.should.equal('https://bitbucket.org/user/repo')
  })
  it('return url constructed from github shortcut syntax string', () => {
    getRepoUrl('package-name', { repository: 'user/repo' })!.should.equal('https://github.com/user/repo')
  })
  it('return url constructed from repository specific shortcut syntax string', () => {
    getRepoUrl('package-name', { repository: 'github:user/repo' })!.should.equal('https://github.com/user/repo')
  })
  it('return url constructed from git-https protocol', () => {
    getRepoUrl('package-name', { repository: { url: 'git+https://github.com/user/repo.git' } })!.should.equal('https://github.com/user/repo')
  })
  it('return url constructed from git protocol', () => {
    getRepoUrl('package-name', { repository: { url: 'git://github.com/user/repo.git' } })!.should.equal('https://github.com/user/repo')
  })
  it('return url constructed from http protocol', () => {
    getRepoUrl('package-name', { repository: { url: 'http://github.com/user/repo.git' } })!.should.equal('https://github.com/user/repo')
  })
  it('return url with directory path', () => {
    getRepoUrl('package-name', { repository: { url: 'http://github.com/user/repo.git', directory: 'packages/specific-package' } })!.should.equal('https://github.com/user/repo/tree/master/packages/specific-package')
  })
})
