/**
 * Provider-facing sandbox specification.
 */
export interface Experimental_ProviderSandbox {
  /**
   * Description of the sandbox environment.
   */
  readonly description: string;

  /**
   * Run a command in the sandbox.
   */
  readonly runCommand: (options: {
    /**
     * Command to execute in the sandbox.
     */
    command: string;

    /**
     * Working directory to execute the command in.
     */
    workingDirectory?: string;

    /**
     * Signal that can be used to abort the command.
     */
    abortSignal?: AbortSignal;
  }) => PromiseLike<{
    /**
     * Exit code returned by the command.
     */
    exitCode: number;

    /**
     * Standard output produced by the command.
     */
    stdout: string;

    /**
     * Standard error produced by the command.
     */
    stderr: string;
  }>;
}
