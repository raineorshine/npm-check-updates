import fs from 'fs/promises'

/** Returns true if a file exists. */
const exists = (path: string) =>
  fs.stat(path).then(
    () => true,
    () => false,
  )

export default exists
