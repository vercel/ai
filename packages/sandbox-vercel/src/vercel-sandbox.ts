import {
  HarnessSandboxAuthenticationError,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1SandboxSessionCreateOptions,
  type HarnessV1SandboxSessionResumeOptions,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { Sandbox } from '@vercel/sandbox';
import { VercelNetworkSandboxSession } from './vercel-network-sandbox-session';
import { VercelSandboxSession } from './vercel-sandbox-session';
import {
  createLiveSandboxFromSnapshot,
  ensureTemplateSnapshot,
  withDefaultSandboxSettings,
} from './utils';

/**
 * Flattens an intersection of object types into a single object type so the
 * resolved shape displays as its named properties rather than a chain of
 * `A & B & C`.
 */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Distributes `Omit` across each member of a union instead of collapsing the
 * union to its common keys. `Sandbox.create`'s parameter is a union (a
 * git/tarball/no-source create variant and a snapshot-source create variant),
 * so a plain `Omit` would discard keys absent from any one member (e.g.
 * `runtime`, which the snapshot variant lacks) and merge the `source` shapes.
 * Applying `Omit` per-member preserves every variant intact; the `Prettify`
 * wrapper collapses each member's intersections into a readable object shape.
 */
type DistributiveOmit<T, K extends keyof any> = T extends unknown
  ? Prettify<Omit<T, K>>
  : never;

export type VercelNativeSandboxSession = Sandbox;

/**
 * Parameters forwarded to `@vercel/sandbox`'s `Sandbox.create` when creating
 * a sandbox from scratch. Aliased directly from the underlying SDK so the
 * full surface — every option Vercel supports, including its native
 * `NetworkPolicy` — is available without us re-declaring it.
 */
type VercelSandboxCreateParams = DistributiveOmit<
  NonNullable<Parameters<typeof Sandbox.create>[0]>,
  'onResume'
>;

type VercelSandboxCreationSettings = VercelSandboxCreateParams & {
  sandbox?: never;
  name?: string;
};

type VercelCreationSettings = DistributiveOmit<
  VercelSandboxCreationSettings,
  'sandbox'
>;
export type VercelNetworkSandboxSessionCreateOptions = Prettify<
  HarnessV1SandboxSessionCreateOptions<VercelCreationSettings> & {
    sandbox?: never;
  }
>;

type VercelLookupSettings = DistributiveOmit<
  NonNullable<Parameters<typeof Sandbox.get>[0]>,
  'name' | 'resume'
> & {
  name?: never;
  resume?: never;
};

export type VercelNetworkSandboxSessionResumeOptions = Prettify<
  HarnessV1SandboxSessionResumeOptions<VercelLookupSettings>
>;

export {
  DEFAULT_SANDBOX_TIMEOUT_MS,
  DEFAULT_SANDBOX_RUNTIME,
  hasExplicitSandboxEnvironment,
  pollForTemplateSnapshot,
} from './utils';

export const VERCEL_PROVIDER_ID = 'vercel-sandbox';
export const TEMPLATE_NAME_PREFIX = 'ai-sdk-harness';

export async function createVercelNetworkSandboxSession(
  options: VercelNetworkSandboxSessionCreateOptions = {},
): Promise<HarnessV1NetworkSandboxSession> {
  if ('sandbox' in options) {
    throw new Error(
      'createVercelNetworkSandboxSession: use createVercelNetworkSandboxSessionFromNativeSandbox for an existing sandbox.',
    );
  }
  const {
    template,
    abortSignal,
    sandboxId,
    sandbox: _sandbox,
    ...nativeOptions
  } = options;
  const effectiveSignal = abortSignal ?? nativeOptions.signal;
  effectiveSignal?.throwIfAborted();
  const { name, ...creationOptions } = nativeOptions;
  if (sandboxId != null && name != null && sandboxId !== name) {
    throw new Error(
      'createVercelNetworkSandboxSession: sandboxId and name must match when both are provided.',
    );
  }
  const liveName = sandboxId ?? name;
  const baseParams = withDefaultSandboxSettings({
    ...creationOptions,
    ...(effectiveSignal ? { signal: effectiveSignal } : {}),
  } as BaseCreateSandboxParams);
  const settings = options;
  if (template == null) {
    const sandbox = await withVercelSandboxAuthenticationError({
      settings,
      operation: () =>
        Sandbox.create({
          ...baseParams,
          ...(liveName != null ? { name: liveName } : {}),
        }),
    });
    return createVercelNetworkSandboxSessionFromNativeSandbox(sandbox);
  }

  const selection =
    'source' in baseParams && baseParams.source != null
      ? baseParams.source
      : 'image' in baseParams && baseParams.image != null
        ? { image: baseParams.image }
        : { runtime: baseParams.runtime };
  const material = JSON.stringify([2, template.identity, selection]);
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material)),
  );
  const templateName = `${TEMPLATE_NAME_PREFIX}-v2-${Array.from(digest.slice(0, 12), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  const snapshotId = await withVercelSandboxAuthenticationError({
    settings,
    operation: () =>
      ensureTemplateSnapshot({
        baseParams,
        templateName,
        lookupParams: getSandboxLookupParams(baseParams),
        abortSignal: effectiveSignal,
        onCreate: async sandbox => {
          await template.prepare({
            session: createVercelSandboxSessionFromNativeSandbox(sandbox),
            abortSignal: effectiveSignal,
          });
        },
      }),
  });
  const liveSandbox = await withVercelSandboxAuthenticationError({
    settings,
    operation: () =>
      createLiveSandboxFromSnapshot({
        baseParams,
        snapshotId,
        liveName,
      }),
  });
  return createVercelNetworkSandboxSessionFromNativeSandbox(liveSandbox);
}

export async function resumeVercelNetworkSandboxSession(
  options: VercelNetworkSandboxSessionResumeOptions,
): Promise<HarnessV1NetworkSandboxSession> {
  const {
    sandboxId,
    abortSignal,
    signal,
    name: _name,
    resume: _resume,
    ...lookupOptions
  } = options;
  const effectiveSignal = abortSignal ?? signal;
  effectiveSignal?.throwIfAborted();
  const sandbox = await withVercelSandboxAuthenticationError({
    settings: options,
    operation: () =>
      Sandbox.get({
        ...lookupOptions,
        name: sandboxId,
        resume: true,
        ...(effectiveSignal ? { signal: effectiveSignal } : {}),
      }),
  });
  return createVercelNetworkSandboxSessionFromNativeSandbox(sandbox);
}

export function createVercelSandboxSessionFromNativeSandbox(
  nativeSandbox: VercelNativeSandboxSession,
): SandboxSession {
  return new VercelSandboxSession(nativeSandbox);
}

export function createVercelNetworkSandboxSessionFromNativeSandbox(
  nativeSandbox: VercelNativeSandboxSession,
): HarnessV1NetworkSandboxSession {
  return new VercelNetworkSandboxSession({
    sandbox: nativeSandbox,
    ownsLifecycle: true,
  });
}

/**
 * Base shape of `Sandbox.create` params extracted from the union (excludes
 * the `source: { type: 'snapshot' }` variant) so all create-time fields
 * are typed as present.
 */
export type BaseCreateSandboxParams = Exclude<
  VercelSandboxCreateParams,
  { source: { type: 'snapshot'; snapshotId: string } }
>;

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
