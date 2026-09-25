import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { Sandbox } from '@vercel/sandbox';
import { VercelNetworkSandboxSession } from './vercel-network-sandbox-session';
import { VercelSandboxSession } from './vercel-sandbox-session';
import {
  DEFAULT_SANDBOX_RUNTIME,
  DEFAULT_SANDBOX_TIMEOUT_MS,
  TEMPLATE_NAME_PREFIX,
  VERCEL_PROVIDER_ID,
  getSandboxLookupParams,
  hasExplicitSandboxEnvironment,
  pollForTemplateSnapshot,
  withVercelSandboxAuthenticationError,
  type BaseCreateSandboxParams,
} from './vercel-sandbox';

type VercelSandboxCreateParams = NonNullable<
  Parameters<typeof Sandbox.create>[0]
>;

type DistributiveOmit<T, K extends keyof any> = T extends unknown
  ? Omit<T, K>
  : never;

type VercelSandboxCreationSettings = DistributiveOmit<
  VercelSandboxCreateParams,
  'onResume'
> & {
  sandbox?: never;
  name?: string;
};

/**
 * Settings for `createVercelSandbox`. Two mutually-exclusive shapes:
 *
 * - `{ sandbox }` — wrap an already-created `@vercel/sandbox` `Sandbox`. The
 *   caller owns its lifecycle; the provider's `stop()` and `destroy()` are
 *   no-ops.
 * - {@link VercelSandboxCreateParams} fields — provider creates the underlying
 *   sandbox. When the adapter declares a bootstrap recipe the provider uses
 *   `Sandbox.getOrCreate` to maintain a persistent named template snapshot
 *   keyed by the recipe identity, and forks an ephemeral sandbox per session
 *   from the snapshot. Use `name` to override the auto-derived template name.
 *
 * @deprecated Use `VercelNetworkSandboxSessionCreateOptions` for new sessions.
 */
export type VercelSandboxSettings =
  | { sandbox: Sandbox }
  | VercelSandboxCreationSettings;

const SESSION_NAME_PREFIX = 'ai-sdk-harness-session';

function sessionSandboxName(sessionId: string): string {
  return `${SESSION_NAME_PREFIX}-${sessionId}`;
}

/** @deprecated Use `createVercelNetworkSandboxSession` instead. */
export function createVercelSandbox(
  settings: VercelSandboxSettings = {} as VercelSandboxSettings,
): HarnessV1SandboxProvider {
  console.warn(
    'createVercelSandbox is deprecated. Use createVercelNetworkSandboxSession and HarnessAgent.createSession({ sandboxSession }) instead.',
  );
  return new VercelSandboxProvider(settings);
}

/**
 * `HarnessV1SandboxProvider` implementation backed by `@vercel/sandbox`.
 * Construct one via {@link createVercelSandbox} at module scope and pass it
 * to a `HarnessAgent` (or call `createSession()` directly if you want raw
 * access to a network sandbox session).
 */
/** @deprecated Use `createVercelNetworkSandboxSession` instead. */
export class VercelSandboxProvider implements HarnessV1SandboxProvider {
  readonly specificationVersion = 'harness-sandbox-v1' as const;
  readonly providerId = VERCEL_PROVIDER_ID;

  constructor(private readonly settings: VercelSandboxSettings) {
    console.warn(
      'VercelSandboxProvider is deprecated. Use createVercelNetworkSandboxSession instead.',
    );
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
      return new VercelNetworkSandboxSession({
        sandbox: this.settings.sandbox,
        ownsLifecycle: false,
      });
    }

    type CreateNewBranch = BaseCreateSandboxParams & {
      sandbox?: never;
      name?: string;
    };
    const settings = this.settings as CreateNewBranch;
    const {
      sandbox: _ignoredSandbox,
      name: explicitName,
      ...createParams
    } = settings;
    // Sandbox v3 changed its implicit default from the Node 24 runtime to the
    // Universal managed image. Keep this adapter's existing default stable while
    // allowing callers to opt into managed images explicitly.
    const baseParams = {
      ...(hasExplicitSandboxEnvironment(createParams)
        ? {}
        : { runtime: DEFAULT_SANDBOX_RUNTIME }),
      ...createParams,
      timeout: createParams.timeout ?? DEFAULT_SANDBOX_TIMEOUT_MS,
    } as BaseCreateSandboxParams;

    const identity = options?.identity;
    const onFirstCreate = options?.onFirstCreate;

    // When sessionId is supplied, name the per-session sandbox deterministically
    // so a future `resumeSession({ sessionId })` can locate it via
    // `Sandbox.get({ name })`. Absent sessionId (e.g. prewarm), fall back to
    // Vercel's auto-naming.
    const sessionNameOverride = options?.sessionId
      ? { name: sessionSandboxName(options.sessionId) }
      : {};

    if (identity == null || onFirstCreate == null) {
      const sandbox = await withVercelSandboxAuthenticationError({
        settings: this.settings,
        operation: () =>
          Sandbox.create({
            ...baseParams,
            ...sessionNameOverride,
            ...(options?.abortSignal ? { signal: options.abortSignal } : {}),
          }),
      });
      return new VercelNetworkSandboxSession({ sandbox, ownsLifecycle: true });
    }

    const templateName = explicitName ?? `${TEMPLATE_NAME_PREFIX}-${identity}`;
    const cache = getSnapshotCache();
    let snapshotId = cache.get(templateName);

    if (snapshotId == null) {
      const template = await withVercelSandboxAuthenticationError({
        settings: this.settings,
        operation: () =>
          Sandbox.getOrCreate({
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
          }),
      });

      let resolvedId: string | undefined = template.currentSnapshotId;
      if (resolvedId == null) {
        const stopResult = await withVercelSandboxAuthenticationError({
          settings: this.settings,
          operation: () =>
            template.stop(
              options?.abortSignal
                ? { signal: options.abortSignal }
                : undefined,
            ),
        });
        resolvedId = stopResult.snapshot?.id;
        if (resolvedId == null) {
          resolvedId = await withVercelSandboxAuthenticationError({
            settings: this.settings,
            operation: () =>
              pollForTemplateSnapshot({
                name: templateName,
                lookupParams: getSandboxLookupParams(baseParams),
                abortSignal: options?.abortSignal,
              }),
          });
        }
      }

      cache.set(templateName, resolvedId);
      snapshotId = resolvedId;
    }

    const {
      runtime: _ignoredRuntime,
      image: _ignoredImage,
      source: _ignoredSource,
      persistent: _ignoredPersistent,
      ...forkParams
    } = baseParams;

    const fork = await withVercelSandboxAuthenticationError({
      settings: this.settings,
      operation: () =>
        Sandbox.create({
          ...forkParams,
          source: { type: 'snapshot', snapshotId },
          ...sessionNameOverride,
          ...(options?.abortSignal ? { signal: options.abortSignal } : {}),
        }),
    });
    return new VercelNetworkSandboxSession({
      sandbox: fork,
      ownsLifecycle: true,
    });
  };

  resumeSession = async (options: {
    sessionId: string;
    abortSignal?: AbortSignal;
  }): Promise<HarnessV1NetworkSandboxSession> => {
    options.abortSignal?.throwIfAborted();

    // Wrap-existing case: caller owns the sandbox. Same session as createSession.
    if ('sandbox' in this.settings && this.settings.sandbox != null) {
      return new VercelNetworkSandboxSession({
        sandbox: this.settings.sandbox,
        ownsLifecycle: false,
      });
    }

    const sandbox = await withVercelSandboxAuthenticationError({
      settings: this.settings,
      operation: () =>
        Sandbox.get({
          ...getSandboxLookupParams(this.settings),
          name: sessionSandboxName(options.sessionId),
          ...(options.abortSignal ? { signal: options.abortSignal } : {}),
        }),
    });
    return new VercelNetworkSandboxSession({ sandbox, ownsLifecycle: true });
  };
}

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
