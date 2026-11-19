import {
  type HarnessV1NetworkSandboxSession,
  type HarnessV1SandboxSessionCreateOptions,
  type HarnessV1SandboxSessionResumeOptions,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { Sandbox, type SandboxConnectOpts } from 'e2b';
import { E2BNetworkSandboxSession } from './e2b-network-sandbox-session';
import { E2BSandboxSession } from './e2b-sandbox-session';
import {
  DEFAULT_SANDBOX_TIMEOUT_MS,
  PORTS_METADATA_KEY,
  ensureTemplateSnapshot,
  normalizePorts,
  parsePortsMetadata,
  resolveSandboxWorkingDirectory,
  serializePortsMetadata,
  withDefaultSandboxSettings,
  withE2BSandboxAuthenticationError,
  type E2BSandboxCreateParams,
  type Prettify,
} from './utils';

/**
 * An `e2b` `Sandbox` together with the facts the session API exposes
 * synchronously. E2B reports a sandbox's working directory only through an
 * asynchronous call and does not record which ports a session lists, so the
 * native adaptation receives them alongside the sandbox instead of reading
 * them from it.
 */
export type E2BNativeSandboxSession = {
  readonly sandbox: Sandbox;

  /**
   * Absolute path of the directory that commands run in by default, which the
   * sandbox's template determines.
   */
  readonly defaultWorkingDirectory: string;

  /**
   * Ports that the session lists in `ports`. Bridge-backed harness adapters
   * bind the first one.
   */
  readonly ports?: ReadonlyArray<number>;
};

type E2BCreationSettings = E2BSandboxCreateParams & {
  /**
   * Name or ID of the E2B template that the sandbox starts from. Defaults to
   * E2B's `base` template. The template also determines the CPU and memory of
   * the sandbox.
   */
  baseTemplate?: string;

  /**
   * Ports that the session lists in `ports`. Bridge-backed harness adapters
   * bind the first one. E2B routes every port that a process listens on, so a
   * port does not have to be listed to be reachable.
   */
  ports?: ReadonlyArray<number>;

  /**
   * Not supported: E2B assigns the ID of a sandbox. Read it from the `id` of
   * the returned session.
   */
  sandboxId?: never;
};

export type E2BNetworkSandboxSessionCreateOptions = Prettify<
  HarnessV1SandboxSessionCreateOptions<E2BCreationSettings> & {
    sandbox?: never;
  }
>;

type E2BLookupSettings = SandboxConnectOpts;

export type E2BNetworkSandboxSessionResumeOptions = Prettify<
  HarnessV1SandboxSessionResumeOptions<E2BLookupSettings>
>;

export async function createE2BNetworkSandboxSession(
  options: E2BNetworkSandboxSessionCreateOptions = {},
): Promise<HarnessV1NetworkSandboxSession> {
  if ('sandbox' in options) {
    throw new Error(
      'createE2BNetworkSandboxSession: use createE2BNetworkSandboxSessionFromNativeSandbox for an existing sandbox.',
    );
  }
  if (options.sandboxId != null) {
    throw new Error(
      'createE2BNetworkSandboxSession: sandboxId is not supported because E2B assigns the ID of a sandbox. Read it from the `id` of the returned session.',
    );
  }
  const {
    template,
    abortSignal,
    sandboxId: _sandboxId,
    sandbox: _sandbox,
    baseTemplate,
    ports: portsOption,
    ...nativeOptions
  } = options;
  const effectiveSignal = abortSignal ?? nativeOptions.signal;
  effectiveSignal?.throwIfAborted();
  const ports = normalizePorts(portsOption);
  const createParams = withDefaultSandboxSettings({
    ...nativeOptions,
    ...(effectiveSignal ? { signal: effectiveSignal } : {}),
  });

  return withE2BSandboxAuthenticationError(async () => {
    const liveTemplate =
      template == null
        ? baseTemplate
        : await ensureTemplateSnapshot({
            templateName: await getTemplateSnapshotName({
              identity: template.identity,
              baseTemplate,
              mcp: nativeOptions.mcp != null,
            }),
            baseTemplate,
            createParams,
            onCreate: async sandbox => {
              const defaultWorkingDirectory =
                await resolveSandboxWorkingDirectory({
                  sandbox,
                  abortSignal: effectiveSignal,
                });
              await template.prepare({
                session: createE2BSandboxSessionFromNativeSandbox({
                  sandbox,
                  defaultWorkingDirectory,
                }),
                abortSignal: effectiveSignal,
              });
            },
          });
    effectiveSignal?.throwIfAborted();

    const liveParams = {
      ...createParams,
      metadata: {
        ...createParams.metadata,
        [PORTS_METADATA_KEY]: serializePortsMetadata(ports),
      },
    };
    const sandbox =
      liveTemplate == null
        ? await Sandbox.create(liveParams)
        : await Sandbox.create(liveTemplate, liveParams);
    try {
      return createE2BNetworkSandboxSessionFromNativeSandbox({
        sandbox,
        defaultWorkingDirectory: await resolveSandboxWorkingDirectory({
          sandbox,
          abortSignal: effectiveSignal,
        }),
        ports,
      });
    } catch (error) {
      await sandbox.kill().catch(() => {});
      throw error;
    }
  });
}

export async function resumeE2BNetworkSandboxSession(
  options: E2BNetworkSandboxSessionResumeOptions,
): Promise<HarnessV1NetworkSandboxSession> {
  const { sandboxId, abortSignal, signal, ...lookupOptions } = options;
  const effectiveSignal = abortSignal ?? signal;
  effectiveSignal?.throwIfAborted();

  return withE2BSandboxAuthenticationError(async () => {
    // Connecting resumes a paused sandbox and never creates one.
    const sandbox = await Sandbox.connect(sandboxId, {
      ...lookupOptions,
      timeoutMs: lookupOptions.timeoutMs ?? DEFAULT_SANDBOX_TIMEOUT_MS,
      ...(effectiveSignal ? { signal: effectiveSignal } : {}),
    });
    const [defaultWorkingDirectory, info] = await Promise.all([
      resolveSandboxWorkingDirectory({
        sandbox,
        abortSignal: effectiveSignal,
      }),
      sandbox.getInfo(effectiveSignal ? { signal: effectiveSignal } : {}),
    ]);
    return createE2BNetworkSandboxSessionFromNativeSandbox({
      sandbox,
      defaultWorkingDirectory,
      ports: parsePortsMetadata(info.metadata),
    });
  });
}

export function createE2BSandboxSessionFromNativeSandbox(
  nativeSandbox: E2BNativeSandboxSession,
): SandboxSession {
  return new E2BSandboxSession(
    nativeSandbox.sandbox,
    nativeSandbox.defaultWorkingDirectory,
  );
}

export function createE2BNetworkSandboxSessionFromNativeSandbox(
  nativeSandbox: E2BNativeSandboxSession,
): HarnessV1NetworkSandboxSession {
  return new E2BNetworkSandboxSession({
    sandbox: nativeSandbox.sandbox,
    defaultWorkingDirectory: nativeSandbox.defaultWorkingDirectory,
    ports: nativeSandbox.ports,
  });
}

/**
 * Names the snapshot of a prepared harness sandbox template after everything
 * that determines its content, so that a change to any of it yields a new
 * snapshot.
 */
async function getTemplateSnapshotName({
  identity,
  baseTemplate,
  mcp,
}: {
  identity: string;
  baseTemplate: string | undefined;
  mcp: boolean;
}): Promise<string> {
  const material = JSON.stringify([1, identity, baseTemplate ?? null, mcp]);
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material)),
  );
  return `ai-sdk-harness-v1-${Array.from(digest.slice(0, 12), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
