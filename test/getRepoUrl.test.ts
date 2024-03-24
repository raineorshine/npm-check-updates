import getRepoUrl from '../src/lib/getRepoUrl.js'
import chaiSetup from './helpers/chaiSetup.js'

const should = chaiSetup()

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
  it('return url directly from repository field if valid https url', async () => {
    const url = await getRepoUrl('package-name', { repository: 'https://github.com/user/repo' })
    url!.should.equal('https://github.com/user/repo')
  })
  it('return url directly from repository field if valid http url', async () => {
    const url = await getRepoUrl('package-name', { repository: 'http://anything.com/user/repo' })
    url!.should.equal('http://anything.com/user/repo')
  })
  it('return url constructed from github shortcut syntax string', async () => {
    const url = await getRepoUrl('package-name', { repository: 'user/repo' })
    url!.should.equal('https://github.com/user/repo')
  })
  it('return url constructed from repository specific shortcut syntax string', async () => {
    const url = await getRepoUrl('package-name', { repository: 'github:user/repo' })
    url!.should.equal('https://github.com/user/repo')
  })
  it('return url directly from url field if not a known git host', async () => {
    const url = await getRepoUrl('package-name', { repository: { url: 'https://any.website.com/some/path' } })
    url!.should.equal('https://any.website.com/some/path')
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
    url!.should.equal('https://github.com/user/repo/tree/HEAD/packages/specific-package')
  })
})
