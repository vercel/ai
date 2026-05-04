export type Sandbox = {
  /**
   * Description of the sandbox environment that can be added to the agent's instructions
   * so that the agent knows about relevant details such as the root directory, exposed
   * ports, the public hostname, etc.
   */
  readonly description: string;

  /**
   * Execute a command in the sandbox.
   */
  executeCommand: (options: { command: string }) => PromiseLike<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
};
