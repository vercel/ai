/**
 * Sandbox environment that can execute commands.
 */
export type Experimental_Sandbox = {
  /**
   * Description of the sandbox environment that can be added to the agent's instructions
   * so that the agent knows about relevant details such as the root directory, exposed
   * ports, the public hostname, etc.
   */
  readonly description: string;

  /**
   * Execute a command in the sandbox.
   */
  readonly executeCommand: (options: {
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
};
