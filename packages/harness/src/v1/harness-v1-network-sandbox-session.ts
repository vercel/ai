import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';

/**
 * Connection details for a sandbox-exposed port. Headers are scoped to the
 * returned URL and must be included when opening the connection.
 */
export type HarnessV1PortEndpoint = {
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
};

/**
 * Network sandbox session returned by `HarnessV1SandboxProvider.createSession()`. The
 * harness keeps this for the lifetime of a session. It is itself a
 * {@link SandboxSession} (file I/O, exec, spawn) and adds the infra surface on
 * top: port resolution, lifecycle, and network-policy mutation.
 *
 * Code that should only touch the filesystem and spawn processes receives the
 * reduced view from {@link HarnessV1NetworkSandboxSession.restricted}, never the
 * network sandbox session itself — so it cannot stop the sandbox, change
 * network access, or transform requests.
 */
export interface HarnessV1NetworkSandboxSession extends SandboxSession {
  /**
   * Stable identifier for the underlying sandbox resource. Used by the
   * harness session manager as the durable lookup key for cross-process
   * resume — the framework persists this on lifecycle state so a future
   * process can call `HarnessV1SandboxProvider.resume?({ sessionId })` and
   * reach the same resource. Providers populate it from their native
   * identifier (Vercel: the sandbox name; just-bash: a UUID minted at
   * create time).
   */
  readonly id: string;

  /**
   * The sandbox's default working directory — the absolute path that
   * `run`/`spawn` resolve relative commands against when no `workingDirectory`
   * is given. Read from the live sandbox (it is provider-specific and
   * configurable at create time: Vercel defaults to `/vercel/sandbox`,
   * just-bash to `/home/user`), never hardcoded.
   *
   * The framework composes each session's working directory underneath this
   * path (`<defaultWorkingDirectory>/<harnessId>-<sessionId>`) so adapters do
   * not bake a provider-specific base into their own paths.
   */
  readonly defaultWorkingDirectory: string;

  /** Ports the sandbox exposes; resolvable via `getPortEndpoint`. */
  readonly ports: ReadonlyArray<number>;

  /**
   * Resolve the connection details for a sandbox-exposed port. Bridge-backed
   * adapters call this to open their WebSocket to the in-sandbox bridge.
   */
  readonly getPortEndpoint: (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }) => PromiseLike<HarnessV1PortEndpoint>;

  /**
   * Resolve a publicly-reachable URL for a sandbox-exposed port.
   *
   * @deprecated Use `getPortEndpoint` instead.
   */
  readonly getPortUrl: (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }) => PromiseLike<string>;

  /** Stop the sandbox. Idempotent. */
  readonly stop: () => PromiseLike<void>;

  /**
   * Stop the sandbox session, then perform any additional cleanup necessary
   * to destroy it, such as deleting its backing resource or freeing resources.
   * Implementations with no cleanup beyond stopping may delegate to `stop()`.
   * Implementations must handle both a still-running sandbox and a previously
   * stopped sandbox.
   */
  readonly destroy: () => PromiseLike<void>;

  /**
   * Update the sandbox's outbound network policy. Optional — implementations
   * without a local enforcement primitive (e.g. just-bash) omit this. Callers
   * use optional-call (`sandboxSession.setNetworkPolicy?.(policy)`); a
   * missing implementation is a no-op.
   */
  readonly setNetworkPolicy?: (
    policy: HarnessV1NetworkPolicy,
  ) => PromiseLike<void>;

  /**
   * Replace the sandbox's outbound request-transformation rules. Optional —
   * implementations expose this only when credentials can be injected outside
   * the sandbox security boundary. Calling this method assumes authority over
   * the complete transformation set; harness adapters should normally use
   * `addRequestTransformations` instead. Adapters may preserve legacy
   * credential-forwarding behavior when additive request transformations are
   * unavailable.
   */
  readonly setRequestTransformations?: (
    transformations: ReadonlyArray<HarnessV1RequestTransformation>,
  ) => PromiseLike<void>;

  /**
   * Add outbound request-transformation rules without replacing rules already
   * managed by the sandbox session. Optional for the same reason as
   * `setRequestTransformations`. Harness adapters should use this additive
   * capability unless they explicitly own the complete transformation set.
   */
  readonly addRequestTransformations?: (
    transformations: ReadonlyArray<HarnessV1RequestTransformation>,
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

  /**
   * Reduced view of this session, typed as the bare {@link SandboxSession}
   * (file I/O, exec, spawn) — nothing that could stop the sandbox or change
   * its network policy. Pass this to user-tool `execute()` calls and other
   * code that must not reach the infra surface.
   *
   * The returned object points at exactly the same underlying sandbox
   * resource as the network sandbox session it was produced from; it is only a
   * narrower surface over the same resource, not a separate sandbox. In
   * particular, it cannot mutate network access or request transformations.
   */
  readonly restricted: () => SandboxSession;
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

type HarnessV1RequestTransformationPathMatcher =
  | { exact: string }
  | { startsWith: string }
  | { regex: string };

type HarnessV1RequestTransformationKeyValuePartMatcher =
  | { exact: string }
  | { startsWith: string }
  | { regex: string };

type HarnessV1RequestTransformationKeyValueMatcher = {
  readonly key?: HarnessV1RequestTransformationKeyValuePartMatcher;
  readonly value?: HarnessV1RequestTransformationKeyValuePartMatcher;
};

/**
 * Outbound HTTPS request transformation applied outside the sandbox security
 * boundary. The host is part of the match so each rule is self-contained and
 * several rules, including several for the same host, can be installed at
 * once.
 *
 * Credential values belong in `transform.headers`, while the sandbox process
 * receives only a non-secret placeholder. Implementations must overwrite
 * matching request headers after the request leaves the sandbox rather than
 * making transformed values available inside it.
 */
export type HarnessV1RequestTransformation = {
  readonly match: {
    readonly host: string;
    readonly path?: HarnessV1RequestTransformationPathMatcher;
    readonly method?: ReadonlyArray<string>;
    readonly queryString?: ReadonlyArray<HarnessV1RequestTransformationKeyValueMatcher>;
    readonly headers?: ReadonlyArray<HarnessV1RequestTransformationKeyValueMatcher>;
  };
  readonly transform: {
    readonly headers: Readonly<Record<string, string>>;
  };
};

export type HarnessV1RequestTransformationSources<AuthenticationMode> = {
  env: Record<string, string>;
  sandboxEnv: Record<string, string>;
  auth: AuthenticationMode;
};
