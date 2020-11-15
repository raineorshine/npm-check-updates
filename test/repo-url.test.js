'use strict'

const chai = require('chai')
const repoUrl = require('../lib/repo-url')

const should = chai.should()

describe('repo-url', () => {

  describe('getRepoUrl', () => {
    it('return null if package is not installed', () => {
      should.equal(repoUrl.getRepoUrl('not-installed/package'), null)
    })
    it('return null repository field is undefined', () => {
      should.equal(repoUrl.getRepoUrl('package-name', {}), null)
    })
    it('return null repository field is unknown type', () => {
      should.equal(repoUrl.getRepoUrl('package-name', { repository: true }), null)
    })
    it('return url directly from repository field if valid github url', () => {
      repoUrl.getRepoUrl('package-name', { repository: 'https://github.com/user/repo' }).should.equal('https://github.com/user/repo')
    })
    it('return url directly from repository field if valid gitlab url', () => {
      repoUrl.getRepoUrl('package-name', { repository: 'https://gitlab.com/user/repo' }).should.equal('https://gitlab.com/user/repo')
    })
    it('return url directly from repository field if valid bitbucket url', () => {
      repoUrl.getRepoUrl('package-name', { repository: 'https://bitbucket.org/user/repo' }).should.equal('https://bitbucket.org/user/repo')
    })
    it('return url constructed from github shortcut syntax string', () => {
      repoUrl.getRepoUrl('package-name', { repository: 'user/repo' }).should.equal('https://github.com/user/repo')
    })
    it('return url constructed from repository specific shortcut syntax string', () => {
      repoUrl.getRepoUrl('package-name', { repository: 'github:user/repo' }).should.equal('https://github.com/user/repo')
    })
    it('return url constructed from git-https protocol', () => {
      repoUrl.getRepoUrl('package-name', { repository: { url: 'git+https://github.com/user/repo.git' } }).should.equal('https://github.com/user/repo')
    })
    it('return url constructed from git protocol', () => {
      repoUrl.getRepoUrl('package-name', { repository: { url: 'git://github.com/user/repo.git' } }).should.equal('https://github.com/user/repo')
    })
    it('return url constructed from http protocol', () => {
      repoUrl.getRepoUrl('package-name', { repository: { url: 'http://github.com/user/repo.git' } }).should.equal('https://github.com/user/repo')
    })
    it('return url with directory path', () => {
      repoUrl.getRepoUrl('package-name', { repository: { url: 'http://github.com/user/repo.git', directory: 'packages/specific-package' } }).should.equal('https://github.com/user/repo/tree/master/packages/specific-package')
    })
  })

})
