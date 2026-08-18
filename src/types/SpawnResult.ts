export interface SpawnResult {
  stdout: string
  stderr: string
  /** The exit code, or null if the process was terminated by a signal. */
  code: number | null
  /** The command line that ran, which on Windows may use the .cmd shim. */
  command: string
}
