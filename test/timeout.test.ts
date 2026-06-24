import fs from 'fs/promises'
import { type Mock, type MockResultThrow } from 'vitest'
import ncu from '../src/'
import { npmApi } from '../src/package-managers/npm'
import { runNcuCli } from './helpers/runNcuCli'
import stubVersions from './helpers/stubVersions'

type FetchUpgradedPackumentMock = Mock<typeof npmApi.fetchUpgradedPackumentMemo>

/** helper spy to get last result from npmApi.fetchUpgradedPackumentMemo */
function getLastFetchUpgradedPackumentResult<T>() {
  return new Promise<T>(resolve => {
    const originalMock = npmApi.fetchUpgradedPackumentMemo
    const spy = (npmApi.fetchUpgradedPackumentMemo = vi.fn((...args) => {
      resolve(spy.mock.results.at(-1) as T)
      return originalMock(...args)
    }) as FetchUpgradedPackumentMock)
  })
}

describe('timeout', async () => {
  let pkgPath: string
  let stub: { mockRestore: () => void }
  beforeEach(async () => {
    pkgPath = await sandbox.createPackageJson({ dependencies: { express: '1' } })
    stub = stubVersions({ express: '1' })
  })
  afterEach(async () => {
    stub.mockRestore()
  })

  it('throw an exception instead of printing to the console when timeout is exceeded', async () => {
    const fetchUpgradedMockFn = getLastFetchUpgradedPackumentResult<MockResultThrow>()
    await ncu({ packageData: await fs.readFile(pkgPath, 'utf-8'), timeout: 1 }).should.eventually.be.rejectedWith(
      /Exceeded global timeout of 1ms|Idle timeout reached/,
    )

    const fetchResult = await fetchUpgradedMockFn
    fetchResult.type.should.equal('throw')
    fetchResult.value.message.should.equal('Exceeded global timeout of 1ms (mocked)')
  })

  it('exit with error when timeout is exceeded', async () => {
    const fetchUpgradedMockFn = getLastFetchUpgradedPackumentResult<MockResultThrow>()

    await runNcuCli(['--timeout', '1'], {
      stdin: '{ "dependencies": { "express": "1" } }',
    }).should.eventually.be.rejectedWith(/Exceeded global timeout of 1ms|Idle timeout reached/)

    const fetchResult = await fetchUpgradedMockFn
    fetchResult.type.should.equal('throw')
    fetchResult.value.message.should.equal('Exceeded global timeout of 1ms (mocked)')
  })

  it('completes successfully with timeout', async () => {
    await runNcuCli(['--timeout', '100000'], {
      stdin: '{ "dependencies": { "express": "1" } }',
    })
  })

  it('fetch functions should throw when controller aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const ncuTimeoutSignal = controller.signal

    await npmApi
      .fetchUpgradedPackument('package', [], '', { ncuTimeoutSignal, timeout: 1 })
      .should.eventually.be.rejectedWith(/Exceeded global timeout of 1ms/)

    await npmApi
      .fetchPartialPackument('package', [], '', { ncuTimeoutSignal, timeout: 1 })
      .should.eventually.be.rejectedWith(/Exceeded global timeout of 1ms/)
  })
})
