import { describe, expect, it } from 'vitest'
import getRepoUrl from '../src/lib/getRepoUrl.ts'

describe('getRepoUrl', () => {
  it('return null if package is not installed', async () => {
    expect(await getRepoUrl('not-installed/package')).toBeNull()
  })
  it('return null repository field is undefined', async () => {
    expect(await getRepoUrl('package-name', {})).toBeNull()
  })
  it('return null repository field is unknown type', async () => {
    expect(await getRepoUrl('package-name', { repository: true as any /* allow to compile */ })).toBeNull()
  })
  it('return url directly from repository field if valid https url', async () => {
    const url = await getRepoUrl('package-name', { repository: 'https://github.com/user/repo' })
    expect(url).toBe('https://github.com/user/repo')
  })
  it('return url directly from repository field if valid http url', async () => {
    const url = await getRepoUrl('package-name', { repository: 'http://anything.com/user/repo' })
    expect(url).toBe('http://anything.com/user/repo')
  })
  it('return url constructed from github shortcut syntax string', async () => {
    const url = await getRepoUrl('package-name', { repository: 'user/repo' })
    expect(url).toBe('https://github.com/user/repo')
  })
  it('return url constructed from repository specific shortcut syntax string', async () => {
    const url = await getRepoUrl('package-name', { repository: 'github:user/repo' })
    expect(url).toBe('https://github.com/user/repo')
  })
  it('return url directly from url field if not a known git host', async () => {
    const url = await getRepoUrl('package-name', { repository: { url: 'https://any.website.com/some/path' } })
    expect(url).toBe('https://any.website.com/some/path')
  })
  it('return url constructed from git-https protocol', async () => {
    const url = await getRepoUrl('package-name', { repository: { url: 'git+https://github.com/user/repo.git' } })
    expect(url).toBe('https://github.com/user/repo')
  })
  it('return url constructed from git protocol', async () => {
    const url = await getRepoUrl('package-name', { repository: { url: 'git://github.com/user/repo.git' } })
    expect(url).toBe('https://github.com/user/repo')
  })
  it('return url constructed from http protocol', async () => {
    const url = await getRepoUrl('package-name', { repository: { url: 'http://github.com/user/repo.git' } })
    expect(url).toBe('https://github.com/user/repo')
  })
  it('return url with directory path', async () => {
    const url = await getRepoUrl('package-name', {
      repository: { url: 'http://github.com/user/repo.git', directory: 'packages/specific-package' },
    })
    expect(url).toBe('https://github.com/user/repo/tree/HEAD/packages/specific-package')
  })
})
