import ncu from '../src/'
import stubVersions from './helpers/stubVersions';
import chaiSetup from './helpers/chaiSetup'
import { expect } from 'chai'
import Sinon from 'sinon';

chaiSetup()

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

const mockPackage = {
  name: 'test-package',
  version: '1.2.0',
  time: {
    created: new Date(NOW - 30 * DAY).toISOString(), // created 30 days ago
    modified: new Date(NOW - DAY).toISOString(),  // modified a day ago
    '1.0.0': new Date(NOW - 30 * DAY).toISOString(), // released 30 days ago
    '1.1.0': new Date(NOW - 15 * DAY).toISOString(), // released 15 days ago
    '1.2.0': new Date(NOW - DAY).toISOString(),  // released a day ago
  },
}

describe('cooldown', () => {
  beforeEach(() => {
    Sinon.restore();
  });

  it('should allow upgrade packages if cooldown parameter is empty', async () => {
    // given: test-package is installed in version 1.0.0 (released 30 days ago), with newer versions 1.1.0 (released 15 days ago) and 1.2.0 (released 1 day ago) available
    const stub = stubVersions(mockPackage);

    // when - run ncu without cooldown parameter
    const result = await ncu({
      packageFile: 'test/test-data/cooldown/package.json'
    })

    // then - test-package should be upgraded to the version 1.2.0 (latest)
    expect(result).to.have.property('test-package', '1.2.0');

    stub.restore();
  })

	it('should skip upgrade if last upgrade was within the cooldown period', async () => {
    // given: test-package is installed in version 1.0.0 (released 30 days ago), with newer versions 1.1.0 (released 15 days ago) and 1.2.0 (released 1 day ago) available
    const stub = stubVersions(mockPackage);

    // when - run ncu with 20 days cooldown parameter (install any matching version released in more than 20 days ago)
    const result = await ncu({
      packageFile: 'test/test-data/cooldown/package.json',
      cooldown: 20
    })

    // then - test-package should not be upgraded
    expect(result).to.not.have.property('test-package');

    stub.restore();
  })

	it('should allow upgrade if last upgrade was outside the cooldown period', async () => {
    // given: test-package is installed in version 1.0.0 (released 30 days ago), with newer versions 1.1.0 (released 15 days ago) and 1.2.0 (released 1 day ago) available
    const stub = stubVersions(mockPackage);

    // when - run ncu with 2 days cooldown parameter (install any matching version released in more than 2 days ago)
    const result = await ncu({
      packageFile: 'test/test-data/cooldown/package.json',
      cooldown: 2
    })

    // then - test-package should not be upgraded to the version 1.1.0 (released 15 days ago)
    expect(result).to.have.property('test-package', '1.1.0');

    stub.restore();
	})

	it('should allow upgrade if cooldown is 0 days', async () => {
    // given: test-package is installed in version 1.0.0 (released 30 days ago), with newer versions 1.1.0 (released 15 days ago) and 1.2.0 (released 1 day ago) available
    const stub = stubVersions(mockPackage);

    // when - run ncu with 0 day cooldown parameter
    const result = await ncu({
      packageFile: 'test/test-data/cooldown/package.json',
      cooldown: 0
    })

    // then - test-package should be upgraded to the version 1.2.0 (latest)
    expect(result).to.have.property('test-package', '1.2.0');

    stub.restore();
	})

  it('should thrown error when cooldown parameter is negative', async () => {
    expect(
      await ncu({
        packageFile: 'test/test-data/cooldown/package.json',
        cooldown: -1
      })
    ).to.throw('The cooldown parameter cannot be negative');
  });

  it('should not update package when cooldown is set and package has no time data', async () => {
    // given: test-package is installed in version 1.0.0, with newer versions 1.1.0 and 1.2.0 available, but no time data
    const stub = stubVersions({
      name: 'test-package',
      version: '1.2.0',
      time: {
        created: new Date(NOW - 30 * DAY).toISOString(), // created 30 days ago
        modified: new Date(NOW - DAY).toISOString(),  // modified a day ago
        // no time data for versions
      },
    });

    // when - run ncu with 1 day cooldown parameter (install any matching version released in more than 1 day ago)
    const result = await ncu({
      packageFile: 'test/test-data/cooldown/package.json',
      cooldown: 1
    })

    // then - test-package should not be upgraded
    expect(result).to.not.have.property('test-package');

    stub.restore();
  });
})
