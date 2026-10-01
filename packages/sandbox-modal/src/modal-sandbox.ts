import {
  type HarnessV1NetworkSandboxSession,
  type HarnessV1SandboxSessionCreateOptions,
  type HarnessV1SandboxSessionResumeOptions,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { ModalClient, type Image, type Sandbox } from 'modal';
import { ModalNetworkSandboxSession } from './modal-network-sandbox-session';
import {
  assertRequestTransformationSettings,
  supportsRequestTransformations,
  withRequestTransformationSettings,
} from './modal-request-transformations';
import { ModalSandboxSession } from './modal-sandbox-session';
import { findStopSnapshot } from './modal-stop-snapshot';
import {
  DEFAULT_SANDBOX_APP_NAME,
  createSandboxTerminatedError,
  ensureTemplateImage,
  getEncryptedTunnelPorts,
  getRunningSandbox,
  hasExplicitNetworkSettings,
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

type ModalCreationSettings = Omit<
  ModalSandboxCreateParams,
  'name' | 'h2Ports' | 'experimentalOutboundPolicy'
> & {
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
   * Creates the sandbox with Modal's experimental outbound policy, so that
   * the session has `setRequestTransformations()` and
   * `addRequestTransformations()` and harness adapters broker credentials
   * instead of forwarding them into the sandbox.
   *
   * Modal applies a rule to its whole host. A rule's `path` and `headers`
   * matchers are accepted without narrowing it, so a brokered credential is
   * attached to every request the sandbox makes to that host, with or without
   * the placeholder. A rule with a `method` or `queryString` matcher, or
   * anything else Modal cannot express, is rejected.
   *
   * Modal does not restrict the outbound HTTPS traffic of such a sandbox, so
   * this cannot be combined with `blockNetwork` or an outbound allowlist.
   */
  requestTransformations?: boolean;

  /**
   * Not supported: the session owns the outbound policy of a sandbox created
   * with `requestTransformations` and would replace this one.
   */
  experimentalOutboundPolicy?: never;

  /**
   * The sandbox is named with `sandboxId`.
   */
  name?: never;

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
 * ignored when it is still running. That includes the network settings, and
 * a missing one would mean open outbound access, so a restore is refused
 * unless `blockNetwork`, `outboundCidrAllowlist`, or
 * `outboundDomainAllowlist` is passed. `blockNetwork: false` restores the
 * sandbox with open outbound access.
 */
type ModalLookupSettings = Omit<
  ModalSandboxCreateParams,
  'name' | 'h2Ports' | 'experimentalOutboundPolicy'
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
   * Restores a stopped sandbox with Modal's experimental outbound policy, as
   * on creation. A sandbox that is still running accepts request
   * transformations when it was created with this option, whether or not it
   * is passed again. Passing `true` for a running sandbox that was not
   * created with it fails, instead of returning a session that forwards
   * credentials into the sandbox.
   */
  requestTransformations?: boolean;

  /**
   * Not supported, as on creation.
   */
  experimentalOutboundPolicy?: never;

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
  if (options.experimentalOutboundPolicy != null) {
    throw new Error(
      'createModalNetworkSandboxSession: experimentalOutboundPolicy is not supported. Pass requestTransformations: true and set the rules on the session.',
    );
  }
  const {
    template,
    abortSignal,
    sandboxId,
    sandbox: _sandbox,
    h2Ports: _h2Ports,
    experimentalOutboundPolicy: _experimentalOutboundPolicy,
    requestTransformations = false,
    client: clientOption,
    appName = DEFAULT_SANDBOX_APP_NAME,
    image: imageOption,
    name: _name,
    ...nativeOptions
  } = options;
  if (requestTransformations) {
    assertRequestTransformationSettings({
      functionName: 'createModalNetworkSandboxSession',
      createParams: nativeOptions,
    });
  }
  abortSignal?.throwIfAborted();
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
        ...(requestTransformations
          ? withRequestTransformationSettings(createParams)
          : createParams),
        ...(sandboxId != null ? { name: sandboxId } : {}),
      });
      try {
        abortSignal?.throwIfAborted();
        return new ModalNetworkSandboxSession({
          sandbox,
          id: sandboxId,
          workingDirectory: await resolveWorkingDirectory(sandbox),
          ports: createParams.encryptedPorts ?? [],
          stopSnapshot: { client, appName },
          requestTransformations,
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
  if (options.experimentalOutboundPolicy != null) {
    throw new Error(
      'resumeModalNetworkSandboxSession: experimentalOutboundPolicy is not supported. Pass requestTransformations: true and set the rules on the session.',
    );
  }
  const {
    sandboxId,
    abortSignal,
    client: clientOption,
    appName = DEFAULT_SANDBOX_APP_NAME,
    name: _name,
    h2Ports: _h2Ports,
    experimentalOutboundPolicy: _experimentalOutboundPolicy,
    requestTransformations = false,
    ...nativeOptions
  } = options;
  if (requestTransformations) {
    assertRequestTransformationSettings({
      functionName: 'resumeModalNetworkSandboxSession',
      createParams: nativeOptions,
    });
  }
  abortSignal?.throwIfAborted();

  return withModalSandboxAuthenticationError({
    operation: async () => {
      const client = clientOption ?? new ModalClient();
      const stopSnapshot = { client, appName };

      const reattach = async (): Promise<HarnessV1NetworkSandboxSession> => {
        const sandbox = await getRunningSandbox({ client, appName, sandboxId });
        try {
          const [workingDirectory, tunnels, tags] = await Promise.all([
            resolveSandboxWorkingDirectory(sandbox),
            sandbox.tunnels(),
            sandbox.getTags(),
          ]);
          abortSignal?.throwIfAborted();
          const supportsTransformations = supportsRequestTransformations(tags);
          if (requestTransformations && !supportsTransformations) {
            throw new Error(
              `resumeModalNetworkSandboxSession: Modal sandbox "${sandboxId}" is running and was not created with requestTransformations: true, so it cannot broker credentials. Resume it without requestTransformations, or create a new sandbox with it.`,
            );
          }
          return new ModalNetworkSandboxSession({
            sandbox,
            id: sandboxId,
            workingDirectory,
            ports: getEncryptedTunnelPorts(tunnels),
            stopSnapshot,
            requestTransformations: supportsTransformations,
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
      if (!hasExplicitNetworkSettings(nativeOptions)) {
        throw new Error(
          `resumeModalNetworkSandboxSession: Modal sandbox "${sandboxId}" is stopped and has to be restored from its stop snapshot. Modal does not keep the network settings of a stopped sandbox, so pass blockNetwork or the outbound allowlists again, or blockNetwork: false to restore it with open outbound access.`,
        );
      }
      abortSignal?.throwIfAborted();

      const app = await client.apps.fromName(appName, {
        createIfMissing: true,
      });
      const createParams = withDefaultSandboxSettings(nativeOptions);
      let sandbox: Sandbox;
      for (let attempt = 0; ; attempt++) {
        try {
          sandbox = await client.sandboxes.create(app, image, {
            ...(requestTransformations
              ? withRequestTransformationSettings(createParams)
              : createParams),
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
          requestTransformations,
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
