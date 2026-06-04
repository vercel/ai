import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { HarnessV1NetworkSandboxSession } from './harness-v1-network-sandbox-session';

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
   *
   * `sessionWorkDir` is the directory the agent runs in for this session —
   * the same path the harness adapter operates against. It is created before
   * `setup` runs. The `session` here defaults its commands to the sandbox
   * root, so to act on the agent's workspace pass `sessionWorkDir` explicitly
   * (e.g. `session.run({ command: 'git clone … .', workingDirectory:
   * sessionWorkDir })`).
   */
  readonly setup?: (opts: {
    readonly session: SandboxSession;
    readonly sessionWorkDir: string;
    readonly abortSignal?: AbortSignal;
  }) => Promise<void>;
}

/**
 * Provider that produces network sandbox sessions for harness sessions. Lives at
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
    /**
     * Stable per-session identifier. When supplied, the provider names the
     * underlying resource deterministically so a future call to `resume`
     * (potentially from a different process) can find the same sandbox.
     * Omitted from prewarm and other paths that don't need a resumable
     * resource — in that case the provider falls back to its native
     * auto-naming.
     */
    sessionId?: string;
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
      session: SandboxSession,
      opts: { abortSignal?: AbortSignal },
    ) => Promise<void>;
  }) => PromiseLike<HarnessV1NetworkSandboxSession>;

  /**
   * Reattach to an existing sandbox previously created with the same
   * `sessionId`. Optional — providers that cannot rehydrate by id (e.g.
   * just-bash) omit this; the harness throws
   * `HarnessCapabilityUnsupportedError` when resume is attempted against
   * them.
   *
   * The provider derives the sandbox identifier from `sessionId` using the
   * same deterministic naming scheme it used in `create`. Returns a network
   * sandbox session bound to the existing resource.
   */
  readonly resume?: (options: {
    sessionId: string;
    abortSignal?: AbortSignal;
  }) => PromiseLike<HarnessV1NetworkSandboxSession>;
}
