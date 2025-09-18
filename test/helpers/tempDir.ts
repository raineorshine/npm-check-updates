import fs from 'fs/promises'

/**
 * Safely removes a temporary directory, handling Windows-specific EBUSY errors
 * that can occur when files are still locked by the OS.
 */
export const safeRemoveTempDir = async (tempDir: string): Promise<void> => {
  try {
    await fs.rm(tempDir, { recursive: true, force: true })
  } catch (error: any) {
    // On Windows, temporary directory cleanup can fail with EBUSY errors
    // when files are still locked. These errors are harmless for test cleanup
    // since the OS will eventually clean up temp directories.
    if (error?.code === 'EBUSY') {
      // Silently ignore EBUSY errors - they're expected on Windows
      return
    }
    // Re-throw other errors as they might be important
    throw error
  }
}