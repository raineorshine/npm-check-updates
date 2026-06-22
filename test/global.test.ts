import { expect } from 'chai'
import { runNcuCli } from './helpers/runNcuCli'

describe('global', () => {
  // TODO: Hangs on Windows
  const itSkipWindows = process.platform === 'win32' ? it.skip : it
  itSkipWindows('global should run', async () => {
    const { stdout } = await runNcuCli(['--jsonUpgraded', '--global', 'npm'])
    expect(JSON.parse(stdout))
  })
})
