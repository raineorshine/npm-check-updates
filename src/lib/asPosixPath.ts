import path from 'path'

/** forces path to a posix version (windows-style) */
function asPosixPath(filepath: string): string {
  return filepath.split(path.sep).join(path.posix.sep)
}

export default asPosixPath
