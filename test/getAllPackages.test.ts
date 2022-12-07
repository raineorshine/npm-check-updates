import chai from 'chai'
import path from 'path'
import getAllPackages from '../src/lib/getAllPackages'
import { Options } from '../src/types/Options'

chai.should()

/** given a dirPath removes it from a tuple of strings  */
async function stripDir(dirPath: string, paths: [string[], string[]]): Promise<[string[], string[]]> {
  const [pkgs, workspacePackages]: [string[], string[]] = paths
  return [
    pkgs.map((path: string): string => path.replace(dirPath, '')),
    workspacePackages.map((path: string): string => path.replace(dirPath, '')),
  ]
}

describe('getAllPackages', () => {
  it('handles tradition flat npm project ', async () => {
    const cwd = path.join(__dirname, 'test-data/basic/')
    const emptyOptions: Options = { cwd }
    const [pkgs, workspacePackages]: [string[], string[]] = await stripDir(cwd, await getAllPackages(emptyOptions))
    pkgs.should.deep.equal(['package.json'])
    workspacePackages.should.deep.equal([])
  })
})
