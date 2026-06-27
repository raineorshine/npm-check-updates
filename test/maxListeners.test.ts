import { run as ncu } from '../src/'
import chaiSetup from './helpers/chaiSetup'
import stubVersions from './helpers/stubVersions'

chaiSetup()

const packageData = JSON.stringify({
  dependencies: { express: '1.0.0' },
})

describe('max listeners', function () {
  it('does not accumulate exit listeners across repeated ncu.run() calls', async () => {
    const stub = stubVersions('99.9.9')
    const beforeCount = process.listenerCount('exit')

    for (let i = 0; i < 12; i++) {
      await ncu({ packageData })
    }

    const afterCount = process.listenerCount('exit')

    stub.restore()

    afterCount.should.equal(beforeCount)
  })
})
