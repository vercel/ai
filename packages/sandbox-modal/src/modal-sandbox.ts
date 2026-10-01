import {
  type HarnessV1NetworkSandboxSession,
  type HarnessV1SandboxSessionCreateOptions,
  type HarnessV1SandboxSessionResumeOptions,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { ModalClient, type Image, type Sandbox } from 'modal';
import { ModalNetworkSandboxSession } from './modal-network-sandbox-session';
import { ModalSandboxSession } from './modal-sandbox-session';
import { findStopSnapshot } from './modal-stop-snapshot';
import {
  DEFAULT_SANDBOX_APP_NAME,
  createSandboxTerminatedError,
  ensureTemplateImage,
  getEncryptedTunnelPorts,
  getRunningSandbox,
  isModalError,
  isSandboxFinishedFailure,
  isSandboxUnavailableError,
  resolveSandboxImage,
  resolveSandboxWorkingDirectory,
  withDefaultSandboxSettings,
  withModalSandboxAuthenticationError,
  type ModalSandboxCreateParams,
  type Prettify,
} from './utils';

/**
 * Modal keeps the name of a sandbox reserved for a moment after the sandbox
 * ends, so restoring a stopped sandbox under its ID retries a name conflict.
 */
const RESTORE_NAME_RETRY_COUNT = 20;
const RESTORE_NAME_RETRY_DELAY_MS = 500;

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

/**
 * Besides the lookup settings, resume accepts the native creation options.
 * Modal does not keep the configuration of a stopped sandbox, so they are
 * applied when the sandbox has to be restored from its stop snapshot and
 * ignored when it is still running.
 */
type ModalLookupSettings = Omit<
  ModalSandboxCreateParams,
  'name' | 'h2Ports'
> & {
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

  /**
   * The sandbox is looked up by `sandboxId`.
   */
  name?: never;

  /**
   * Not supported, as on creation. Use `encryptedPorts` to expose ports.
   */
  h2Ports?: never;
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
          stopSnapshot: { client, appName },
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
  if (options.h2Ports != null) {
    throw new Error(
      'resumeModalNetworkSandboxSession: h2Ports is not supported. Use encryptedPorts to expose ports.',
    );
  }
  const {
    sandboxId,
    abortSignal,
    client: clientOption,
    appName = DEFAULT_SANDBOX_APP_NAME,
    name: _name,
    h2Ports: _h2Ports,
    ...nativeOptions
  } = options;
  abortSignal?.throwIfAborted();

  return withModalSandboxAuthenticationError({
    operation: async () => {
      const client = clientOption ?? new ModalClient();
      const stopSnapshot = { client, appName };

      const reattach = async (): Promise<HarnessV1NetworkSandboxSession> => {
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
            stopSnapshot,
          });
        } catch (error) {
          // The sandbox keeps running; only this process lets go of it.
          sandbox.detach();
          throw isSandboxFinishedFailure(error)
            ? createSandboxTerminatedError(sandboxId, error)
            : error;
        }
      };

      let unavailableError: unknown;
      try {
        return await reattach();
      } catch (error) {
        if (!isSandboxUnavailableError(error)) throw error;
        unavailableError = error;
      }

      // No sandbox is running under the ID. A sandbox that was stopped left a
      // snapshot, which a new sandbox with the same ID starts from.
      const image = await findStopSnapshot({ ...stopSnapshot, sandboxId });
      if (image == null) throw unavailableError;
      abortSignal?.throwIfAborted();

      const app = await client.apps.fromName(appName, {
        createIfMissing: true,
      });
      const createParams = withDefaultSandboxSettings(nativeOptions);
      let sandbox: Sandbox;
      for (let attempt = 0; ; attempt++) {
        try {
          sandbox = await client.sandboxes.create(app, image, {
            ...createParams,
            name: sandboxId,
          });
          break;
        } catch (error) {
          if (
            !isModalError(error, 'AlreadyExistsError') ||
            attempt >= RESTORE_NAME_RETRY_COUNT
          ) {
            throw error;
          }
          // Another caller may have restored the sandbox in the meantime.
          try {
            return await reattach();
          } catch (reattachError) {
            if (!isSandboxUnavailableError(reattachError)) throw reattachError;
          }
          await new Promise<void>(resolve =>
            setTimeout(resolve, RESTORE_NAME_RETRY_DELAY_MS),
          );
        }
      }

      try {
        abortSignal?.throwIfAborted();
        return new ModalNetworkSandboxSession({
          sandbox,
          id: sandboxId,
          // Modal reports a deleted or expired snapshot on the first use of a
          // sandbox started from it, which this read is.
          workingDirectory: await resolveSandboxWorkingDirectory(sandbox),
          ports: createParams.encryptedPorts ?? [],
          stopSnapshot,
        });
      } catch (error) {
        await sandbox.terminate().catch(() => {});
        sandbox.detach();
        throw isModalError(error, 'NotFoundError')
          ? createSandboxTerminatedError(sandboxId, error)
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
