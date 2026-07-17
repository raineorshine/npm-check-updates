import { describe, expect, it } from 'vitest'
import ncu from '../src/index.ts'

describe('github urls', () => {
  it('upgrade github https urls', async () => {
    const upgrades = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2#1.0.0',
        },
      },
    })
    expect(upgrades).toStrictEqual({
      'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2#2.0.0',
    })
  })

  it('upgrade short github urls', async () => {
    const upgrades = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-v2': 'github:raineorshine/ncu-test-v2#1.0.0',
        },
      },
    })
    expect(upgrades).toStrictEqual({
      'ncu-test-v2': 'github:raineorshine/ncu-test-v2#2.0.0',
    })
  })

  it('upgrade shortest github urls', async () => {
    const upgrades = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-v2': 'raineorshine/ncu-test-v2#1.0.0',
        },
      },
    })
    expect(upgrades).toStrictEqual({
      'ncu-test-v2': 'raineorshine/ncu-test-v2#2.0.0',
    })
  })

  it('upgrade github http urls with semver', async () => {
    const upgrades = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2#semver:^1.0.0',
        },
      },
    })
    expect(upgrades).toStrictEqual({
      'ncu-test-v2': 'https://github.com/raineorshine/ncu-test-v2#semver:^2.0.0',
    })
  })

  // needs a GitHub SSH key for `git ls-remote`, which CI lacks, so it resolves to no upgrade
  it.skip('upgrade github git+ssh urls with semver', async () => {
    const upgrades = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-v2': 'git+ssh://git@github.com/raineorshine/ncu-test-v2.git#semver:^1.0.0',
        },
      },
    })
    expect(upgrades).toStrictEqual({
      'ncu-test-v2': 'git+ssh://git@github.com/raineorshine/ncu-test-v2.git#semver:^2.0.0',
    })
  })
})
