/**
 * Customizes a credential value immediately before a harness adapter forwards
 * it into a sandbox process.
 *
 * This callback only controls the value exposed to sandbox processes. It does
 * not restrict which credentials the harness adapter can discover, read, or
 * otherwise access in the host process.
 */
export type HarnessV1CredentialForwarding = (options: {
  /**
   * The credential value that the adapter would otherwise forward (either the
   * real credential or a masked value).
   */
  readonly credential: string;
  /** The environment variable name used to expose the value in the sandbox. */
  readonly environmentVariableName: string;
}) => string | PromiseLike<string>;
