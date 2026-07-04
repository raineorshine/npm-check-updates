import { describe, expect, it } from 'vitest'
import ncu from '../src/index.ts'
import stubVersions from './helpers/stubVersions.ts'

const packageData = JSON.stringify({
  dependencies: { express: '1.0.0' },
})

describe('max listeners', () => {
  it('does not accumulate exit listeners across repeated ncu.run() calls', async () => {
    const stub = stubVersions('99.9.9')
    const beforeCount = process.listenerCount('exit')

    for (let i = 0; i < 12; i++) {
      await ncu({ packageData })
    }

    const afterCount = process.listenerCount('exit')

    stub.restore()

    expect(afterCount).toBe(beforeCount)
  })
})
