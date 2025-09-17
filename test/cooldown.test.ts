import { expect } from 'chai'
import Sinon from 'sinon'
import ncu from '../src/'
import { MockedVersions } from '../src/types/MockedVersions'
import { PackageFile } from '../src/types/PackageFile'
import { Packument } from '../src/types/Packument'
import chaiSetup from './helpers/chaiSetup'
import stubVersions from './helpers/stubVersions'

chaiSetup()

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()

interface CreateMockParams {
  name: string
  versions: Record<string, string>
  distTags?: Record<string, string>
}

/**
 * Creates a mock package version object for testing purposes.
 *
 * @param params - The parameters for creating the mock version.
 * @param params.name - The name of the package.
 * @param params.versions - An object mapping version strings to their corresponding release dates.
 * @param params.distTags - An object representing distribution tags for the package.
 * @returns An object representing mocked package versions, including name, versions, time, and distTags.
 */
const createMockVersion = ({ name, versions, distTags }: CreateMockParams): MockedVersions => {
  return {
    name,
    version: Object.keys(versions)[0],
    versions: Object.fromEntries(Object.entries(versions).map(([version]) => [version, { version } as Packument])),
    time: Object.fromEntries(Object.entries(versions).map(([version, date]) => [version, date])),
    distTags,
  }
}

describe('cooldown', () => {
  beforeEach(() => {
    Sinon.restore()
  })

  describe('invalid cooldown values', () => {
    it('throws error for negative cooldown', () => {
      expect(
        ncu({
          packageFile: 'test/test-data/cooldown/package.json',
          cooldown: -1,
        }),
      ).to.be.rejectedWith('Cooldown must be a non-negative integer representing days')
    })

    it('throws error for non-numeric cooldown', () => {
      expect(
        ncu({
          packageFile: 'test/test-data/cooldown/package.json',
          // @ts-expect-error -- testing invalid input
          cooldown: 'invalid',
        }),
      ).to.be.rejectedWith('Cooldown must be a non-negative integer representing days')
    })
  })

  it('upgrades when cooldown is not set', async () => {
    // Given: no cooldown set, test-package@1.0.0 installed, latest version 1.2.0 released 1 day ago
    const packageData: PackageFile = {
      dependencies: {
        'test-package': '1.0.0',
      },
    }
    const stub = stubVersions(
      createMockVersion({
        name: 'test-package',
        versions: {
          '1.2.0': new Date(NOW - DAY).toISOString(),
        },
        distTags: {
          latest: '1.2.0',
        },
      }),
    )

    // When: running ncu without cooldown
    const result = await ncu({ packageData })

    // Then: package is upgraded to latest version (1.2.0)
    expect(result).to.have.property('test-package', '1.2.0')

    stub.restore()
  })

  it('upgrades package when cooldown is set to 0 (no cooldown)', async () => {
    // Given: cooldown set to 0, test-package@1.0.0 installed, latest version 1.2.0 released 1 day ago
    const cooldown = 0
    const packageData: PackageFile = {
      dependencies: {
        'test-package': '1.0.0',
      },
    }
    const stub = stubVersions(
      createMockVersion({
        name: 'test-package',
        versions: {
          '1.2.0': new Date(NOW - DAY).toISOString(),
        },
        distTags: {
          latest: '1.2.0',
        },
      }),
    )

    // When ncu is run with a 0 day cooldown parameter
    const result = await ncu({ packageData, cooldown })

    // Then test-package should be upgraded to version 1.2.0 (latest) - as cooldown of 0 means no cooldown.
    expect(result).to.have.property('test-package', '1.2.0')

    stub.restore()
  })

  describe('when latest target', () => {
    it('upgrades package when latest version was released outside cooldown period', async () => {
      // Given: cooldown set to 10, test-package@1.0.0 installed, latest version 1.1.0 released 15 days ago (outside 10-day cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 15 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'latest'
      const result = await ncu({ packageData, cooldown, target: 'latest' })

      // Then: package is upgraded to version 1.1.0
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })

    it('skips package upgrade completely when latest version is inside cooldown period', async () => {
      // Given: cooldown set to 10, test-package@1.0.0 installed, latest version 1.1.0 released 5 days ago (within 10-day cooldown), older version 1.0.1 released 10 days ago
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 5 * DAY).toISOString(),
            '1.0.1': new Date(NOW - 10 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'latest'
      const result = await ncu({ packageData, cooldown, target: 'latest' })

      // Then: package is not upgraded (latest version within cooldown, 1.0.1 is ignored as not latest)
      expect(result).to.not.have.property('test-package')

      stub.restore()
    })
  })

  describe('when @TAG target', () => {
    it('upgrades package when @next version was released outside cooldown period', async () => {
      // Given: cooldown set to 10, test-package@1.0.0 installed, @next version 1.1.0-rc.1 released 15 days ago (outside 10-day cooldown boundary)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0-rc.1': new Date(NOW - 15 * DAY).toISOString(),
          },
          distTags: {
            next: '1.1.0-rc.1',
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is '@next'
      const result = await ncu({ packageData, cooldown, target: '@next' })

      // Then: package is upgraded to @next version 1.1.0-rc.1
      expect(result).to.have.property('test-package', '1.1.0-rc.1')

      stub.restore()
    })

    it('skips package upgrade completely when latest version is inside cooldown period', async () => {
      // Given: cooldown days is set to 10 days, test-package is installed in version 1.0.0, and the @next version - 1.1.0-rc.2 was released 5 days ago (inside cooldown period). Another version 1.1.0-rc.1 was released 10 days ago (outside cooldown period), but it is not marked as @next version.
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0-rc.2': new Date(NOW - 5 * DAY).toISOString(),
            '1.1.0-rc.1': new Date(NOW - 10 * DAY).toISOString(),
          },
          distTags: {
            next: '1.1.0-rc.2',
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is '@next'
      const result = await ncu({ packageData, cooldown, target: '@next' })

      // Then: package is not upgraded (next version within cooldown, 1.1.0-rc.2 is ignored as not tagged as next)
      expect(result).to.not.have.property('test-package')

      stub.restore()
    })
  })

  describe('when greatest target', () => {
    it('upgrades package to greatest version older than cooldown period', async () => {
      // Given: test-package@1.0.0 installed, version 1.2.0 released 5 days ago (within cooldown), version 1.1.0 released 15 days ago (outside 10-day cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.2.0': new Date(NOW - 5 * DAY).toISOString(),
            '1.1.0': new Date(NOW - 15 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.2.0',
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'greatest'
      const result = await ncu({ packageData, cooldown, target: 'greatest' })

      // Then: package is upgraded to version 1.1.0 (oldest version outside cooldown)
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })

    it('skips package upgrade if no versions are older than cooldown period', async () => {
      // Given: test-package@1.0.0 installed, all versions (1.1.0, 1.2.0) released within 10-day cooldown (8 and 5 days ago)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.2.0': new Date(NOW - 5 * DAY).toISOString(),
            '1.1.0': new Date(NOW - 8 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.2.0',
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'greatest'
      const result = await ncu({ packageData, cooldown, target: 'greatest' })

      // Then test-package should not be upgraded (as no versions were released outside cooldown period)
      expect(result).to.not.have.property('test-package')

      stub.restore()
    })
  })

  it('skips package upgrade if no time data and cooldown is set', async () => {
    // Given: cooldown days is set to 10 days, test-package is installed in version 1.0.0, and the latest version - 1.1.0 was released 5 days ago (inside cooldown period). Another version 1.0.1 was released 10 days ago (outside cooldown period), but it is not the latest version, so it should not be upgraded either.
    const cooldown = 10
    const packageData: PackageFile = {
      dependencies: {
        'test-package': '1.0.0',
      },
    }
    const stub = stubVersions(
      createMockVersion({
        name: 'test-package',
        versions: {
          // @ts-expect-error -- testing missing time data
          '1.1.0': undefined,
          // @ts-expect-error -- testing missing time data
          '1.0.1': undefined,
        },
        distTags: {
          latest: '1.1.0',
        },
      }),
    )

    // When ncu is run with a 1 day cooldown parameter
    const result = await ncu({ packageData, cooldown })

    // Then test-package should not be upgraded
    expect(result).to.not.have.property('test-package')

    stub.restore()
  })

  it('upgrades package when version was released exactly at the cooldown boundary', async () => {
    // Given: test-package@1.0.0 installed, latest version 1.1.0 released exactly 10 days ago (at cooldown boundary)
    const cooldown = 10
    const packageData: PackageFile = {
      dependencies: {
        'test-package': '1.0.0',
      },
    }
    const stub = stubVersions(
      createMockVersion({
        name: 'test-package',
        versions: {
          '1.1.0': new Date(NOW - 10 * DAY).toISOString(),
        },
        distTags: {
          latest: '1.1.0',
        },
      }),
    )

    // When ncu is run with the cooldown parameter and target is 'latest'
    const result = await ncu({ packageData, cooldown, target: 'latest' })

    // Then: test-package should be upgraded to version 1.1.0 (as 1.1.0 was released exactly at the cooldown boundary)
    expect(result).to.have.property('test-package', '1.1.0')

    stub.restore()
  })
})
