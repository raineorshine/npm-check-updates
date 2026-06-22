import ncu from '../src/'
import { type FilterFunction } from '../src/types/FilterFunction'
import { type Index } from '../src/types/IndexType'
import { type MockedVersions } from '../src/types/MockedVersions'
import { type TargetFunction } from '../src/types/TargetFunction'
import { type Version } from '../src/types/Version'
import stubVersions from './helpers/stubVersions'
import ncuMockPreData from './test-data/packages/ncu-mock-pre.json'

// TODO: Mock based on real output of viewMany
describe('target', () => {
  let stub: { mockRestore: () => void }
  beforeEach(() => {
    stub = stubVersions({
      chalk: '2.4.2',
      'ncu-mock-pre': ncuMockPreData,
      'ncu-test-semver': {
        version: '0.0.0',
        versions: {
          '1.0.0': { version: '1.0.0' },
          '1.0.1': { version: '1.0.1' },
          '1.1.0': { version: '1.1.0' },
          '1.2.0': { version: '1.2.0' },
        },
      },
      'ncu-test-pre1': '0.1.2',
      'eslint-plugin-jsdoc': '36.1.1',
      jsonlines: '0.1.1',
      juggernaut: '2.1.1',
      mocha: '8.4.0',
    } as MockedVersions)
  })

  afterEach(() => {
    stub.mockRestore()
  })

  describe('minor', () => {
    it('do not update major versions with --target minor', async () => {
      const pkgData = await ncu({ target: 'minor', packageData: { dependencies: { chalk: '3.0.0' } } })
      pkgData!.should.not.have.property('chalk')
    })

    it('update minor versions with --target minor', async () => {
      const pkgData = (await ncu({
        target: 'minor',
        packageData: { dependencies: { chalk: '2.3.0' } },
      })) as Index<Version>
      pkgData!.should.have.property('chalk')
      pkgData.chalk.should.equal('2.4.2')
    })

    it('update patch versions with --target minor', async () => {
      const pkgData = (await ncu({
        target: 'minor',
        packageData: { dependencies: { chalk: '2.4.0' } },
      })) as Index<Version>
      pkgData!.should.have.property('chalk')
      pkgData.chalk.should.equal('2.4.2')
    })
  })

  describe('patch', () => {
    it('do not update major versions with --target patch', async () => {
      const pkgData = await ncu({ target: 'patch', packageData: { dependencies: { chalk: '3.0.0' } } })
      pkgData!.should.not.have.property('chalk')
    })

    it('do not update minor versions with --target patch', async () => {
      const pkgData = await ncu({ target: 'patch', packageData: { dependencies: { chalk: '2.3.2' } } })
      pkgData!.should.not.have.property('chalk')
    })

    it('update patch versions with --target patch', async () => {
      const pkgData = (await ncu({
        target: 'patch',
        packageData: { dependencies: { chalk: '2.4.1' } },
      })) as Index<Version>
      pkgData!.should.have.property('chalk')
      pkgData.chalk.should.equal('2.4.2')
    })

    it('skip non-semver versions with --target patch', async () => {
      const pkgData = await ncu({ target: 'patch', packageData: { dependencies: { test: 'github:a/b' } } })
      pkgData!.should.not.have.property('test')
    })
  })

  describe('newest', () => {
    it('do not require --pre with --target newest', async () => {
      const data = await ncu({
        jsonAll: true,
        packageData: {
          dependencies: {
            'ncu-mock-pre': '1.0.0',
          },
        },
        target: 'newest',
      })
      data!.should.eql({
        dependencies: {
          'ncu-mock-pre': '2.0.0-alpha.0',
        },
      })
    })

    it('allow --pre 0 with --target newest to exclude prereleases', async () => {
      const data = await ncu({
        jsonAll: true,
        packageData: {
          dependencies: {
            'ncu-mock-pre': '1.0.0',
          },
        },
        target: 'newest',
        pre: false,
      })
      data!.should.eql({
        dependencies: {
          'ncu-mock-pre': '1.0.0',
        },
      })
    })

    it('work with --target newest with any invalid or wildcard range', () => {
      return Promise.all([
        ncu({
          jsonAll: true,
          target: 'newest',
          packageData: {
            dependencies: {
              del: '',
            },
          },
        }),
        ncu({
          jsonAll: true,
          target: 'newest',
          packageData: {
            dependencies: {
              del: 'invalid range',
            },
          },
        }),
        ncu({
          jsonAll: true,
          target: 'newest',
          packageData: {
            dependencies: {
              del: '*',
            },
          },
        }),
        ncu({
          jsonAll: true,
          target: 'newest',
          packageData: {
            dependencies: {
              del: '~',
            },
          },
        }),
      ])
    })
  })

  describe('greatest', () => {
    it('do not require --pre with --target greatest', async () => {
      const data = await ncu({
        jsonAll: true,
        packageData: {
          dependencies: {
            'ncu-mock-pre': '1.0.0',
          },
        },
        target: 'greatest',
      })
      data!.should.eql({
        dependencies: {
          'ncu-mock-pre': '2.0.0-alpha.0',
        },
      })
    })
  })

  describe('semver', () => {
    describe('^', () => {
      it('highest minor for post-1.0 version', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '^1.0.0',
            },
          },
          target: 'semver',
        })

        data!.should.eql({
          dependencies: {
            'ncu-test-semver': '^1.2.0',
          },
        })
      })

      it('highest patch for pre-1.0 version', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-pre1': '^0.1.0',
            },
          },
          target: 'semver',
        })

        data!.should.eql({
          dependencies: {
            'ncu-test-pre1': '^0.1.2',
          },
        })
      })

      // TODO: Why doesn't this work?
      it.skip('alpha', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-alpha': '^1.0.0-alpha.1',
            },
          },
          pre: true,
          target: 'semver',
        })

        data!.should.eql({
          dependencies: {
            'ncu-test-alpha': '^1.0.0-alpha.2',
          },
        })
      })
    })

    describe('~', () => {
      it('highest patch for post-1.0 version', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '~1.0.0',
            },
          },
          target: 'semver',
        })

        data!.should.eql({
          dependencies: {
            'ncu-test-semver': '~1.0.1',
          },
        })
      })

      it('highest patch for pre-1.0 version', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-pre1': '~0.1.0',
            },
          },
          target: 'semver',
        })

        data!.should.eql({
          dependencies: {
            'ncu-test-pre1': '~0.1.2',
          },
        })
      })
    })

    describe('exact version', () => {
      it('ignore exact version range', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '1.0.0',
            },
          },
          target: 'semver',
        })

        data!.should.eql({
          dependencies: {
            'ncu-test-semver': '1.0.0',
          },
        })
      })
    })

    describe('explicit ranges', () => {
      it('ignore inclusive range', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '1.0.0 - 1.3.0',
            },
          },
          target: 'semver',
        })

        data!.should.eql({
          dependencies: {
            'ncu-test-semver': '1.0.0 - 1.3.0',
          },
        })
      })

      it('ignore >', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '>1',
            },
          },
          target: 'semver',
        })

        data!.should.eql({
          dependencies: {
            'ncu-test-semver': '>1',
          },
        })
      })

      it('ignore >=', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '>=1',
            },
          },
          target: 'semver',
        })

        data!.should.eql({
          dependencies: {
            'ncu-test-semver': '>=1',
          },
        })
      })

      it('ignore <', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '<2',
            },
          },
          target: 'semver',
        })

        data!.should.eql({
          dependencies: {
            'ncu-test-semver': '<2',
          },
        })
      })

      it('ignore <=', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '<=2',
            },
          },
          target: 'semver',
        })

        data!.should.eql({
          dependencies: {
            'ncu-test-semver': '<=2',
          },
        })
      })

      it('ignore ||', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '1 || 2',
            },
          },
          target: 'semver',
        })

        data!.should.eql({
          dependencies: {
            'ncu-test-semver': '1 || 2',
          },
        })
      })
    })
  })

  describe('custom', () => {
    it('custom target function to mimic semver', async () => {
      // eslint-disable-next-line jsdoc/require-jsdoc
      const target: TargetFunction = (name, [{ operator }]) =>
        operator === '^' ? 'minor' : operator === '~' ? 'patch' : 'latest'
      const pkgData = (await ncu({
        target,
        packageData: {
          dependencies: {
            'eslint-plugin-jsdoc': '~36.1.0',
            jsonlines: '0.1.0',
            juggernaut: '1.0.0',
            mocha: '^8.3.2',
          },
        },
      })) as Index<Version>
      pkgData!.should.have.property('eslint-plugin-jsdoc')
      pkgData['eslint-plugin-jsdoc'].should.equal('~36.1.1')
      pkgData!.should.have.property('jsonlines')
      pkgData.jsonlines.should.equal('0.1.1')
      pkgData!.should.have.property('juggernaut')
      pkgData.juggernaut.should.equal('2.1.1')
      pkgData!.should.have.property('mocha')
      pkgData.mocha.should.equal('^8.4.0')
    })

    it('custom target and filter function to mimic semver', async () => {
      // eslint-disable-next-line jsdoc/require-jsdoc
      const target: TargetFunction = (name, [{ operator }]) =>
        operator === '^' ? 'minor' : operator === '~' ? 'patch' : 'latest'
      // eslint-disable-next-line jsdoc/require-jsdoc
      const filter: FilterFunction = (_, [{ major, operator }]) =>
        !(major === '0' || major === undefined || operator === undefined)
      const pkgData = (await ncu({
        filter,
        target,
        packageData: {
          dependencies: {
            'eslint-plugin-jsdoc': '~36.1.0',
            jsonlines: '0.1.0',
            juggernaut: '1.0.0',
            mocha: '^8.3.2',
          },
        },
      })) as Index<Version>
      pkgData!.should.have.property('eslint-plugin-jsdoc')
      pkgData['eslint-plugin-jsdoc'].should.equal('~36.1.1')
      pkgData!.should.not.have.property('jsonlines')
      pkgData!.should.not.have.property('juggernaut')
      pkgData!.should.have.property('mocha')
      pkgData.mocha.should.equal('^8.4.0')
    })
  })
}) // end 'target'

describe('tags', () => {
  let stub: { mockRestore: () => void }
  const versionInfo = {
    name: 'ncu-test-tag',
    version: '1.1.0',
    'dist-tags': {
      beta: '1.0.1-beta.0',
      latest: '1.1.0',
      next: '1.0.0-1',
      'task-42': '1.0.0-task-42.0',
    },
    versions: {
      '1.1.0': { version: '1.1.0' },
      '1.0.0-task-42.0': { version: '1.0.0-task-42.0' },
      '1.0.1-beta.0': { version: '1.0.1-beta.0' },
      '1.0.0-1': { version: '1.0.0-1' },
      '0.1.0': { version: '0.1.0' },
    },
  } as MockedVersions

  afterEach(() => {
    stub.mockRestore()
  })

  it('upgrade nonprerelease version to specific tag', async () => {
    stub = stubVersions(versionInfo)
    const upgraded = (await ncu({
      target: '@next',
      packageData: {
        dependencies: {
          'ncu-test-tag': '0.1.0',
        },
      },
    })) as Index<Version>

    upgraded['ncu-test-tag'].should.equal('1.0.0-1')
  })

  it('upgrade prerelease version without preid to nonprerelease', async () => {
    stub = stubVersions(versionInfo)
    const upgraded = (await ncu({
      target: 'latest',
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.0.0-1',
        },
      },
    })) as Index<Version>

    upgraded['ncu-test-tag'].should.equal('1.1.0')
  })

  it('upgrade prerelease version with preid to higher version on a specific tag', async () => {
    stub = stubVersions(versionInfo)
    const upgraded = (await ncu({
      target: '@beta',
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.0.0-task-42.0',
        },
      },
    })) as Index<Version>

    upgraded['ncu-test-tag'].should.equal('1.0.1-beta.0')
  })

  // can't detect which prerelease is higher, so just allow switching
  it('upgrade from prerelease without preid to prerelease with preid at a specific tag if major.minor.patch is the same', async () => {
    stub = stubVersions(versionInfo)
    const upgraded = (await ncu({
      target: '@task-42',
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.0.0-beta.0',
        },
      },
    })) as Index<Version>

    upgraded['ncu-test-tag'].should.equal('1.0.0-task-42.0')
  })

  // need to test reverse order too, because by base semver logic preid are sorted alphabetically
  it('upgrade from prerelease with preid to prerelease without preid at a specific tag if major.minor.patch is the same', async () => {
    stub = stubVersions(versionInfo)
    const upgraded = (await ncu({
      target: '@next',
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.0.0-task-42.0',
        },
      },
    })) as Index<Version>

    upgraded['ncu-test-tag'].should.equal('1.0.0-1')
  })

  // comparing semver between different dist-tags is incorrect, both versions could be released from the same latest
  // so instead of looking at numbers, we should focus on intention of the user upgrading to specific dist-tag
  it('downgrade to tag with a non-matching preid and lower patch', async () => {
    stub = stubVersions(versionInfo)
    const upgraded = (await ncu({
      target: '@task-42',
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.0.1-beta.0',
        },
      },
    })) as Index<Version>

    upgraded['ncu-test-tag'].should.equal('1.0.0-task-42.0')
  })

  // same as previous, doesn't matter if it's patch, minor or major, comparing different dist-tags is incorrect
  it('downgrade to tag with a non-matching preid and lower minor', async () => {
    stub = stubVersions(versionInfo)
    const upgraded = (await ncu({
      target: '@next',
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.2.0-dev.0',
        },
      },
    })) as Index<Version>

    upgraded['ncu-test-tag'].should.equal('1.0.0-1')
  })

  it('do not downgrade nonprerelease version to lower version with specific tag', async () => {
    stub = stubVersions('1.0.0-1')

    const upgraded = await ncu({
      target: '@next',
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.1.0',
        },
      },
    })

    upgraded!.should.not.have.property('ncu-test-tag')
  })

  it('do not downgrade to latest with lower version by default', async () => {
    stub = stubVersions('1.1.0')

    const upgraded = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-tag': '^1.1.1-beta.0',
        },
      },
    })

    upgraded!.should.not.have.property('ncu-test-tag')
  })

  it('do not downgrade to latest with lower version with --target latest', async () => {
    stub = stubVersions('1.1.0')

    const upgraded = await ncu({
      target: 'latest',
      packageData: {
        dependencies: {
          'ncu-test-tag': '^1.1.1-beta.0',
        },
      },
    })

    upgraded!.should.not.have.property('ncu-test-tag')
  })

  it('downgrade to latest with lower version with explicit --target @latest', async () => {
    stub = stubVersions('1.1.0')

    const upgraded = (await ncu({
      target: '@latest',
      packageData: {
        dependencies: {
          'ncu-test-tag': '^1.1.1-beta.0',
        },
      },
    })) as Index<Version>

    upgraded['ncu-test-tag'].should.equal('^1.1.0')
  })

  it('downgrade to latest with lower version with target function returning @latest', async () => {
    stub = stubVersions('1.1.0')

    const upgraded = (await ncu({
      target: () => '@latest',
      packageData: {
        dependencies: {
          'ncu-test-tag': '^1.1.1-beta.0',
        },
      },
    })) as Index<Version>

    upgraded['ncu-test-tag'].should.equal('^1.1.0')
  })
}) // end 'tags'
