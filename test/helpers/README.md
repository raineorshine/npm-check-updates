## Architectural Infrastructure Analysis

```text
+---------------------------------------------------------------------------------+
|                                 Vitest Worker Thread                            |
|                                                                                 |
|  +-------------------+      +-----------------------+      +-----------------+  |
|  |    testNameStore  | ---> |   TestCacheManager    | ---> |   TestSandbox   |  |
|  | AsyncLocalStorage |      |  (Fixtures Lifecycle) |      | (Isolated CWD)  |  |
|  +-------------------+      +-----------------------+      +-----------------+  |
|           |                             |                           |           |
|           v                             v                           v           |
|  +---------------------------------------------------------------------------+  |
|  |                                  runNcuCli                                |  |
|  |     [cliMutex] -> [mockIO AsyncLocalStorage] -> [In-Process Engine]       |  |
|  +---------------------------------------------------------------------------+  |
|                                         |                                       |
|                                         v                                       |
|                    +------------------------------------------+                 |
|                    |             Intercepted Spies            |                 |
|                    |  - stubSpawnPlease (Creates Lockfiles)   |                 |
|                    |  - stubVersions (Double-Stub Guard)      |                 |
|                    |  - doctorSpawnHandler (In-Memory State)  |                 |
|                    +------------------------------------------+                 |
+---------------------------------------------------------------------------------+

```

### 1. Contextual Isolation via `AsyncLocalStorage`

Because Vitest executes tests concurrently within shared environments, standard global variables would introduce race conditions. The infrastructure solves this using Node's `AsyncLocalStorage` across three key subsystems:

- **`testNameStore`**: Captures active execution metadata during the `aroundEach` hook. Its `getTestName()` utility is strictly constrained to return _only_ the core string name of the active spec, ensuring metadata calls do not leak internal structures.
- **`mockIO`**: Spies on global write streams (`process.stdout.write`, `process.stderr.write`) and pipes intercepted text into thread-isolated buffers. This allows concurrent tests to safely read their own diagnostic output without inter-thread bleed.
- **`stubVersionsSetup`**: Encapsulates runtime version overrides within an isolated registry storage cell, cleaning up and restoring mocks automatically at the end of each test loop.

### 2. Mutual Exclusion & In-Process Execution

To completely eliminate the performance penalty of spawning separate Node child processes, the `runNcuCli` engine executes command loops directly within the worker thread. Since it mutates global process states (`process.argv`, `process.env`, `process.stdin`), concurrent calls would corrupt each other.
To resolve this, a dedicated synchronization primitive (**`cliMutex`**) intercepts entries, enforcing that only one CLI initialization cycle executes at a time within that thread. Early programmatic exits are gracefully caught using a specialized `ExitSuccessSignal` exception mapping, which halts execution without crashing the active worker.

### 3. Strict Sandbox Validation & Path Sanitization

Under Vitest's threaded runtime framework, workers cannot execute a true OS-level directory change (`process.chdir`). While `process.cwd()` is mocked inside the local thread context, external native child processes spawned from a test do not inherit this mock. Without explicit mitigation, child processes would execute inside the real repository root instead of the designated sandbox directory.
The infrastructure prevents this via **`ensureChildProcessCwd`**. It acts as a safety guard inside `stubSpawnPlease`, throwing an explicit sandbox violation error if a command execution is attempted without providing an explicit `{ cwd: sandbox.cwd }` property.

### 4. Automated Snapshot Auditing

The `TestCacheManager` automates record-and-replay behaviors by mapping test execution data directly to static snapshot JSON files under `test/fixtures-cache/`.
During the `afterAll` teardown sequence, the manager traverses Vitest’s live `RunnerTask` execution tree. It verifies the final state of each test and performs an automated sweep: entries belonging to deleted, renamed, skipped, or failed specs are immediately pruned from the snapshot memory allocation. The remaining records are deeply sorted by object key to ensure clean Git diffs before being saved back to disk. To prevent repository pollution, snapshot generation and auditing are bypassed entirely when executing within immutable CI environments.

---

## Core Infrastructure Components

### 1. The Execution Mutex & I/O Capture

- **`runNcuCli.ts`**: Provides high-speed, in-process execution of the CLI application, bypassing the overhead of spawning standard child processes. It utilizes a centralized constraint (`cliMutex`) to prevent overlapping executions from corrupting shared process properties like `process.argv`, `process.env`, and `process.stdin`.
- **`mockIO.ts`**: Dynamically intercepts writes to `stdout` and `stderr`. It isolates streams across concurrent execution tasks using `AsyncLocalStorage`. Programmatic process terminations (e.g., `--help`, `--version`) are caught via an `ExitSuccessSignal` exception to maintain fluid runner control.

### 2. Environment Sandboxing

- **`TestSandbox.ts`**: Generates unique, randomized directory paths inside the operating system's temporary file layout. It tracks environment states, sets up workspace structures, and provides direct utilities for writing ad-hoc `package.json` configurations.
- **`testNameStore.ts`**: Captures and manages active spec metadata using an `aroundEach` lifecycle hook.
  - `getTestName()`: Returns _only_ the precise string name of the currently running test.
  - `getFullTestName()`: Returns the fully qualified name string including all parent suites.
  - `getOutputHeader()`: Generates structured formatting matching the format: `[filename] > [testName]`.

### 3. Record-and-Replay Fixture Caching

- **`TestCacheManager.ts`**: Intercepts expensive actions (such as network registry queries or native compilation steps) and reconciles them against localized JSON definitions stored within `test/fixtures-cache/`.
  - **Spec Tree Auditing:** During `afterAll`, it reads Vitest's native `RunnerTask` statuses. It automatically purges orphaned, renamed, or failed test snapshots to prevent stale records from persisting in the repository.
  - **CI Immutability:** When running in Continuous Integration pipelines, cache writes and disk audits are skipped entirely to guarantee snapshots remain immutable.

### 4. Stub Routing Engines

- **`MockHandler.ts` & `genericStubFactory.ts`**: Forms a flexible middleware orchestration chain for mocked modules. It allows multiple handlers to be attached to an intercepted method via a priority pipeline (`use`, `useFirst`), automatically falling back to the original implementation if handlers return `undefined`.
- **`utils.ts`**: Implements global deterministic cleanup logic.
  - **`sanitize()`**: Prunes variable dynamic parameters from text outputs, replacing unpredictable elements with static placeholders like `<NPM_LOG_PATH>`, `<PID>`, and `<TIMESTAMP>`. It also strips terminal box-drawing characters for cleaner cross-platform testing logs.
  - **`ensureChildProcessCwd()`**: Validates path parameters before executing external shell scripts. If a command lacks an explicit `cwd` declaration, it throws an error to prevent process leaks into the repository root.

---

## Mock Handlers & Interceptors

### 1. `stubSpawnPlease.ts`

- Mocks **all** underlying executable calls routed to the external `spawn-please` module dependency.
- If an installation command is identified (e.g., `npm install`), it short-circuits the native process completely. It instantly provisions empty mock `node_modules` folders and localized lockfiles directly to the sandbox workspace disk, removing massive file system overhead.

### 2. `stubGetGitTags.ts`

- Intercepts and catches all executions targeting the sluggish, time-consuming remote Git tag resolution command:

  ```typescript
  execFile('git', ['ls-remote', '--tags', url])
  ```

- Bypasses the network overhead by saving and serving these exact outputs directly from the local `fixtures-cache/` file layer.

### 3. `stubVersions.ts`

- Manages package version resolution overrides for `npmApi.fetchUpgradedPackumentMemo` and `fetchPartialPackument`.
- **Automatic `mockRestore` Lifecycles:** This module tracks active mocks via a structural context register managed inside `stubVersionsSetup.ts`. It executes automated teardowns at the close of every individual test assertion hook, **completely eliminating the need to write manual `stub.mockRestore()` boilerplate within test specifications.**
- **Double-Stub Guardrail:** Includes a safety validation mechanism via `ensureSingleStub`. If a test tries to allocate `stubVersions` multiple times, it triggers an exception tracking the exact file path and spec definition to prevent test contamination.

### 4. `stubDoctor.ts`

- Provides an in-memory execution loop for Doctor Mode tests. It intercepts deep dependency resolution scripts (`run test`, `run prepare`) and evaluates project versions using simulated version arrays, cutting down local test suite execution runtime significantly on Windows machines.

---

## Workflow & Commands

### Standard Execution

```sh
npm test                    # Executes code analysis, unit tests, and e2e validations
npm run test:unit           # Executes unit tests via Vitest
npm run test:unit:watch     # Launches Vitest in active watch mode

```

### Coverage Evaluation

Code coverage maps are evaluated directly via the V8 collection layer:

```sh
npm run test:coverage       # Formats code coverage statistics within the active terminal
npm run test:coverage:html  # Generates an interactive local HTML report under coverage/

```
