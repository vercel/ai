import { HarnessSandboxAuthenticationError } from '@ai-sdk/harness';
import { Sandbox } from '@vercel/sandbox';

/**
 * Flattens an intersection of object types into a single object type so the
 * resolved shape displays as its named properties rather than a chain of
 * `A & B & C`.
 */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Distributes `Omit` across each member of a union instead of collapsing the
 * union to its common keys. `Sandbox.create`'s parameter is a union (a
 * git/tarball/no-source create variant and a snapshot-source create variant),
 * so a plain `Omit` would discard keys absent from any one member (e.g.
 * `runtime`, which the snapshot variant lacks) and merge the `source` shapes.
 * Applying `Omit` per-member preserves every variant intact; the `Prettify`
 * wrapper collapses each member's intersections into a readable object shape.
 */
export type DistributiveOmit<T, K extends keyof any> = T extends unknown
  ? Prettify<Omit<T, K>>
  : never;

/**
 * Parameters forwarded to `@vercel/sandbox`'s `Sandbox.create` when creating
 * a sandbox from scratch. Aliased directly from the underlying SDK so the
 * full surface — every option Vercel supports, including its native
 * `NetworkPolicy` — is available without us re-declaring it.
 */
export type VercelSandboxCreateParams = DistributiveOmit<
  NonNullable<Parameters<typeof Sandbox.create>[0]>,
  'onResume'
>;

/**
 * Base shape of `Sandbox.create` params extracted from the union (excludes
 * the `source: { type: 'snapshot' }` variant) so all create-time fields
 * are typed as present.
 */
export type BaseCreateSandboxParams = Exclude<
  VercelSandboxCreateParams,
  { source: { type: 'snapshot'; snapshotId: string } }
>;

export const VERCEL_PROVIDER_ID = 'vercel-sandbox';

/**
 * 30 minutes. The `@vercel/sandbox` SDK defaults to 5 minutes which is
 * too short for multi-step workflows — the VM expires between steps.
 */
export const DEFAULT_SANDBOX_TIMEOUT_MS = 30 * 60 * 1_000;
export const DEFAULT_SANDBOX_RUNTIME = 'node24';

const SNAPSHOT_POLL_INTERVAL_MS = 500;
const SNAPSHOT_POLL_TIMEOUT_MS = 30_000;

type SandboxLookupParams = {
  fetch?: typeof fetch;
  projectId?: string;
  teamId?: string;
  token?: string;
};

type VercelSandboxAuthenticationSettings = SandboxLookupParams & {
  sandbox?: Sandbox;
};

export function getSandboxLookupParams(
  settings: VercelSandboxAuthenticationSettings,
): SandboxLookupParams {
  if ('sandbox' in settings && settings.sandbox != null) {
    return {};
  }

  const { fetch, projectId, teamId, token } = settings as SandboxLookupParams;
  return {
    ...(fetch ? { fetch } : {}),
    ...(projectId ? { projectId } : {}),
    ...(teamId ? { teamId } : {}),
    ...(token ? { token } : {}),
  };
}

const VERCEL_SANDBOX_AUTHENTICATION_MESSAGE =
  'Vercel Sandbox authentication failed. Set VERCEL_OIDC_TOKEN, or pass token, teamId, and projectId to createVercelSandbox(), then verify that they can access Vercel Sandbox.';

export async function withVercelSandboxAuthenticationError<T>({
  settings,
  operation,
}: {
  settings: VercelSandboxAuthenticationSettings;
  operation: () => Promise<T>;
}): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      !isVercelSandboxAuthenticationFailure({
        error,
        hasConfiguredCredentials: hasConfiguredCredentials(settings),
      })
    ) {
      throw error;
    }
    throw new HarnessSandboxAuthenticationError({
      message: VERCEL_SANDBOX_AUTHENTICATION_MESSAGE,
      sandboxProviderId: VERCEL_PROVIDER_ID,
      cause: error,
    });
  }
}

function hasConfiguredCredentials(
  settings: VercelSandboxAuthenticationSettings,
): boolean {
  if (process.env.VERCEL_OIDC_TOKEN) return true;
  if ('sandbox' in settings && settings.sandbox != null) return true;
  const { token, teamId, projectId } = getSandboxLookupParams(settings);
  return Boolean(token && teamId && projectId);
}

function isVercelSandboxAuthenticationFailure({
  error,
  hasConfiguredCredentials,
}: {
  error: unknown;
  hasConfiguredCredentials: boolean;
}): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current != null && !seen.has(current)) {
    seen.add(current);
    if (typeof current === 'object') {
      const candidate = current as {
        name?: unknown;
        message?: unknown;
        code?: unknown;
        cause?: unknown;
        response?: { status?: unknown; statusCode?: unknown };
      };
      if (
        candidate.response?.status === 401 ||
        candidate.response?.status === 403 ||
        candidate.response?.statusCode === 401 ||
        candidate.response?.statusCode === 403
      ) {
        return true;
      }
      if (
        typeof candidate.name === 'string' &&
        VERCEL_AUTHENTICATION_ERROR_NAMES.has(candidate.name)
      ) {
        return true;
      }
      if (
        typeof candidate.message === 'string' &&
        VERCEL_AUTHENTICATION_ERROR_MESSAGE.test(candidate.message)
      ) {
        return true;
      }
      if (
        !hasConfiguredCredentials &&
        candidate.code === 'ERR_INVALID_ARG_TYPE' &&
        typeof candidate.message === 'string' &&
        candidate.message.includes('"path" argument') &&
        candidate.message.includes('Received undefined')
      ) {
        return true;
      }
      current = candidate.cause;
      continue;
    }
    break;
  }
  return false;
}

const VERCEL_AUTHENTICATION_ERROR_NAMES = new Set([
  'AccessTokenMissingError',
  'LocalOidcContextError',
  'OAuthError',
  'RefreshAccessTokenFailedError',
  'VercelOidcContextError',
  'VercelOidcTokenError',
]);

const VERCEL_AUTHENTICATION_ERROR_MESSAGE =
  /Could not get credentials from OIDC context|No authentication found|Failed to (?:retrieve|refresh) authentication token|Missing credentials parameters to access the Vercel API|Authentication failed/i;

export function hasExplicitSandboxEnvironment(params: object): boolean {
  return (
    ('runtime' in params && params.runtime != null) ||
    ('image' in params && params.image != null) ||
    ('source' in params &&
      typeof params.source === 'object' &&
      params.source != null &&
      'type' in params.source &&
      params.source.type === 'snapshot')
  );
}

export function withDefaultSandboxSettings(
  createParams: BaseCreateSandboxParams,
): BaseCreateSandboxParams {
  return {
    ...(hasExplicitSandboxEnvironment(createParams)
      ? {}
      : { runtime: DEFAULT_SANDBOX_RUNTIME }),
    ...createParams,
    timeout: createParams.timeout ?? DEFAULT_SANDBOX_TIMEOUT_MS,
  } as BaseCreateSandboxParams;
}

export async function ensureTemplateSnapshot({
  baseParams,
  templateName,
  onCreate,
  lookupParams,
  abortSignal,
  snapshotCache,
}: {
  baseParams: BaseCreateSandboxParams;
  templateName: string;
  onCreate: (sandbox: Sandbox) => Promise<void>;
  lookupParams: SandboxLookupParams;
  abortSignal?: AbortSignal;
  snapshotCache?: Map<string, string>;
}): Promise<string> {
  const cachedSnapshotId = snapshotCache?.get(templateName);
  if (cachedSnapshotId != null) {
    return cachedSnapshotId;
  }

  const prepared = await Sandbox.getOrCreate({
    ...baseParams,
    name: templateName,
    persistent: true,
    snapshotExpiration: baseParams.snapshotExpiration ?? 0,
    onCreate,
    ...(abortSignal ? { signal: abortSignal } : {}),
  });
  let snapshotId = prepared.currentSnapshotId;
  if (snapshotId == null) {
    const stopped = await prepared.stop(
      abortSignal ? { signal: abortSignal } : undefined,
    );
    snapshotId =
      stopped.snapshot?.id ??
      (await pollForTemplateSnapshot({
        name: templateName,
        lookupParams,
        abortSignal,
      }));
  }
  snapshotCache?.set(templateName, snapshotId);
  return snapshotId;
}

export function createLiveSandboxFromSnapshot({
  baseParams,
  snapshotId,
  liveName,
  abortSignal,
}: {
  baseParams: BaseCreateSandboxParams;
  snapshotId: string;
  liveName?: string;
  abortSignal?: AbortSignal;
}): Promise<Sandbox> {
  const {
    runtime: _runtime,
    image: _image,
    source: _source,
    persistent: _persistent,
    ...forkParams
  } = baseParams;
  return Sandbox.create({
    ...forkParams,
    source: { type: 'snapshot', snapshotId },
    ...(liveName != null ? { name: liveName } : {}),
    ...(abortSignal ? { signal: abortSignal } : {}),
  });
}

export async function pollForTemplateSnapshot({
  name,
  lookupParams,
  abortSignal,
}: {
  name: string;
  lookupParams: SandboxLookupParams;
  abortSignal: AbortSignal | undefined;
}): Promise<string> {
  const deadline = Date.now() + SNAPSHOT_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    abortSignal?.throwIfAborted();
    const refreshed = await Sandbox.get({
      ...lookupParams,
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
