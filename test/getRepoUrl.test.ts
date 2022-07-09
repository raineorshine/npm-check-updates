import chai from 'chai'
import getRepoUrl from '../src/lib/getRepoUrl'

const should = chai.should()

describe('getRepoUrl', () => {
  it('return null if package is not installed', async () => {
    should.equal(await getRepoUrl('not-installed/package'), null)
  })
  it('return null repository field is undefined', async () => {
    should.equal(await getRepoUrl('package-name', {}), null)
  })
  it('return null repository field is unknown type', async () => {
    should.equal(await getRepoUrl('package-name', { repository: true as any /* allow to compile */ }), null)
  })
  it('return url directly from repository field if valid github url', async () => {
    const url = await getRepoUrl('package-name', { repository: 'https://github.com/user/repo' })
    url!.should.equal('https://github.com/user/repo')
  })
  it('return url directly from repository field if valid gitlab url', async () => {
    const url = await getRepoUrl('package-name', { repository: 'https://gitlab.com/user/repo' })
    url!.should.equal('https://gitlab.com/user/repo')
  })
  it('return url directly from repository field if valid bitbucket url', async () => {
    const url = await getRepoUrl('package-name', { repository: 'https://bitbucket.org/user/repo' })
    url!.should.equal('https://bitbucket.org/user/repo')
  })
  it('return url constructed from github shortcut syntax string', async () => {
    const url = await getRepoUrl('package-name', { repository: 'user/repo' })
    url!.should.equal('https://github.com/user/repo')
  })
  it('return url constructed from repository specific shortcut syntax string', async () => {
    const url = await getRepoUrl('package-name', { repository: 'github:user/repo' })
    url!.should.equal('https://github.com/user/repo')
  })
  it('return url constructed from git-https protocol', async () => {
    const url = await getRepoUrl('package-name', { repository: { url: 'git+https://github.com/user/repo.git' } })
    url!.should.equal('https://github.com/user/repo')
  })
  it('return url constructed from git protocol', async () => {
    const url = await getRepoUrl('package-name', { repository: { url: 'git://github.com/user/repo.git' } })
    url!.should.equal('https://github.com/user/repo')
  })
  it('return url constructed from http protocol', async () => {
    const url = await getRepoUrl('package-name', { repository: { url: 'http://github.com/user/repo.git' } })
    url!.should.equal('https://github.com/user/repo')
  })
  it('return url with directory path', async () => {
    const url = await getRepoUrl('package-name', {
      repository: { url: 'http://github.com/user/repo.git', directory: 'packages/specific-package' },
    })
    url!.should.equal('https://github.com/user/repo/tree/master/packages/specific-package')
  })
})
