import type { Experimental_Sandbox } from '@ai-sdk/provider-utils';

/**
 * Sandbox interface used by harness adapters. Extends `Experimental_Sandbox`
 * with the small set of capabilities some harnesses need but that are too
 * implementation-specific to live on the base sandbox spec today.
 *
 * `spawnCommand` is not redeclared here — it is part of `Experimental_Sandbox`
 * and is therefore always available.
 *
 * The extra capabilities are optional. Adapters that need them detect missing
 * methods at point of use and throw `HarnessCapabilityUnsupportedError` with
 * a descriptive message.
 */
export type HarnessV1Sandbox = Experimental_Sandbox & {
  /**
   * Resolve a publicly-reachable URL for a port exposed inside the sandbox.
   *
   * Used by adapters that run dev servers, file servers, or other services
   * the host (or the model) must reach over the network.
   */
  readonly getPortUrl?: (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }) => PromiseLike<string>;

  /**
   * Update the sandbox's outbound network policy.
   *
   * Used by adapters that want to constrain or open up egress mid-session,
   * e.g. allow a newly-requested host after the model asks for it.
   */
  readonly setNetworkPolicy?: (
    policy: HarnessV1NetworkPolicy,
  ) => PromiseLike<void>;
};

export type HarnessV1NetworkPolicy =
  | { mode: 'allow-all' }
  | { mode: 'deny-all' }
  | { mode: 'allowlist'; hosts: ReadonlyArray<string> };
