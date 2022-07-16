import sinon from 'sinon'
import * as npmPackageManager from '../../src/package-managers/npm'
import { Index } from '../../src/types/IndexType'
import { Version } from '../../src/types/Version'

/** Stubs the npmView function from package-managers/npm. Only works with ncu.run in tests, not spawn. Returns the stub object. Call stub.restore() after assertions to restore the original function. */
const stubNpmView = (mockReturnedVersions: Index<Version> | Version) =>
  sinon.stub(npmPackageManager, 'viewManyMemoized').callsFake((name: string) => {
    const version = typeof mockReturnedVersions === 'string' ? mockReturnedVersions : mockReturnedVersions[name]
    const packument = {
      name,
      engines: { node: '' },
      time: { [version]: new Date().toISOString() },
      version,
      // versions are not needed in nested packument
      versions: [],
    }
    return Promise.resolve({
      ...packument,
      versions: [packument],
    })
  })

export default stubNpmView
