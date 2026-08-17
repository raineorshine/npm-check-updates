import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * Creates a temp dir for a test. The caller is responsible for removing it, normally by registering
 * removeDir with onTestFinished.
 */
const makeTempDir = (prefix = 'npm-check-updates-'): Promise<string> => fs.mkdtemp(path.join(os.tmpdir(), prefix))

export default makeTempDir
