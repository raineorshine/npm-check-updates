import { describe, expect, it, vi } from 'vitest'
import { chalkInit } from '../src/lib/chalk.ts'
import getPeerDependenciesFromRegistry from '../src/lib/getPeerDependenciesFromRegistry.ts'
import { silenceProgressBar } from './helpers/silenceProgressBar.ts'

describe('getPeerDependenciesFromRegistry', () => {
  it('single package', async () => {
    chalkInit()
    silenceProgressBar()
    const data = await getPeerDependenciesFromRegistry({ 'ncu-test-peer': '1.0' }, {})
    expect(data).toStrictEqual({
      'ncu-test-peer': {
        'ncu-test-return-version': '1.x',
      },
    })
  })

  it('single package empty', async () => {
    chalkInit()
    silenceProgressBar()
    const data = await getPeerDependenciesFromRegistry({ 'ncu-test-return-version': '1.0' }, {})
    expect(data).toStrictEqual({ 'ncu-test-return-version': {} })
  })

  it('multiple packages', async () => {
    chalkInit()
    silenceProgressBar()
    const data = await getPeerDependenciesFromRegistry(
      {
        'ncu-test-return-version': '1.0.0',
        'ncu-test-peer': '1.0.0',
      },
      {},
    )
    expect(data).toStrictEqual({
      'ncu-test-return-version': {},
      'ncu-test-peer': {
        'ncu-test-return-version': '1.x',
      },
    })
  })

  it('warns when peer dependencies cannot be fetched instead of reporting none', async () => {
    chalkInit()
    silenceProgressBar()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const data = await getPeerDependenciesFromRegistry({ 'ncu-test-return-version': '99.99.99' }, {})

    expect(data).toStrictEqual({ 'ncu-test-return-version': {} })
    const warnings = logSpy.mock.calls
      .flat()
      .filter(arg => typeof arg === 'string' && arg.includes('Could not determine the peer dependencies'))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('ncu-test-return-version')

    logSpy.mockRestore()
  })
})
