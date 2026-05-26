import type {
  HarnessV1ProviderSettings,
  HarnessV1SandboxHandle,
  HarnessV1SandboxProvider,
  HarnessV1SandboxSession,
} from '@ai-sdk/harness';
import { Sandbox } from '@vercel/sandbox';
import { VercelSandboxHandle } from './vercel-sandbox-handle';
import { VercelSandboxSession } from './vercel-sandbox-session';

/**
 * Parameters forwarded to `@vercel/sandbox`'s `Sandbox.create` when creating
 * a sandbox from scratch. Aliased directly from the underlying SDK so the
 * full surface — every option Vercel supports, including its native
 * `NetworkPolicy` — is available without us re-declaring it.
 */
type VercelSandboxCreateParams = NonNullable<
  Parameters<typeof Sandbox.create>[0]
>;

/**
 * Settings for {@link createVercelSandbox}. Two mutually-exclusive shapes
 * extended with the provider-agnostic {@link HarnessV1ProviderSettings} fields:
 *
 * - `{ sandbox }` — wrap an already-created `@vercel/sandbox` `Sandbox`. The
 *   caller owns its lifecycle; the provider's `stop()` is a no-op. Optionally
 *   declare `bridgePorts` to give the harness a port pool to lease from for
 *   concurrent sessions on the same provided sandbox.
 * - {@link VercelSandboxCreateParams} fields — provider creates the underlying
 *   sandbox. When the adapter declares a bootstrap recipe the provider uses
 *   `Sandbox.getOrCreate` to maintain a persistent named template snapshot
 *   keyed by the recipe identity, and forks an ephemeral sandbox per session
 *   from the snapshot. Use `name` to override the auto-derived template name.
 */
export type VercelSandboxSettings = HarnessV1ProviderSettings &
  (
    | {
        sandbox: Sandbox;
        bridgePorts?: ReadonlyArray<number>;
      }
    | (VercelSandboxCreateParams & {
        sandbox?: never;
        name?: string;
      })
  );

const VERCEL_PROVIDER_ID = 'vercel-sandbox';
const TEMPLATE_NAME_PREFIX = 'ai-sdk-harness';
const SNAPSHOT_POLL_INTERVAL_MS = 500;
const SNAPSHOT_POLL_TIMEOUT_MS = 30_000;

export function createVercelSandbox(
  settings: VercelSandboxSettings = {} as VercelSandboxSettings,
): HarnessV1SandboxProvider {
  return new VercelSandboxProvider(settings);
}

/**
 * `HarnessV1SandboxProvider` implementation backed by `@vercel/sandbox`.
 * Construct one via {@link createVercelSandbox} at module scope and pass it
 * to a `HarnessAgent` (or call `create()` directly if you want raw access to
 * a sandbox handle).
 */
export class VercelSandboxProvider implements HarnessV1SandboxProvider {
  readonly specificationVersion = 'harness-sandbox-v1' as const;
  readonly providerId = VERCEL_PROVIDER_ID;
  readonly setup?: HarnessV1ProviderSettings['setup'];
  readonly bridgePorts?: ReadonlyArray<number>;

  constructor(private readonly settings: VercelSandboxSettings) {
    this.setup = settings.setup;
    if (
      'sandbox' in settings &&
      settings.sandbox != null &&
      settings.bridgePorts != null &&
      settings.bridgePorts.length > 0
    ) {
      this.bridgePorts = [...settings.bridgePorts];
    }
  }

  create = async (options?: {
    abortSignal?: AbortSignal;
    identity?: string;
    onFirstCreate?: (
      session: HarnessV1SandboxSession,
      opts: { abortSignal?: AbortSignal },
    ) => Promise<void>;
  }): Promise<HarnessV1SandboxHandle> => {
    options?.abortSignal?.throwIfAborted();

    if ('sandbox' in this.settings && this.settings.sandbox != null) {
      return new VercelSandboxHandle({
        sandbox: this.settings.sandbox,
        ownsLifecycle: false,
      });
    }

    type CreateNewBranch = BaseCreateSandboxParams & {
      sandbox?: never;
      name?: string;
      setup?: HarnessV1ProviderSettings['setup'];
    };
    const settings = this.settings as CreateNewBranch;
    const {
      sandbox: _ignoredSandbox,
      setup: _ignoredSetup,
      name: explicitName,
      ...createParams
    } = settings;
    const baseParams: BaseCreateSandboxParams = createParams;

    const identity = options?.identity;
    const onFirstCreate = options?.onFirstCreate;

    if (identity == null || onFirstCreate == null) {
      const sandbox = await Sandbox.create({
        ...baseParams,
        ...(options?.abortSignal ? { signal: options.abortSignal } : {}),
      });
      return new VercelSandboxHandle({ sandbox, ownsLifecycle: true });
    }

    const templateName = explicitName ?? `${TEMPLATE_NAME_PREFIX}-${identity}`;
    const cache = getSnapshotCache();
    let snapshotId = cache.get(templateName);

    if (snapshotId == null) {
      const template = await Sandbox.getOrCreate({
        ...baseParams,
        name: templateName,
        persistent: true,
        snapshotExpiration: baseParams.snapshotExpiration ?? 0,
        onCreate: async sbx => {
          await onFirstCreate(new VercelSandboxSession(sbx), {
            abortSignal: options?.abortSignal,
          });
        },
        ...(options?.abortSignal ? { signal: options.abortSignal } : {}),
      });

      let resolvedId: string | undefined = template.currentSnapshotId;
      if (resolvedId == null) {
        const stopResult = await template.stop(
          options?.abortSignal ? { signal: options.abortSignal } : undefined,
        );
        resolvedId = stopResult.snapshot?.id;
        if (resolvedId == null) {
          resolvedId = await pollForTemplateSnapshot(
            templateName,
            options?.abortSignal,
          );
        }
      }

      cache.set(templateName, resolvedId);
      snapshotId = resolvedId;
    }

    const {
      runtime: _ignoredRuntime,
      source: _ignoredSource,
      persistent: _ignoredPersistent,
      ...forkParams
    } = baseParams;

    const fork = await Sandbox.create({
      ...forkParams,
      source: { type: 'snapshot', snapshotId },
      ...(options?.abortSignal ? { signal: options.abortSignal } : {}),
    });
    return new VercelSandboxHandle({ sandbox: fork, ownsLifecycle: true });
  };
}

/**
 * Base shape of `Sandbox.create` params extracted from the union (excludes
 * the `source: { type: 'snapshot' }` variant) so all create-time fields
 * are typed as present.
 */
type BaseCreateSandboxParams = Exclude<
  VercelSandboxCreateParams,
  { source: { type: 'snapshot'; snapshotId: string } }
>;

const SNAPSHOT_CACHE_KEY = Symbol.for(
  'ai-sdk.harness.vercel-template-snapshots',
);

type SnapshotCache = Map<string, string>;

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

async function pollForTemplateSnapshot(
  name: string,
  abortSignal: AbortSignal | undefined,
): Promise<string> {
  const deadline = Date.now() + SNAPSHOT_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    abortSignal?.throwIfAborted();
    const refreshed = await Sandbox.get({
      name,
      resume: false,
      ...(abortSignal ? { signal: abortSignal } : {}),
    });
    if (refreshed.currentSnapshotId) {
      return refreshed.currentSnapshotId;
    }
    await new Promise<void>(resolve =>
      setTimeout(resolve, SNAPSHOT_POLL_INTERVAL_MS),
    );
  }
  throw new Error(
    `Timed out waiting for snapshot of template "${name}" to publish.`,
  );
}
