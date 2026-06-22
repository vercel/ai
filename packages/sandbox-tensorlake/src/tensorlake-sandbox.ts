import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import {
  Sandbox,
  SandboxStatus,
  type CreateAndConnectOptions,
  type SandboxClientOptions,
} from 'tensorlake';
import { TensorlakeNetworkSandboxSession } from './tensorlake-network-sandbox-session';
import { TensorlakeSandboxSession } from './tensorlake-sandbox-session';

/**
 * Parameters forwarded to `tensorlake`'s `Sandbox.create`, plus adapter-specific
 * fields for advertising extra session ports and the working directory.
 */
type TensorlakeSandboxCreateParams = CreateAndConnectOptions &
  Partial<SandboxClientOptions> & {
    /**
     * Extra in-sandbox ports to advertise on the session (reachable from the
     * host via `getPortUrl`, which opens an authenticated tunnel). The harness
     * bridge port is always advertised automatically, so this is only needed to
     * reach additional services (e.g. a dev server) the agent starts.
     */
    ports?: ReadonlyArray<number>;
    /**
     * Working directory the harness composes session paths under. Defaults to
     * `/home/tl-user` (the default image's user home, which is writable without
     * root). Set this when using a custom image whose default user/home differ.
     */
    workingDirectory?: string;
    /**
     * Shell commands run **as root**, once, immediately after the sandbox is
     * created and before any harness bootstrap. Use this to provision tools the
     * base image lacks without building a custom image — e.g. install `pnpm`
     * (which the Claude Code harness needs) into a system `PATH` directory the
     * non-root run user can then execute:
     *
     * ```ts
     * createTensorlakeSandbox({ setup: ['npm install -g pnpm@10'] });
     * ```
     *
     * Each command runs via `bash -c` as root; a non-zero exit aborts session
     * creation. With a snapshot recipe the setup runs on the template before the
     * checkpoint, so the provisioned tools are baked into every forked session.
     * Not available when wrapping an existing sandbox (`{ sandbox }`) — the
     * caller owns that sandbox's provisioning.
     */
    setup?: ReadonlyArray<string>;
  };

/**
 * Settings for {@link createTensorlakeSandbox}. Two mutually-exclusive shapes:
 *
 * - `{ sandbox }` — wrap an already-created `tensorlake` `Sandbox`. The caller
 *   owns its lifecycle; the session's `stop()` and `destroy()` are no-ops.
 *   Optionally declare `bridgePorts` to give the harness a port pool to lease
 *   from for concurrent sessions on the same provided sandbox, and `ports` to
 *   advertise extra session ports reachable via `getPortUrl`.
 * - {@link TensorlakeSandboxCreateParams} fields — provider creates the
 *   underlying sandbox. When the adapter declares a bootstrap recipe the
 *   provider runs it once per identity, checkpoints a snapshot, and forks an
 *   ephemeral sandbox per session from that snapshot.
 */
export type TensorlakeSandboxSettings =
  | {
      sandbox: Sandbox;
      bridgePorts?: ReadonlyArray<number>;
      ports?: ReadonlyArray<number>;
      /**
       * Working directory the harness composes session paths under. Defaults to
       * `/home/tl-user`. Set this when the provided sandbox uses a custom image
       * whose default user/home differ.
       */
      workingDirectory?: string;
    }
  | (TensorlakeSandboxCreateParams & {
      sandbox?: never;
    });

/**
 * 30 minutes. Tensorlake defaults to 600s (10 minutes) which is too short for
 * multi-step workflows — the sandbox expires between steps.
 */
const DEFAULT_SANDBOX_TIMEOUT_SECS = 30 * 60;

const TENSORLAKE_PROVIDER_ID = 'tensorlake-sandbox';
const TEMPLATE_NAME_PREFIX = 'ai-sdk-harness';
const SESSION_NAME_PREFIX = 'ai-sdk-harness-session';

/**
 * Run the provider's `setup` commands as root on a freshly created sandbox.
 * Each command runs via `bash -c` so shell syntax (pipes, `&&`, redirects)
 * works; a non-zero exit throws so a failed provisioning step surfaces rather
 * than handing a half-configured sandbox to the harness. Runs as `root` because
 * the default image's run user (`tl-user`) cannot write to system `PATH`
 * directories — installing there as root makes the tool executable by that user.
 */
async function runRootSetup(
  sandbox: Sandbox,
  setup: ReadonlyArray<string> | undefined,
  abortSignal?: AbortSignal,
): Promise<void> {
  if (setup == null || setup.length === 0) return;
  for (const command of setup) {
    abortSignal?.throwIfAborted();
    const result = await sandbox.run('bash', {
      args: ['-c', command],
      user: 'root',
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `Tensorlake sandbox setup command failed (exit ${result.exitCode}): ${command}\n${
          result.stderr || result.stdout
        }`,
      );
    }
  }
}

function sessionSandboxName(sessionId: string): string {
  // Tensorlake sandbox names allow only lowercase letters, digits, and hyphens.
  // Harness session ids come from a mixed-case alphabet (and a caller may supply
  // anything), so lowercase and replace every other character with a hyphen to
  // form a valid, deterministic name. The transform is pure, so a later
  // `resumeSession({ sessionId })` recomputes the identical name.
  const safe = sessionId.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return `${SESSION_NAME_PREFIX}-${safe}`;
}

/**
 * Deterministic JSON-ish serialization with sorted keys so the same logical
 * settings always produce the same string regardless of construction order.
 * Keys whose value is `undefined` are dropped (an absent option and an
 * explicit `undefined` mean the same thing here) to avoid spurious mismatches.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .filter(key => record[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}

/**
 * A short, stable discriminator for the settings that determine a snapshot
 * template's contents and the project it lives in.
 *
 * The snapshot cache is keyed by the harness `identity`, but `identity` is the
 * bootstrap recipe's fingerprint and is blind to provider settings. Two
 * providers in the same process can therefore share an identity while differing
 * in `setup`, `image`, credentials, or `namespace` — producing genuinely
 * different (or differently-scoped) snapshots. Folding these into the template
 * name keeps each provider's snapshot isolated instead of letting whichever
 * built first win the shared identity key (which would otherwise hand one
 * provider a snapshot provisioned for — or owned by the project of — another).
 */
function templateSettingsKey(
  params: TensorlakeSandboxCreateParams,
  setup: ReadonlyArray<string> | undefined,
): string {
  const serialized = stableStringify({ params, setup: setup ?? null });
  // FNV-1a (32-bit). Not cryptographic — just a stable cache discriminator that
  // emits valid name characters ([0-9a-f]). Hashing also avoids embedding the
  // serialized credentials (e.g. `apiKey`) into a sandbox name.
  let hash = 0x811c9dc5;
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Extract the `tensorlake` client options (credentials, endpoint, namespace,
 * retry/timeout tuning) from the provider settings so non-create operations
 * like `Sandbox.list`/`Sandbox.connect` target the same project/namespace and
 * authenticate the same way `Sandbox.create` does. Without this, a provider
 * configured with explicit `apiKey`/`namespace`/etc. (rather than the ambient
 * environment) would search and connect with default credentials on resume and
 * fail to find the sandbox it created.
 */
function clientOptionsFrom(
  settings: Partial<SandboxClientOptions>,
): Partial<SandboxClientOptions> {
  const {
    apiUrl,
    apiKey,
    organizationId,
    projectId,
    namespace,
    maxRetries,
    retryBackoffMs,
    requestTimeout,
    timeoutMs,
  } = settings;
  return {
    apiUrl,
    apiKey,
    organizationId,
    projectId,
    namespace,
    maxRetries,
    retryBackoffMs,
    requestTimeout,
    timeoutMs,
  };
}

export function createTensorlakeSandbox(
  settings: TensorlakeSandboxSettings = {} as TensorlakeSandboxSettings,
): HarnessV1SandboxProvider {
  return new TensorlakeSandboxProvider(settings);
}

/**
 * `HarnessV1SandboxProvider` implementation backed by `tensorlake`. Construct
 * one via {@link createTensorlakeSandbox} at module scope and pass it to a
 * `HarnessAgent` (or call `createSession()` directly for raw access to a
 * network sandbox session).
 */
export class TensorlakeSandboxProvider implements HarnessV1SandboxProvider {
  readonly specificationVersion = 'harness-sandbox-v1' as const;
  readonly providerId = TENSORLAKE_PROVIDER_ID;
  readonly bridgePorts?: ReadonlyArray<number>;

  constructor(private readonly settings: TensorlakeSandboxSettings) {
    if (
      'sandbox' in settings &&
      settings.sandbox != null &&
      settings.bridgePorts != null &&
      settings.bridgePorts.length > 0
    ) {
      this.bridgePorts = [...settings.bridgePorts];
    }
  }

  createSession = async (options?: {
    sessionId?: string;
    abortSignal?: AbortSignal;
    identity?: string;
    onFirstCreate?: (
      session: SandboxSession,
      opts: { abortSignal?: AbortSignal },
    ) => Promise<void>;
  }): Promise<HarnessV1NetworkSandboxSession> => {
    options?.abortSignal?.throwIfAborted();

    if ('sandbox' in this.settings && this.settings.sandbox != null) {
      return new TensorlakeNetworkSandboxSession({
        sandbox: this.settings.sandbox,
        ownsLifecycle: false,
        ports: this.settings.ports,
        workingDirectory: this.settings.workingDirectory,
      });
    }

    const {
      sandbox: _ignoredSandbox,
      ports,
      workingDirectory,
      setup,
      name: explicitName,
      ...createParams
    } = this.settings as Extract<
      TensorlakeSandboxSettings,
      { sandbox?: never }
    >;

    const baseParams: TensorlakeSandboxCreateParams = {
      ...createParams,
      timeoutSecs: createParams.timeoutSecs ?? DEFAULT_SANDBOX_TIMEOUT_SECS,
    };

    // When sessionId is supplied, name the per-session sandbox deterministically
    // so a future `resumeSession({ sessionId })` can locate it via the same
    // naming scheme. Absent sessionId (e.g. prewarm), fall back to the
    // caller-provided name or Tensorlake's ephemeral (unnamed) sandbox.
    const sessionName = options?.sessionId
      ? sessionSandboxName(options.sessionId)
      : explicitName;

    const identity = options?.identity;
    const onFirstCreate = options?.onFirstCreate;

    // No snapshot recipe: create directly and run the one-time setup (if any)
    // immediately after create.
    if (identity == null || onFirstCreate == null) {
      const sandbox = await Sandbox.create({
        ...baseParams,
        ...(sessionName != null ? { name: sessionName } : {}),
      });
      // If post-create initialization fails we never return a session, so the
      // harness cleanup path can't stop() it. Terminate here to avoid leaking a
      // running sandbox (and, when named from a sessionId, reserving the name
      // against retries) before propagating the original error.
      try {
        await runRootSetup(sandbox, setup, options?.abortSignal);
        if (onFirstCreate != null) {
          await onFirstCreate(new TensorlakeSandboxSession(sandbox), {
            abortSignal: options?.abortSignal,
          });
        }
      } catch (error) {
        await sandbox.terminate().catch(() => {});
        throw error;
      }
      return new TensorlakeNetworkSandboxSession({
        sandbox,
        ports,
        ownsLifecycle: true,
        workingDirectory,
        resumable: sessionName != null,
      });
    }

    // Snapshot recipe: build (or reuse) a snapshot for this identity, then fork
    // an ephemeral session sandbox from it. The template name doubles as the
    // process-global cache key, so it must also distinguish providers that share
    // an `identity` but differ in settings/credentials (see
    // `templateSettingsKey`); without that suffix one provider could reuse
    // another's snapshot. An explicit `name` is the caller taking ownership of
    // the name, so it is used verbatim.
    const templateName =
      explicitName ??
      `${TEMPLATE_NAME_PREFIX}-${identity}-${templateSettingsKey(
        baseParams,
        setup,
      )}`;
    const cache = getSnapshotCache();

    // Cache the in-flight build promise (not just the resolved id) so that
    // concurrent same-identity sessions on a cold process share one bootstrap.
    // Without this, both would miss the cache and race to create/checkpoint the
    // same deterministic template name — failing on the duplicate name or
    // running the expensive bootstrap twice.
    let pending = cache.get(templateName);
    if (pending == null) {
      pending = (async () => {
        const template = await Sandbox.create({
          ...baseParams,
          name: templateName,
        });
        // The named template leaks (and keeps its name reserved) if bootstrap
        // or checkpoint throws, so terminate it on any failure before rethrowing.
        try {
          await runRootSetup(template, setup, options?.abortSignal);
          await onFirstCreate(new TensorlakeSandboxSession(template), {
            abortSignal: options?.abortSignal,
          });
          const snapshot = await template.checkpoint();
          if (snapshot?.snapshotId == null) {
            throw new Error(
              `Failed to checkpoint template "${templateName}": no snapshot id returned.`,
            );
          }
          await template.terminate().catch(() => {});
          return snapshot.snapshotId;
        } catch (error) {
          await template.terminate().catch(() => {});
          throw error;
        }
      })();
      cache.set(templateName, pending);
      // Evict on failure so a later session can retry rather than inheriting a
      // permanently-rejected promise.
      pending.catch(() => {
        if (cache.get(templateName) === pending) cache.delete(templateName);
      });
    }
    const snapshotId = await pending;

    // The fork is an ephemeral per-session sandbox. Name it only from a
    // `sessionId` (so a later `resumeSession` can find it via the same scheme);
    // never inherit `explicitName`, which already names the template created
    // above — reusing it would collide with the template (names are unique for
    // resumable sandboxes) and across concurrent same-identity forks.
    const forkName = options?.sessionId
      ? sessionSandboxName(options.sessionId)
      : undefined;
    const { snapshotId: _ignoredSnapshot, ...forkParams } = baseParams;
    const fork = await Sandbox.create({
      ...forkParams,
      snapshotId,
      ...(forkName != null ? { name: forkName } : {}),
    });
    return new TensorlakeNetworkSandboxSession({
      sandbox: fork,
      ports,
      ownsLifecycle: true,
      workingDirectory,
      resumable: forkName != null,
    });
  };

  resumeSession = async (options: {
    sessionId: string;
    abortSignal?: AbortSignal;
  }): Promise<HarnessV1NetworkSandboxSession> => {
    options.abortSignal?.throwIfAborted();

    // Wrap-existing case: caller owns the sandbox. Same session as createSession.
    if ('sandbox' in this.settings && this.settings.sandbox != null) {
      return new TensorlakeNetworkSandboxSession({
        sandbox: this.settings.sandbox,
        ownsLifecycle: false,
        ports: this.settings.ports,
        workingDirectory: this.settings.workingDirectory,
      });
    }

    // Forward the same client options (credentials, endpoint, namespace) that
    // `createSession` passes to `Sandbox.create`, so list/connect search and
    // authenticate against the project the sandbox was created in.
    const clientOptions = clientOptionsFrom(
      this.settings as Extract<TensorlakeSandboxSettings, { sandbox?: never }>,
    );

    // Tensorlake connects by sandboxId, not name, so resolve the deterministic
    // session name back to a live sandbox via `Sandbox.list()`.
    const targetName = sessionSandboxName(options.sessionId);
    const sandboxes = await Sandbox.list(clientOptions);
    const match = sandboxes.find(
      info =>
        info.name === targetName && info.status !== SandboxStatus.TERMINATED,
    );
    if (match == null) {
      throw new Error(
        `No resumable Tensorlake sandbox found for session "${options.sessionId}".`,
      );
    }

    const sandbox = await Sandbox.connect({
      sandboxId: match.sandboxId,
      ...clientOptions,
    });
    // `connect()` does not auto-resume. Only a suspended sandbox needs an
    // explicit resume; one that is already running (e.g. its bridge is still
    // live) is usable as-is, so we skip resume rather than call it and swallow
    // the resulting "already running" error. Gating on status this way lets a
    // genuine resume failure (expired snapshot, no capacity) propagate here
    // instead of yielding a session that fails opaquely on the first
    // bridge/command call.
    if (
      match.status === SandboxStatus.SUSPENDED ||
      match.status === SandboxStatus.SUSPENDING
    ) {
      await sandbox.resume();
    }
    return new TensorlakeNetworkSandboxSession({
      sandbox,
      ownsLifecycle: true,
      // Advertise the provider's configured `ports`, exactly as `createSession`
      // does, so `session.ports` is symmetric across create/resume. The
      // configured ports are an adapter-level tunnel concept never forwarded to
      // Tensorlake, so `match.exposedPorts` (Tensorlake's public-ingress
      // exposure metadata) would not contain them and is the wrong source here.
      ports: (
        this.settings as Extract<TensorlakeSandboxSettings, { sandbox?: never }>
      ).ports,
      workingDirectory: this.settings.workingDirectory,
      // `Sandbox.connect()` returns a handle whose local `name` is not yet
      // populated, but we matched it by name above, so it is resumable: a later
      // `stop()` must suspend (preserving state) rather than terminate.
      resumable: true,
    });
  };
}

const SNAPSHOT_CACHE_KEY = Symbol.for(
  'ai-sdk.harness.tensorlake-template-snapshots',
);

type SnapshotCache = Map<string, Promise<string>>;

function getSnapshotCache(): SnapshotCache {
  const globals = globalThis as {
    [SNAPSHOT_CACHE_KEY]?: SnapshotCache;
  };
  let cache = globals[SNAPSHOT_CACHE_KEY];
  if (cache == null) {
    cache = new Map();
    globals[SNAPSHOT_CACHE_KEY] = cache;
  }
  return cache;
}
