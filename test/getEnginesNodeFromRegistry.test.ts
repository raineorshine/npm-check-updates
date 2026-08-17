import { describe, expect, it } from 'vitest'
import getEnginesNodeFromRegistry from '../src/lib/getEnginesNodeFromRegistry.ts'
import { styleInit } from '../src/lib/style.ts'
import { silenceProgressBar } from './helpers/silenceProgressBar.ts'

describe('getEnginesNodeFromRegistry', () => {
  it('single package', async () => {
    styleInit()
    silenceProgressBar()
    const data = await getEnginesNodeFromRegistry({ del: '2.0.0' }, {})
    expect(data).toStrictEqual({
      del: '>=0.10.0',
    })
  })

  it('single package empty', async () => {
    styleInit()
    silenceProgressBar()
    const data = await getEnginesNodeFromRegistry({ 'ncu-test-return-version': '1.0.0' }, {})
    expect(data).toStrictEqual({ 'ncu-test-return-version': undefined })
  })

  it('multiple packages', async () => {
    styleInit()
    silenceProgressBar()
    const data = await getEnginesNodeFromRegistry(
      {
        'ncu-test-return-version': '1.0.0',
        'ncu-test-peer': '1.0.0',
        del: '2.0.0',
      },
      {},
    )
    expect(data).toStrictEqual({
      'ncu-test-return-version': undefined,
      'ncu-test-peer': undefined,
      del: '>=0.10.0',
    })
  })
})
