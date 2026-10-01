import {
  type HarnessV1NetworkSandboxSession,
  type HarnessV1SandboxSessionCreateOptions,
  type HarnessV1SandboxSessionResumeOptions,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { ModalClient, type Image, type Sandbox } from 'modal';
import { ModalNetworkSandboxSession } from './modal-network-sandbox-session';
import { ModalSandboxSession } from './modal-sandbox-session';
import {
  DEFAULT_SANDBOX_APP_NAME,
  createSandboxTerminatedError,
  ensureTemplateImage,
  getEncryptedTunnelPorts,
  getRunningSandbox,
  isSandboxFinishedFailure,
  resolveSandboxImage,
  resolveSandboxWorkingDirectory,
  withDefaultSandboxSettings,
  withModalSandboxAuthenticationError,
  type ModalSandboxCreateParams,
  type Prettify,
} from './utils';

/**
 * A running `modal` `Sandbox` together with the facts the session API exposes
 * synchronously. Modal reports a sandbox's working directory and tunnels only
 * through asynchronous calls, so the native adaptation receives them
 * alongside the sandbox instead of reading them from it.
 */
export type ModalNativeSandboxSession = {
  readonly sandbox: Sandbox;

  /**
   * Absolute working directory of the sandbox: the `workdir` it was created
   * with, or the working directory of its image.
   */
  readonly workdir: string;

  /**
   * Container ports the sandbox was created with as `encryptedPorts`.
   */
  readonly encryptedPorts?: ReadonlyArray<number>;
};

type ModalCreationSettings = Omit<ModalSandboxCreateParams, 'h2Ports'> & {
  /**
   * Modal client used for every request. Defaults to a new `ModalClient`,
   * which reads `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` or the active
   * profile in `~/.modal.toml`.
   */
  client?: ModalClient;

  /**
   * Name of the Modal App that owns the sandbox. The App is created when it
   * does not exist. Defaults to `ai-sdk-sandbox`.
   */
  appName?: string;

  /**
   * Container image for the sandbox: a registry tag such as `node:24`, or a
   * Modal `Image`. Defaults to `node:24` with `pnpm` installed.
   */
  image?: Image | string;

  /**
   * Not supported: a reattached sandbox reports HTTP/2 tunnels the same way
   * as encrypted tunnels, so they would be offered to bridge-backed harness
   * adapters. Use `encryptedPorts` to expose ports.
   */
  h2Ports?: never;
};

export type ModalNetworkSandboxSessionCreateOptions = Prettify<
  HarnessV1SandboxSessionCreateOptions<ModalCreationSettings> & {
    sandbox?: never;
  }
>;

type ModalLookupSettings = {
  /**
   * Modal client used for every request. Defaults to a new `ModalClient`,
   * which reads `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` or the active
   * profile in `~/.modal.toml`.
   */
  client?: ModalClient;

  /**
   * Name of the Modal App that owns the sandbox. Defaults to
   * `ai-sdk-sandbox`.
   */
  appName?: string;
};

export type ModalNetworkSandboxSessionResumeOptions = Prettify<
  HarnessV1SandboxSessionResumeOptions<ModalLookupSettings>
>;

export async function createModalNetworkSandboxSession(
  options: ModalNetworkSandboxSessionCreateOptions = {},
): Promise<HarnessV1NetworkSandboxSession> {
  if ('sandbox' in options) {
    throw new Error(
      'createModalNetworkSandboxSession: use createModalNetworkSandboxSessionFromNativeSandbox for an existing sandbox.',
    );
  }
  if (options.h2Ports != null) {
    throw new Error(
      'createModalNetworkSandboxSession: h2Ports is not supported. Use encryptedPorts to expose ports.',
    );
  }
  const {
    template,
    abortSignal,
    sandboxId,
    sandbox: _sandbox,
    h2Ports: _h2Ports,
    client: clientOption,
    appName = DEFAULT_SANDBOX_APP_NAME,
    image: imageOption,
    name,
    ...nativeOptions
  } = options;
  abortSignal?.throwIfAborted();
  if (sandboxId != null && name != null && sandboxId !== name) {
    throw new Error(
      'createModalNetworkSandboxSession: sandboxId and name must match when both are provided.',
    );
  }
  const liveName = sandboxId ?? name;
  const createParams = withDefaultSandboxSettings(nativeOptions);
  const resolveWorkingDirectory = async (sandbox: Sandbox) =>
    createParams.workdir ?? (await resolveSandboxWorkingDirectory(sandbox));

  return withModalSandboxAuthenticationError({
    operation: async () => {
      const client = clientOption ?? new ModalClient();
      const app = await client.apps.fromName(appName, {
        createIfMissing: true,
      });
      const baseImage = resolveSandboxImage({ client, image: imageOption });
      const image =
        template == null
          ? baseImage
          : await ensureTemplateImage({
              client,
              app,
              baseImage,
              createParams,
              templateIdentity: template.identity,
              abortSignal,
              prepare: async sandbox => {
                await template.prepare({
                  session: new ModalSandboxSession(
                    sandbox,
                    await resolveWorkingDirectory(sandbox),
                  ),
                  abortSignal,
                });
              },
            });
      abortSignal?.throwIfAborted();

      const sandbox = await client.sandboxes.create(app, image, {
        ...createParams,
        ...(liveName != null ? { name: liveName } : {}),
      });
      try {
        abortSignal?.throwIfAborted();
        return new ModalNetworkSandboxSession({
          sandbox,
          id: liveName,
          workingDirectory: await resolveWorkingDirectory(sandbox),
          ports: createParams.encryptedPorts ?? [],
        });
      } catch (error) {
        await sandbox.terminate().catch(() => {});
        sandbox.detach();
        throw error;
      }
    },
  });
}

export async function resumeModalNetworkSandboxSession(
  options: ModalNetworkSandboxSessionResumeOptions,
): Promise<HarnessV1NetworkSandboxSession> {
  const {
    sandboxId,
    abortSignal,
    client: clientOption,
    appName = DEFAULT_SANDBOX_APP_NAME,
  } = options;
  abortSignal?.throwIfAborted();

  return withModalSandboxAuthenticationError({
    operation: async () => {
      const client = clientOption ?? new ModalClient();
      const sandbox = await getRunningSandbox({ client, appName, sandboxId });
      try {
        const [workingDirectory, tunnels] = await Promise.all([
          resolveSandboxWorkingDirectory(sandbox),
          sandbox.tunnels(),
        ]);
        abortSignal?.throwIfAborted();
        return new ModalNetworkSandboxSession({
          sandbox,
          id: sandboxId,
          workingDirectory,
          ports: getEncryptedTunnelPorts(tunnels),
        });
      } catch (error) {
        // The sandbox keeps running; only this process lets go of it.
        sandbox.detach();
        throw isSandboxFinishedFailure(error)
          ? createSandboxTerminatedError(sandboxId)
          : error;
      }
    },
  });
}

export function createModalSandboxSessionFromNativeSandbox(
  nativeSandbox: ModalNativeSandboxSession,
): SandboxSession {
  return new ModalSandboxSession(nativeSandbox.sandbox, nativeSandbox.workdir);
}

export function createModalNetworkSandboxSessionFromNativeSandbox(
  nativeSandbox: ModalNativeSandboxSession,
): HarnessV1NetworkSandboxSession {
  return new ModalNetworkSandboxSession({
    sandbox: nativeSandbox.sandbox,
    workingDirectory: nativeSandbox.workdir,
    ports: nativeSandbox.encryptedPorts ?? [],
  });
}
