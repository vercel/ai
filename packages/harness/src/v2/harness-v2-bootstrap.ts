/**
 * A file to materialize in the adapter's sandbox bootstrap directory.
 */
export interface HarnessV2BootstrapFile {
  /**
   * Relative path at which the bootstrap file should be created.
   */
  readonly path: string;

  /**
   * UTF-8 text content to write to the file.
   */
  readonly content: string;
}

/**
 * A shell command to run while preparing an adapter's sandbox.
 */
export interface HarnessV2BootstrapCommand {
  /**
   * Command line passed to the sandbox bootstrap runner.
   */
  readonly command: string;
}

/**
 * Recipe for preparing a sandbox before the adapter drives a session.
 */
export interface HarnessV2Bootstrap {
  /**
   * Adapter requesting this bootstrap recipe.
   */
  readonly harnessId: string;

  /**
   * Directory into which the recipe's files are placed.
   */
  readonly bootstrapDir: string;

  /**
   * Files written before bootstrap commands are executed.
   */
  readonly files: ReadonlyArray<HarnessV2BootstrapFile>;

  /**
   * Commands executed in order after the files have been written.
   */
  readonly commands: ReadonlyArray<HarnessV2BootstrapCommand>;
}
