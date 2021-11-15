import chai from 'chai'
import * as ncu from '../src/index'

chai.should()
process.env.NCU_TESTS = 'true'

describe('github urls', () => {

  it('upgrade github https urls', async () => {
    const upgrades = await ncu.run({
      packageData: JSON.stringify({
        dependencies: {
          'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2#1.0.0'
        }
      })
    })
    upgrades!.should.deep.equal({
      'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2#2.0.0'
    })
  })

  it('upgrade short github urls', async () => {
    const upgrades = await ncu.run({
      packageData: JSON.stringify({
        dependencies: {
          'ncu-test-v2': 'github:raineorshine/ncu-test-v2#1.0.0'
        }
      })
    })
    upgrades!.should.deep.equal({
      'ncu-test-v2': 'github:raineorshine/ncu-test-v2#2.0.0'
    })
  })

  it('upgrade shortest github urls', async () => {
    const upgrades = await ncu.run({
      packageData: JSON.stringify({
        dependencies: {
          'ncu-test-v2': 'raineorshine/ncu-test-v2#1.0.0'
        }
      })
    })
    upgrades!.should.deep.equal({
      'ncu-test-v2': 'raineorshine/ncu-test-v2#2.0.0'
    })
  })

  it('upgrade github http urls with semver', async () => {
    const upgrades = await ncu.run({
      packageData: JSON.stringify({
        dependencies: {
          'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2#semver:^1.0.0'
        }
      })
    })
    upgrades!.should.deep.equal({
      'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2#semver:^2.0.0'
    })
  })

  // does not work in GitHub actions for some reason
  it.skip('upgrade github git+ssh urls with semver', async () => {
    const upgrades = await ncu.run({
      packageData: JSON.stringify({
        dependencies: {
          'ncu-test-v2': 'git+ssh://git@github.com/raineorshine/ncu-test-v2.git#semver:^1.0.0'
        }
      })
    })
    upgrades!.should.deep.equal({
      'ncu-test-v2': 'git+ssh://git@github.com/raineorshine/ncu-test-v2.git#semver:^2.0.0'
    })
  })

})
