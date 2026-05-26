import type { HarnessV1SandboxHandle } from './harness-v1-sandbox-handle';
import type { HarnessV1SandboxSession } from './harness-v1-sandbox-session';

/**
 * Base type for sandbox-provider settings. Every concrete provider's settings
 * type (e.g. `VercelSandboxSettings`, `JustBashSandboxSettings`) extends this
 * so provider-agnostic features are surfaced consistently across providers.
 */
export interface HarnessV1ProviderSettings {
  /**
   * Optional consumer-defined sandbox setup. Runs once at every session
   * start, after the sandbox is created/resumed and the adapter bootstrap
   * has been applied, before the bridge spawns. Provider-agnostic.
   *
   * Use cases: write per-environment config files, install extra tools,
   * activate licenses, run db migrations. For one-time setup that should
   * be baked into a snapshot (cloning a large repo, installing heavy
   * binaries), use the provider's native primitive (e.g. Vercel's
   * `source: { type: 'git' }`) or pre-build a sandbox externally and pass
   * it via the wrap-existing settings branch.
   */
  readonly setup?: (opts: {
    readonly session: HarnessV1SandboxSession;
    readonly abortSignal?: AbortSignal;
  }) => Promise<void>;
}

/**
 * Provider that produces sandbox handles for harness sessions. Lives at
 * module scope as a stable, synchronous object — analogous to
 * `LanguageModelV4` providers, no I/O performed at construction. The actual
 * sandbox is created (or wrapped) when `HarnessAgent` calls `create()`.
 */
export interface HarnessV1SandboxProvider {
  readonly specificationVersion: 'harness-sandbox-v1';
  readonly providerId: string;

  /**
   * View of the consumer-defined setup, if any. Providers pass through what
   * the consumer put in settings. The harness session manager reads this
   * and runs the function after sandbox creation and adapter bootstrap.
   */
  readonly setup?: HarnessV1ProviderSettings['setup'];

  /**
   * Pool of ports the consumer reserved on a caller-provided sandbox for
   * concurrent harness sessions. The session manager leases one port per
   * session and releases on close.
   *
   * Only meaningful when the provider wraps a caller-provided sandbox
   * (the caller pre-declared the ports). In create-new modes the provider
   * mints a fresh sandbox per session, so no leasing is needed; providers
   * leave this undefined.
   */
  readonly bridgePorts?: ReadonlyArray<number>;

  readonly create: (options?: {
    abortSignal?: AbortSignal;
    /**
     * Stable identity for snapshot-based reuse. Providers that support
     * persistence/snapshots use this as part of the persistent sandbox
     * name; subsequent calls with the same identity resume from snapshot.
     *
     * Ignored when the provider is wrapping a caller-provided sandbox.
     */
    identity?: string;
    /**
     * Called exactly once per identity, on fresh creation. Snapshot-capable
     * providers wire this into the platform's one-time-setup hook so the
     * side effects are baked into the snapshot. Providers without snapshot
     * support run it immediately after fresh create.
     *
     * Not called when the provider is wrapping a caller-provided sandbox
     * (the caller owns the sandbox; the framework applies its own
     * idempotent bootstrap post-create instead).
     */
    onFirstCreate?: (
      session: HarnessV1SandboxSession,
      opts: { abortSignal?: AbortSignal },
    ) => Promise<void>;
  }) => PromiseLike<HarnessV1SandboxHandle>;
}
