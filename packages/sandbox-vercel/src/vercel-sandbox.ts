import {
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
  getSandboxLookupParams,
  withVercelSandboxAuthenticationError,
  withDefaultSandboxSettings,
  type BaseCreateSandboxParams,
  type DistributiveOmit,
  type Prettify,
  type VercelSandboxCreateParams,
} from './utils';

export type VercelNativeSandboxSession = Sandbox;

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
  VERCEL_PROVIDER_ID,
  getSandboxLookupParams,
  hasExplicitSandboxEnvironment,
  pollForTemplateSnapshot,
  withVercelSandboxAuthenticationError,
} from './utils';
export type { BaseCreateSandboxParams } from './utils';

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
  const templateName = `ai-sdk-harness-v2-${Array.from(digest.slice(0, 12), byte => byte.toString(16).padStart(2, '0')).join('')}`;
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
