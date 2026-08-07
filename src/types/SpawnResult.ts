export interface SpawnResult {
  stdout: string
  stderr: string
  /** The command line that ran, which on Windows may use the .cmd shim. */
  command: string
}
