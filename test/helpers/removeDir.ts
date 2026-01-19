import fs from 'fs/promises'

/**
 * Helper function to remove a directory while avoiding errors like:
 * Error: EBUSY: resource busy or locked, rmdir 'C:\Users\alice\AppData\Local\Temp\npm-check-updates-yc1wT3'
 *
 * On Windows, spawned child processes may hold locks on directories briefly after exiting.
 * This function retries the removal with exponential backoff to handle transient locks.
 */
async function removeDir(dirPath: string, maxRetries = 10, delayMs = 100) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true })
      return
    } catch (err: unknown) {
      const isEBUSY = err instanceof Error && 'code' in err && err.code === 'EBUSY'
      if (!isEBUSY || attempt === maxRetries - 1) {
        throw err
      }
      // Wait before retrying, with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)))
    }
  }
}

export default removeDir
