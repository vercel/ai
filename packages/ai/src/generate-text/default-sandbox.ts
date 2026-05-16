import type {
  Experimental_ProviderSandbox,
  Experimental_Sandbox,
} from '@ai-sdk/provider-utils';

/**
 * Default tool-facing sandbox implementation that delegates all operations to
 * the provider-facing sandbox specification.
 */
export class DefaultSandbox implements Experimental_Sandbox {
  private readonly providerSandbox: Experimental_ProviderSandbox;

  /**
   * Creates a sandbox wrapper around a provider-facing sandbox.
   */
  constructor(providerSandbox: Experimental_ProviderSandbox) {
    this.providerSandbox = providerSandbox;
  }

  /**
   * Description of the sandbox environment.
   */
  get description(): string {
    return this.providerSandbox.description;
  }

  /**
   * Runs a command in the sandbox.
   */
  runCommand: Experimental_Sandbox['runCommand'] = options =>
    this.providerSandbox.runCommand(options);
}

/**
 * Wraps a provider-facing sandbox in the default tool-facing sandbox adapter.
 */
export function wrapProviderSandbox(
  providerSandbox: Experimental_ProviderSandbox | undefined,
): Experimental_Sandbox | undefined {
  return providerSandbox == null
    ? undefined
    : new DefaultSandbox(providerSandbox);
}
