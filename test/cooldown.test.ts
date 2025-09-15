import ncu from '../src/'
import stubVersions from './helpers/stubVersions';
import chaiSetup from './helpers/chaiSetup'
import { expect } from 'chai'
import Sinon from 'sinon';
import { Packument } from '../src/types/Packument';

chaiSetup()

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

const mockPackage = {
  name: 'test-package',
  version: '1.2.0',
  versions: {
    '1.0.0': {
      version: '1.0.0',
    } as Packument,
    '1.1.0': {
      version: '1.1.0',
    } as Packument,
    '1.2.0': {
      version: '1.2.0',
    } as Packument,
  },
  time: {
    created: new Date(NOW - 30 * DAY).toISOString(), // created 30 days ago
    modified: new Date(NOW - DAY).toISOString(),  // modified a day ago
    '1.0.0': new Date(NOW - 30 * DAY).toISOString(), // released 30 days ago
    '1.1.0': new Date(NOW - 15 * DAY).toISOString(), // released 15 days ago
    '1.2.0': new Date(NOW - DAY).toISOString(),  // released a day ago
  },
  distTags: {
    latest: '1.2.0'
  }
}

describe('cooldown', () => {
  beforeEach(() => {
    Sinon.restore();
  });

  it('upgrades when cooldown is not set', async () => {
    // Given test-package is installed in version 1.0.0 (released 30 days ago), with newer versions 1.1.0 (15 days ago) and 1.2.0 (1 day ago) available
    const stub = stubVersions(mockPackage);

    // When ncu is run without the cooldown parameter
    const result = await ncu({
      packageFile: 'test/test-data/cooldown/package.json'
    })

    // Then test-package should be upgraded to version 1.2.0 (latest)
    expect(result).to.have.property('test-package', '1.2.0');

    stub.restore();
  })

  it('skips upgrade if version is newer than cooldown period', async () => {
    // Given test-package is installed in version 1.0.0 (released 30 days ago), with newer versions 1.1.0 (15 days ago) and 1.2.0 (1 day ago) available
    const stub = stubVersions(mockPackage);

    // When ncu is run with a 20 day cooldown parameter
    const result = await ncu({
      packageFile: 'test/test-data/cooldown/package.json',
      cooldown: 20
    })

    // Then test-package should not be upgraded, as no newer version is older than 20 days
    expect(result).to.not.have.property('test-package');

    stub.restore();
  })

  it('skips upgrade if all versions are newer than cooldown period', async () => {
    // Given test-package is installed in version 1.0.0 (released 30 days ago), with newer versions 1.1.0 (15 days ago) and 1.2.0 (1 day ago) available
    const stub = stubVersions(mockPackage);

    // When ncu is run with a 90 day cooldown parameter
    const result = await ncu({
      packageFile: 'test/test-data/cooldown/package.json',
      cooldown: 90
    })

    // Then test-package should not be upgraded, as no versions are older than 90 days
    expect(result).to.not.have.property('test-package');

    stub.restore();
  });

  it('upgrades to latest version older than cooldown period', async () => {
    // Given test-package is installed in version 1.0.0 (released 30 days ago), with newer versions 1.1.0 (15 days ago) and 1.2.0 (1 day ago) available
    const stub = stubVersions(mockPackage);

    // When ncu is run with a 2 day cooldown parameter
    const result = await ncu({
      packageFile: 'test/test-data/cooldown/package.json',
      cooldown: 2
    })

    // Then test-package should be upgraded to version 1.1.0 (released 15 days ago; 15 >= 2)
    expect(result).to.have.property('test-package', '1.1.0');

    stub.restore();
	})

  it('upgrades to version released exactly at cooldown threshold', async () => {
    // Given test-package is installed in version 1.0.0 (released 30 days ago), with newer versions 1.1.0 (15 days ago) and 1.2.0 (1 day ago) available
    const stub = stubVersions(mockPackage);

    // When ncu is run with a 15 day cooldown parameter
    const result = await ncu({
      packageFile: 'test/test-data/cooldown/package.json',
      cooldown: 15
    })

    // Then test-package should be upgraded to version 1.1.0 (released exactly 15 days ago; 15 >= 15)
    expect(result).to.have.property('test-package', '1.1.0');

    stub.restore();
	})

  it('upgrades to latest if cooldown is zero', async () => {
    // Given test-package is installed in version 1.0.0 (released 30 days ago), with newer versions 1.1.0 (15 days ago) and 1.2.0 (1 day ago) available
    const stub = stubVersions(mockPackage);

    // When ncu is run with a 0 day cooldown parameter
    const result = await ncu({
      packageFile: 'test/test-data/cooldown/package.json',
      cooldown: 0
    })

    // Then test-package should be upgraded to version 1.2.0 (released 1 day ago; 1 >= 0)
    expect(result).to.have.property('test-package', '1.2.0');

    stub.restore();
	})

  it('skips upgrade if no time data and cooldown is set', async () => {
  // Given test-package is installed in version 1.0.0, with newer versions 1.1.0 and 1.2.0 available, but no time data
    const stub = stubVersions({
      name: 'test-package',
      version: '1.2.0',
      time: {
        created: new Date(NOW - 30 * DAY).toISOString(), // created 30 days ago
        modified: new Date(NOW - DAY).toISOString(),  // modified a day ago
        // no time data for versions
      },
    });

  // When ncu is run with a 1 day cooldown parameter
    const result = await ncu({
      packageFile: 'test/test-data/cooldown/package.json',
      cooldown: 1
    })

  // Then test-package should not be upgraded
    expect(result).to.not.have.property('test-package');

    stub.restore();
  });


  describe('invalid cooldown values', () => {
    it('throws error for negative cooldown', () => {
      expect(
        ncu({
          packageFile: 'test/test-data/cooldown/package.json',
          cooldown: -1
        })
      ).to.be.rejectedWith('Cooldown must be a non-negative integer representing days');
    });

    it('throws error for non-numeric cooldown', () => {
      expect(
        ncu({
          packageFile: 'test/test-data/cooldown/package.json',
          // @ts-expect-error -- testing invalid input
          cooldown: 'invalid'
        })
      ).to.be.rejectedWith('Cooldown must be a non-negative integer representing days');
    });
  });
})
