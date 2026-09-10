import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach } from 'vitest'
import makeTempDir from './makeTempDir.ts'
import removeDir from './removeDir.ts'

interface PnpmConfigDirs {
  /** Temp directory used as cwd. Contains no pnpm-workspace.yaml unless the test writes one. */
  projectDir: string
  /** Temp XDG_CONFIG_HOME, so pnpm's global config resolves into it instead of the machine's. */
  xdgDir: string
  /** Writes a pnpm-workspace.yaml into projectDir. */
  writeWorkspace: (content: string) => Promise<void>
  /** Writes a file (config.yaml or rc) into the isolated pnpm global config directory. */
  writeGlobalConfig: (filename: string, content: string) => Promise<void>
}

/**
 * Registers beforeEach/afterEach hooks that isolate pnpm config resolution from the machine running the tests:
 * a fresh temp directory as cwd, and a fresh XDG_CONFIG_HOME so pnpm's global config layer is empty by default.
 * Without the latter, a developer with registries or minimumReleaseAge in their own pnpm config sees failures
 * that CI never reproduces.
 *
 * The returned object is mutated before each test, so read its properties inside the test body, not at describe time.
 */
const usePnpmConfigDirs = (): PnpmConfigDirs => {
  const dirs: PnpmConfigDirs = {
    projectDir: '',
    xdgDir: '',
    writeWorkspace: content => fs.writeFile(path.join(dirs.projectDir, 'pnpm-workspace.yaml'), content),
    writeGlobalConfig: async (filename, content) => {
      const globalConfigDir = path.join(dirs.xdgDir, 'pnpm')
      await fs.mkdir(globalConfigDir, { recursive: true })
      await fs.writeFile(path.join(globalConfigDir, filename), content)
    },
  }

  let originalCwd: string
  let originalXdgConfigHome: string | undefined

  beforeEach(async () => {
    originalCwd = process.cwd()
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME
    dirs.projectDir = await makeTempDir('ncu-test-pnpm-project-')
    dirs.xdgDir = await makeTempDir('ncu-test-pnpm-xdg-')
    process.env.XDG_CONFIG_HOME = dirs.xdgDir
    process.chdir(dirs.projectDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome
    }
    await removeDir(dirs.projectDir)
    await removeDir(dirs.xdgDir)
  })

  return dirs
}

export default usePnpmConfigDirs
