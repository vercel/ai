import type { HarnessV1SandboxSession } from './harness-v1-sandbox-session';

/**
 * Privileged handle returned by `HarnessV1SandboxProvider.create()`. The harness keeps
 * this for the lifetime of a session. It carries the infra surface (port
 * resolution, lifecycle, network policy mutation) alongside `session` — the
 * narrow {@link HarnessV1SandboxSession} that may be handed to user tools.
 *
 * The split is by design: a tool that should only touch the filesystem and
 * spawn processes receives `handle.session`, not the handle itself.
 */
export interface HarnessV1SandboxHandle {
  /**
   * Tool-safe view of the sandbox, typed as `Experimental_Sandbox`. Pass this
   * to any code that should not be able to stop the sandbox or change its
   * network policy.
   */
  readonly session: HarnessV1SandboxSession;

  /** Ports the sandbox exposes; resolvable to public URLs via `getPortUrl`. */
  readonly ports: ReadonlyArray<number>;

  /**
   * Resolve a publicly-reachable URL for a sandbox-exposed port. Bridge-backed
   * adapters call this to open their WebSocket to the in-sandbox bridge.
   */
  readonly getPortUrl: (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }) => PromiseLike<string>;

  /** Tear down the sandbox. Idempotent. */
  readonly stop: () => PromiseLike<void>;

  /**
   * Update the sandbox's outbound network policy. Optional — implementations
   * without a local enforcement primitive (e.g. just-bash) omit this. Callers
   * use optional-call (`handle.setNetworkPolicy?.(policy)`); a missing
   * implementation is a no-op.
   */
  readonly setNetworkPolicy?: (
    policy: HarnessV1NetworkPolicy,
  ) => PromiseLike<void>;

  /**
   * Replace the set of ports exposed by the sandbox. Full-replacement
   * semantics: ports omitted from the array are deregistered. Optional —
   * implementations that cannot expose ports (e.g. just-bash) omit this.
   */
  readonly setPorts?: (
    ports: ReadonlyArray<number>,
    options?: { abortSignal?: AbortSignal },
  ) => PromiseLike<void>;
}

/**
 * Outbound network policy applied by the sandbox runtime.
 *
 * `'allow-all'` and `'deny-all'` are convenience presets. `'custom'` is an
 * allow-list with an optional CIDR deny-list that takes precedence:
 *
 * - Reachable hosts are the union of `allowedHosts` and `allowedCIDRs`.
 * - `deniedCIDRs` wins over both, useful for blocking cloud-metadata IPs while
 *   otherwise allowing broad access.
 *
 * The two `'custom'` branches share the same discriminator but each requires
 * a different allow field. Specifying `'custom'` with only `deniedCIDRs`
 * (deny-only) is rejected at compile time — functionally it would be
 * equivalent to `'deny-all'`.
 */
export type HarnessV1NetworkPolicy =
  | { mode: 'allow-all' }
  | { mode: 'deny-all' }
  | {
      mode: 'custom';
      allowedHosts: ReadonlyArray<string>;
      allowedCIDRs?: ReadonlyArray<string>;
      deniedCIDRs?: ReadonlyArray<string>;
    }
  | {
      mode: 'custom';
      allowedHosts?: ReadonlyArray<string>;
      allowedCIDRs: ReadonlyArray<string>;
      deniedCIDRs?: ReadonlyArray<string>;
    };
