import fs from 'node:fs'
import path from 'node:path'
import { type RunnerTask, type RunnerTestFile } from 'vitest'
import { sanitizeAndSerialize, sortObjectDeep } from './stubs/utils'
import { getFullTestName } from './testNameStore'

/**
 * `TestCacheManager` handles automatic fixture caching and deterministic state syncing
 * for Vitest test suites.
 *
 * ### How It Works:
 * 1. **Setup (`beforeAll`)**: Resolves a unique `.json` cache file inside `test/fixtures-cache/` matching
 * the relative structure of the running test file. Loads any existing cache into memory.
 * 2. **Interception (`getOrSet`)**: Wraps slow or expensive setup actions (like CLI commands or network calls).
 * If a cache hit occurs for the current test name, stub, and input key, it returns the cached result
 * (or re-throws a cached error). Otherwise, it runs the callback and saves the result.
 * 3. **Teardown (`afterAll`)**: Performs an automated audit. It aggressively purges orphaned entries from tests
 * that were deleted, renamed, skipped, or failed, ensuring stale snapshots never persist. If changes
 * are detected, it deep-sorts the keys for clean git diffs and flushes back to disk.
 *
 * *Note: In CI environments, the existing cache is fully utilized to speed up execution, but the teardown
 * step skips auditing and saving to guarantee that the repository's cache files remain immutable.*
 */
export class TestCacheManager {
  private cacheFilePath: string = ''
  private initialContent: string = ''
  /** Structure: testName -> stubName -> inputKey -> value */
  private data: Record<string, Record<string, Record<string, any>>> = {}
  /** Tracks which entries were actually used: "testName::stubName::key" */
  private invokedPaths = new Set<string>()

  public static register() {
    const manager = new TestCacheManager()

    // eslint-disable-next-line no-empty-pattern
    beforeAll(({}, input) => {
      // Vitest provides the file context as the 2nd argument here
      const file = input as RunnerTestFile
      const rawFilePath = file.filepath ?? 'unknown'

      if (rawFilePath === 'unknown') {
        console.warn('⚠️ [Cache] Unable to resolve test file path from beforeAll context.')
      }

      const testRoot = path.resolve('test')
      const relativePath = path.relative(testRoot, rawFilePath)
      const jsonRelative = relativePath.replace(/\.ts$/, '.json')
      manager.cacheFilePath = path.join(testRoot, 'fixtures-cache', jsonRelative)

      if (fs.existsSync(manager.cacheFilePath)) {
        manager.initialContent = fs.readFileSync(manager.cacheFilePath, 'utf8')
        try {
          manager.data = JSON.parse(manager.initialContent)
        } catch (err) {
          manager.data = {}
        }
      }
    })

    // eslint-disable-next-line no-empty-pattern
    afterAll(async ({}, input) => {
      const file = input as RunnerTestFile
      await manager.flushAndAuditAll(file)
      vi.restoreAllMocks()
    })

    return manager
  }

  /** Retrieves or sets keys using getTestName() smoothly at runtime */
  public async getOrSet<T>(stubName: string, key: string, fallbackExecution: () => Promise<T>): Promise<T> {
    const testName = getFullTestName()

    const invocationPath = `${testName}::${stubName}::${key}`
    this.invokedPaths.add(invocationPath)

    if (!this.data[testName]) {
      this.data[testName] = {}
    }
    if (!this.data[testName][stubName]) {
      this.data[testName][stubName] = {}
    }
    const testSpace = this.data[testName][stubName]

    const isRegenerate = process.env.REGENERATE_TEST_CACHE === 'true'
    if (!isRegenerate && key in testSpace) {
      const entry = testSpace[key]
      if (entry?._isError) {
        const err = Object.assign(new Error(entry.message), {
          stderr: entry.stderr,
          exitCode: entry.exitCode,
        })
        throw err
      }
      return entry as T
    }

    try {
      const result = await fallbackExecution()
      testSpace[key] = result
      return result
    } catch (err: any) {
      const serialized = {
        _isError: true,
        message: sanitizeAndSerialize(err.message || err.toString()),
        stderr: sanitizeAndSerialize(err.stderr || ''),
        exitCode: err.exitCode ?? 1,
      }
      testSpace[key] = serialized
      throw err
    }
  }

  /** Final validation and disk sync loop */
  private async flushAndAuditAll(file: RunnerTestFile) {
    if (process.env.CI) return
    if (!this.cacheFilePath) return

    const validTests = this.getValidTestNames(file.tasks)

    // Prune orphaned test entries and unused keys.
    for (const testName of Object.keys(this.data)) {
      const testInfo = validTests.get(testName)
      const testData = this.data[testName]

      if (!testInfo) {
        delete this.data[testName]
        continue
      }

      if (testInfo.ran) {
        for (const stubName of Object.keys(testData)) {
          const stubSpace = testData[stubName]
          for (const inputKey of Object.keys(stubSpace)) {
            if (!this.invokedPaths.has(`${testName}::${stubName}::${inputKey}`)) {
              delete stubSpace[inputKey]
            }
          }
          if (Object.keys(stubSpace).length === 0) {
            delete testData[stubName]
          }
        }
      }

      if (Object.keys(testData).length === 0) {
        delete this.data[testName]
      }
    }

    if (Object.keys(this.data).length === 0) {
      if (fs.existsSync(this.cacheFilePath)) {
        try {
          await fs.promises.unlink(this.cacheFilePath)
        } catch (err) {}
      }
      return
    }

    const sortedCache = sortObjectDeep(this.data)

    // Ensure trailing newline
    const newContent = JSON.stringify(sortedCache, null, 2) + '\n'
    if (newContent !== this.initialContent) {
      await fs.promises.mkdir(path.dirname(this.cacheFilePath), { recursive: true })
      await fs.promises.writeFile(this.cacheFilePath, newContent)
    }
  }

  /** get all tests name in the file that did not failed in this run */
  private getValidTestNames(tasks: RunnerTask[]): Map<string, { ran: boolean }> {
    const validTests = new Map<string, { ran: boolean }>()
    /** Traverses the Vitest task tree to collect all active test names */
    const traverse = (ts: RunnerTask[]) => {
      for (const task of ts) {
        if (task.type === 'test') {
          // Only consider the test name valid if it didn't fail.
          if (task.result?.state !== 'fail') {
            const ran = task.result?.state === 'pass'
            validTests.set(task.fullTestName, { ran })
          }
        } else if (task.tasks) {
          traverse(task.tasks)
        }
      }
    }
    traverse(tasks)
    return validTests
  }
}
