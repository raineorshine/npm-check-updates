import fs from 'fs/promises'

/** Returns true if a file exists. */
const exists = async (path: string) => {
  try {
    await fs.stat(path)
    return true
  } catch {
    return false
  }
}

export default exists
