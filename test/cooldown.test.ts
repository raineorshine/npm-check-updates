import { expect } from 'chai'
import Sinon from 'sinon'
import ncu from '../src/'
import * as npmModule from '../src/package-managers/npm'
import * as pnpmModule from '../src/package-managers/pnpm'
import * as yarnModule from '../src/package-managers/yarn'
import type { PackageFile } from '../src/types/PackageFile'
import type { Packument } from '../src/types/Packument'
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
const createMockVersion = ({ name, versions, distTags }: CreateMockParams): Partial<Packument> => {
  return {
    name,
    version: Object.keys(versions)[0],
    versions: Object.fromEntries(Object.entries(versions).map(([version]) => [version, { version } as Packument])),
    time: Object.fromEntries(Object.entries(versions).map(([version, date]) => [version, date])),
    'dist-tags': distTags,
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
          cooldown: -1,
        }),
      ).to.be.rejectedWith(
        'Cooldown must be a non-negative number (days), a string like "7d", "12h", or "30m", or a predicate function.',
      )
    })

    it('throws error for unrecognized string cooldown', () => {
      expect(
        ncu({
          cooldown: 'invalid',
        }),
      ).to.be.rejectedWith(
        'Invalid cooldown value: "invalid". Use a number (days) or a string like "7d", "12h", or "30m".',
      )
    })
  })

  describe('cooldown string formats', () => {
    it('upgrades package when cooldown is given in days ("6d")', async () => {
      // Given: cooldown "6d" (6 days), version released 7 days ago — outside cooldown
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 7 * DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({
        packageData,
        cooldown: '6d',
        target: 'latest',
      })

      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })

    it('skips upgrade when cooldown is given in days ("6d") and version is inside period', async () => {
      // Given: cooldown "6d" (6 days), version released 5 days ago — inside cooldown
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 5 * DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({
        packageData,
        cooldown: '6d',
        target: 'latest',
      })

      expect(result).to.not.have.property('test-package')

      stub.restore()
    })

    it('upgrades package when cooldown is given in hours ("12h")', async () => {
      // Given: cooldown "12h" (12 hours), version released 13 hours ago — outside cooldown
      const HOUR = DAY / 24
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 13 * HOUR).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({
        packageData,
        cooldown: '12h',
        target: 'latest',
      })

      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })

    it('skips upgrade when cooldown is given in hours ("12h") and version is inside period', async () => {
      // Given: cooldown "12h" (12 hours), version released 11 hours ago — inside cooldown
      const HOUR = DAY / 24
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 11 * HOUR).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({
        packageData,
        cooldown: '12h',
        target: 'latest',
      })

      expect(result).to.not.have.property('test-package')

      stub.restore()
    })

    it('upgrades package when cooldown is given in minutes ("30m")', async () => {
      // Given: cooldown "30m" (30 minutes), version released 31 minutes ago — outside cooldown
      const MINUTE = DAY / (24 * 60)
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 31 * MINUTE).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({
        packageData,
        cooldown: '30m',
        target: 'latest',
      })

      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })

    it('skips upgrade when cooldown is given in minutes ("30m") and version is inside period', async () => {
      // Given: cooldown "30m" (30 minutes), version released 29 minutes ago — inside cooldown
      const MINUTE = DAY / (24 * 60)
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 29 * MINUTE).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({
        packageData,
        cooldown: '30m',
        target: 'latest',
      })

      expect(result).to.not.have.property('test-package')

      stub.restore()
    })

    it('"6d" string is equivalent to the number 6', async () => {
      // Given: both cooldown forms should produce identical results
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const mockData = createMockVersion({
        name: 'test-package',
        versions: { '1.1.0': new Date(NOW - 7 * DAY).toISOString() },
        distTags: { latest: '1.1.0' },
      })

      const stub1 = stubVersions(mockData)
      const resultNumber = await ncu({
        packageData,
        cooldown: 6,
        target: 'latest',
      })
      stub1.restore()

      const stub2 = stubVersions(mockData)
      const resultString = await ncu({
        packageData,
        cooldown: '6d',
        target: 'latest',
      })
      stub2.restore()

      expect(resultNumber).to.deep.equal(resultString)
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

    it('skips package upgrade completely when @next version is inside cooldown period', async () => {
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

  describe('when newest target', () => {
    it('upgrades package to newest version older than cooldown period', async () => {
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
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'newest'
      const result = await ncu({ packageData, cooldown, target: 'newest' })

      // Then: package is upgraded to version 1.1.0 (newest version outside cooldown)
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })
  })

  describe('when minor target', () => {
    it('upgrades package to newest minor version older than cooldown period', async () => {
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
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'minor'
      const result = await ncu({ packageData, cooldown, target: 'minor' })

      // Then: package is upgraded to version 1.1.0 (newest minor version outside cooldown)
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })
  })

  describe('when patch target', () => {
    it('upgrades package to newest patch version older than cooldown period', async () => {
      // Given: test-package@1.0.0 installed, version 1.0.2 released 5 days ago (within cooldown), version 1.0.1 released 15 days ago (outside 10-day cooldown)
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
            '1.0.2': new Date(NOW - 5 * DAY).toISOString(),
            '1.0.1': new Date(NOW - 15 * DAY).toISOString(),
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'patch'
      const result = await ncu({ packageData, cooldown, target: 'patch' })

      // Then: package is upgraded to version 1.0.1 (newest patch version outside cooldown)
      expect(result).to.have.property('test-package', '1.0.1')

      stub.restore()
    })
  })

  describe('when semver target', () => {
    it('upgrades package to newest semver version older than cooldown period', async () => {
      // Given: test-package@1.0.0 installed, version 1.1.0 released 5 days ago (within cooldown), version 1.0.1 released 15 days ago (outside 10-day cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '^1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 5 * DAY).toISOString(),
            '1.0.1': new Date(NOW - 15 * DAY).toISOString(),
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'semver'
      const result = await ncu({ packageData, cooldown, target: 'semver' })

      // Then: package is upgraded to version ^1.0.1 (newest semver version outside cooldown)
      expect(result).to.have.property('test-package', '^1.0.1')
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

  describe('cooldown predicate function', () => {
    it('should skip cooldown check when predicate returns null', async () => {
      // Given: cooldown set to 10, test-package@1.0.0 installed, latest version 1.1.0 released 5 days ago (within cooldown)
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
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // When: cooldown predicate returns null for test-package
      const result = await ncu({
        packageData,
        cooldown: packageName => (packageName === 'test-package' ? null : cooldown),
        target: 'latest',
      })

      // Then: test-package is upgraded to version 1.1.0 (cooldown check skipped)
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })

    it('should apply custom cooldown when predicate returns a number', async () => {
      // Given: default cooldown set to 10, test-package and test-package-2 - both installed in version 1.0.0, and both has the latest version 1.1.0 released 5 days ago (within cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
          'test-package-2': '1.0.0',
        },
      }
      const stub = stubVersions({
        'test-package': createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 5 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
        'test-package-2': createMockVersion({
          name: 'test-package-2',
          versions: {
            '1.1.0': new Date(NOW - 5 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      })

      // When: cooldown predicate returns 5 for test-package (skipping cooldown), and 10 for the rest packages
      const result = await ncu({
        packageData,
        cooldown: (packageName: string) => (packageName === 'test-package' ? 5 : cooldown),
        target: 'latest',
      })

      // Then: test-package is upgraded to version 1.1.0 (as cooldown for this package was set to 5), but test-package-2 is not upgraded (as rest of the packages use default cooldown of 10)
      expect(result).to.have.property('test-package', '1.1.0')
      expect(result).to.not.have.property('test-package-2')

      stub.restore()
    })

    it('should upgrade when predicate returns a sub-day (fractional) value and version is outside that period', async () => {
      // Given: predicate returns 12/24 (= 12 hours), version released 13 hours ago — outside cooldown
      const HOUR = DAY / 24
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 13 * HOUR).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      // When: cooldown predicate returns 12/24 (fractional days = 12 hours)
      const result = await ncu({
        packageData,
        cooldown: () => 12 / 24,
        target: 'latest',
      })

      // Then: test-package is upgraded to 1.1.0
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })

    it('should skip upgrade when predicate returns a sub-day (fractional) value and version is inside that period', async () => {
      // Given: predicate returns 12/24 (= 12 hours), version released 11 hours ago — inside cooldown
      const HOUR = DAY / 24
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 11 * HOUR).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      // When: cooldown predicate returns 12/24 (fractional days = 12 hours)
      const result = await ncu({
        packageData,
        cooldown: () => 12 / 24,
        target: 'latest',
      })

      // Then: test-package is not upgraded
      expect(result).to.not.have.property('test-package')

      stub.restore()
    })

    it('should accept a string ("3m") returned from the predicate for per-package unit suffixes', async () => {
      // Given: predicate returns "3m" (3 minutes) for test-package and 10 (days) for test-package-2;
      //        test-package released 4 minutes ago (outside 3m cooldown),
      //        test-package-2 released 1 day ago (inside 10-day cooldown)
      const MINUTE = DAY / (24 * 60)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
          'test-package-2': '1.0.0',
        },
      }
      const stub = stubVersions({
        'test-package': createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 4 * MINUTE).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
        'test-package-2': createMockVersion({
          name: 'test-package-2',
          versions: { '1.1.0': new Date(NOW - DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      })

      // When: predicate returns a string for one package and a number for another
      const result = await ncu({
        packageData,
        cooldown: (packageName: string) => (packageName === 'test-package' ? '3m' : 10),
        target: 'latest',
      })

      // Then: test-package is upgraded (4 min > 3 min cooldown), test-package-2 is not (1 day < 10 days)
      expect(result).to.have.property('test-package', '1.1.0')
      expect(result).to.not.have.property('test-package-2')

      stub.restore()
    })

    it('should upgrade when predicate returns 0, disabling cooldown for that package', async () => {
      // Given: predicate returns 0 for test-package (no cooldown) and 10 for others; version released 1 day ago
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
          'test-package-2': '1.0.0',
        },
      }
      const stub = stubVersions({
        'test-package': createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
        'test-package-2': createMockVersion({
          name: 'test-package-2',
          versions: { '1.1.0': new Date(NOW - DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      })

      // When: predicate returns 0 for test-package and 10 for everything else
      const result = await ncu({
        packageData,
        cooldown: (packageName: string) => (packageName === 'test-package' ? 0 : 10),
        target: 'latest',
      })

      // Then: test-package is upgraded (cooldown disabled for it), test-package-2 is not
      expect(result).to.have.property('test-package', '1.1.0')
      expect(result).to.not.have.property('test-package-2')

      stub.restore()
    })
  })

  describe('npm config min-release-age', () => {
    it('automatically applies min-release-age from npm config as cooldown when cooldown is not set', async () => {
      // Given: npm config has min-release-age=7, test-package@1.0.0 installed
      // latest version 1.1.0 released 3 days ago (within cooldown), 1.2.0 released 10 days ago (outside cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.2.0': new Date(NOW - 10 * DAY).toISOString(),
            '1.1.0': new Date(NOW - 3 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // Stub findNpmConfig to return a config with minReleaseAge: '7'
      const findNpmConfigStub = Sinon.stub(npmModule, 'findNpmConfig').returns({ minReleaseAge: '7' })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData })

      // Then: package upgrade is skipped because latest version (1.1.0) is within the 7-day min-release-age
      expect(result).to.not.have.property('test-package')

      stub.restore()
      findNpmConfigStub.restore()
    })

    it('does not apply min-release-age when cooldown is explicitly set', async () => {
      // Given: npm config has min-release-age=7, but cooldown is explicitly set to 0
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 3 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // Stub findNpmConfig to return a config with minReleaseAge: '7'
      const findNpmConfigStub = Sinon.stub(npmModule, 'findNpmConfig').returns({ minReleaseAge: '7' })

      // When: ncu is run with explicit cooldown=0 (overrides min-release-age)
      const result = await ncu({ packageData, cooldown: 0 })

      // Then: package is upgraded since explicit cooldown=0 overrides min-release-age
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
      findNpmConfigStub.restore()
    })
  })


  describe('pnpm workspace minimumReleaseAge', () => {
    it('automatically applies minimumReleaseAge from pnpm-workspace.yaml as cooldown when cooldown is not set', async () => {
      // Given: pnpm-workspace.yaml has minimumReleaseAge=1440 (1440 minutes = 1 day),
      // test-package@1.0.0 installed, latest version 1.1.0 released 12 hours ago (within cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // Stub getPnpmWorkspaceMinimumReleaseAge to return a config with minimumReleaseAge: 1440 minutes
      const pnpmWorkspaceStub = Sinon.stub(pnpmModule, 'getPnpmWorkspaceMinimumReleaseAge').resolves({
        minimumReleaseAge: 1440,
        minimumReleaseAgeExclude: [],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData, packageManager: 'pnpm' })

      // Then: package upgrade is skipped because latest version (1.1.0) is within the 1-day cooldown
      expect(result).to.not.have.property('test-package')

      stub.restore()
      pnpmWorkspaceStub.restore()
    })

    it('excludes packages matching minimumReleaseAgeExclude patterns from cooldown', async () => {
      // Given: pnpm-workspace.yaml has minimumReleaseAge=10080 (7 days) with @myorg/* excluded,
      // test-package released 3 days ago (within cooldown), @myorg/pkg released 3 days ago (excluded from cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
          '@myorg/pkg': '1.0.0',
        },
      }
      const stub = stubVersions({
        'test-package': createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
        '@myorg/pkg': createMockVersion({
          name: '@myorg/pkg',
          versions: { '2.0.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '2.0.0' },
        }),
      })

      // Stub getPnpmWorkspaceMinimumReleaseAge to return a config with 7 days cooldown and @myorg/* excluded
      const pnpmWorkspaceStub = Sinon.stub(pnpmModule, 'getPnpmWorkspaceMinimumReleaseAge').resolves({
        minimumReleaseAge: 10080, // 7 days in minutes
        minimumReleaseAgeExclude: ['@myorg/*'],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData, packageManager: 'pnpm' })

      // Then: test-package is skipped (within 7-day cooldown), @myorg/pkg is upgraded (excluded from cooldown)
      expect(result).to.not.have.property('test-package')
      expect(result).to.have.property('@myorg/pkg', '2.0.0')

      stub.restore()
      pnpmWorkspaceStub.restore()
    })

    it('does not apply pnpm minimumReleaseAge when cooldown is explicitly set', async () => {
      // Given: pnpm-workspace.yaml has minimumReleaseAge=10080 (7 days), but cooldown is explicitly set to 0
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 3 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // Stub getPnpmWorkspaceMinimumReleaseAge to return a 7-day config
      const pnpmWorkspaceStub = Sinon.stub(pnpmModule, 'getPnpmWorkspaceMinimumReleaseAge').resolves({
        minimumReleaseAge: 10080,
        minimumReleaseAgeExclude: [],
      })

      // When: ncu is run with explicit cooldown=0 (overrides pnpm minimumReleaseAge)
      const result = await ncu({ packageData, cooldown: 0 })

      // Then: package is upgraded since explicit cooldown=0 overrides pnpm minimumReleaseAge
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
      pnpmWorkspaceStub.restore()
    })

    it('does not apply pnpm minimumReleaseAge when npm min-release-age is set', async () => {
      // Given: both npm config has min-release-age=2 and pnpm-workspace.yaml has minimumReleaseAge=10080 (7 days)
      // test-package latest released 3 days ago (within 7-day pnpm cooldown but outside 2-day npm cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 3 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // Stub npm config with min-release-age=2
      const findNpmConfigStub = Sinon.stub(npmModule, 'findNpmConfig').returns({ minReleaseAge: '2' })
      // Stub pnpm workspace with 7-day cooldown
      const pnpmWorkspaceStub = Sinon.stub(pnpmModule, 'getPnpmWorkspaceMinimumReleaseAge').resolves({
        minimumReleaseAge: 10080,
        minimumReleaseAgeExclude: [],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData })

      // Then: package is upgraded because npm's 2-day cooldown takes precedence and 3 days > 2 days
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
      findNpmConfigStub.restore()
      pnpmWorkspaceStub.restore()
    })
  })

  describe('yarn npmMinimalAgeGate', () => {
    it('automatically applies npmMinimalAgeGate from .yarnrc.yml as cooldown when cooldown is not set', async () => {
      // Given: .yarnrc.yml has npmMinimalAgeGate=86400 (86400 seconds = 1 day),
      // test-package@1.0.0 installed, latest version 1.1.0 released 12 hours ago (within cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // Stub getYarnMinimalAgeGate to return a config with npmMinimalAgeGate: 86400 seconds (1 day)
      const yarnAgeGateStub = Sinon.stub(yarnModule, 'getYarnMinimalAgeGate').resolves({
        npmMinimalAgeGate: 86400,
        npmPreapprovedPackages: [],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData, packageManager: 'yarn' })

      // Then: package upgrade is skipped because latest version (1.1.0) is within the 1-day cooldown
      expect(result).to.not.have.property('test-package')

      stub.restore()
      yarnAgeGateStub.restore()
    })

    it('upgrades packages older than npmMinimalAgeGate', async () => {
      // Given: .yarnrc.yml has npmMinimalAgeGate=86400 (1 day),
      // test-package@1.0.0 installed, latest version 1.1.0 released 2 days ago (outside cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 2 * DAY).toISOString(), // 2 days ago
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      const yarnAgeGateStub = Sinon.stub(yarnModule, 'getYarnMinimalAgeGate').resolves({
        npmMinimalAgeGate: 86400,
        npmPreapprovedPackages: [],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData, packageManager: 'yarn' })

      // Then: package is upgraded because 2 days > 1 day cooldown
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
      yarnAgeGateStub.restore()
    })

    it('excludes packages listed in npmPreapprovedPackages from cooldown', async () => {
      // Given: .yarnrc.yml has npmMinimalAgeGate=604800 (7 days) with @myorg/pkg pre-approved,
      // test-package released 3 days ago (within cooldown), @myorg/pkg released 3 days ago (pre-approved)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
          '@myorg/pkg': '1.0.0',
        },
      }
      const stub = stubVersions({
        'test-package': createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
        '@myorg/pkg': createMockVersion({
          name: '@myorg/pkg',
          versions: { '2.0.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '2.0.0' },
        }),
      })

      // Stub getYarnMinimalAgeGate to return a 7-day cooldown with @myorg/pkg pre-approved
      const yarnAgeGateStub = Sinon.stub(yarnModule, 'getYarnMinimalAgeGate').resolves({
        npmMinimalAgeGate: 604800,
        npmPreapprovedPackages: ['@myorg/pkg'],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData, packageManager: 'yarn' })

      // Then: test-package is skipped (within 7-day cooldown), @myorg/pkg is upgraded (pre-approved)
      expect(result).to.not.have.property('test-package')
      expect(result).to.have.property('@myorg/pkg', '2.0.0')

      stub.restore()
      yarnAgeGateStub.restore()
    })

    it('does not apply npmMinimalAgeGate when cooldown is explicitly set', async () => {
      // Given: .yarnrc.yml has npmMinimalAgeGate=604800 (7 days), but cooldown is explicitly set to 0
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 3 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      const yarnAgeGateStub = Sinon.stub(yarnModule, 'getYarnMinimalAgeGate').resolves({
        npmMinimalAgeGate: 604800,
        npmPreapprovedPackages: [],
      })

      // When: ncu is run with explicit cooldown=0 (overrides npmMinimalAgeGate)
      const result = await ncu({ packageData, cooldown: 0 })

      // Then: package is upgraded since explicit cooldown=0 overrides npmMinimalAgeGate
      expect(result).to.have.property('test-package', '1.1.0')
      expect(yarnAgeGateStub.called).to.equal(false)

      stub.restore()
      yarnAgeGateStub.restore()
    })

    it('does not apply npmMinimalAgeGate when npm min-release-age is set', async () => {
      // Given: both npm config has min-release-age=2 and .yarnrc.yml has npmMinimalAgeGate=604800 (7 days)
      // test-package latest released 3 days ago (within 7-day yarn cooldown but outside 2-day npm cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 3 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // Stub npm config with min-release-age=2
      const findNpmConfigStub = Sinon.stub(npmModule, 'findNpmConfig').returns({ minReleaseAge: '2' })
      const yarnAgeGateStub = Sinon.stub(yarnModule, 'getYarnMinimalAgeGate').resolves({
        npmMinimalAgeGate: 604800,
        npmPreapprovedPackages: [],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData, packageManager: 'yarn' })

      // Then: package is upgraded because npm's 2-day cooldown takes precedence and 3 days > 2 days
      expect(result).to.have.property('test-package', '1.1.0')
      expect(yarnAgeGateStub.called).to.equal(false)

      stub.restore()
      findNpmConfigStub.restore()
      yarnAgeGateStub.restore()
    })
  })
})
