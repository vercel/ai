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
  'name' | 'h2Ports'
> & {
  /**
   * Modal client used for every request. Defaults to a new `ModalClient`,
   * which reads `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` or the active
   * profile in `~/.modal.toml` that `modal setup` writes. Pass your own
   * client, such as `new ModalClient({ tokenId, tokenSecret })`, to configure
   * credentials or the Modal environment in code.
   */
  client?: ModalClient;

  /**
   * Name of the Modal App that owns the sandbox. The App is created when it
   * does not exist. Defaults to `ai-sdk-sandbox`.
   */
  appName?: string;

  /**
   * Container image for the sandbox: a registry tag such as `node:24`, or a
   * Modal `Image`. Defaults to `node:24` with `pnpm` installed and
   * `/workspace` as the working directory.
   */
  image?: Image | string;

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

/**
 * Creates a Modal sandbox and returns a network sandbox session for it.
 *
 * Accepts the options of the Modal SDK's `client.sandboxes.create()`, such as
 * `timeoutMs`, `cpu`, `memoryMiB`, `env`, `secrets`, and `volumes`. Sandboxes
 * are terminated after 30 minutes unless `timeoutMs` says otherwise, and
 * outbound network access is open unless `blockNetwork` or an allowlist is
 * passed. Commands run through `bash`, so the image must provide it.
 *
 * Expose ports with `encryptedPorts`. The session lists them in `ports` in
 * ascending order, and `getPortEndpoint()` resolves each one to the URL of
 * its Modal tunnel: `https://` by default and `wss://` for `protocol: 'ws'`.
 * The URL can be dialed directly and stays the same for as long as the
 * sandbox runs. Bridge-backed harness adapters such as Claude Code and Codex
 * connect to the first listed port unless they are configured with a `port`.
 * Modal fixes a sandbox's tunnels when it is created, so the session has no
 * `setPorts()`. Ports exposed with `unencryptedPorts` are not listed.
 *
 * Modal runs sandbox processes as root, even when the image declares another
 * user. Claude Code only skips its permission prompts as root when
 * `IS_SANDBOX` is set, so pass it to the harness adapter:
 * `createClaudeCode({ env: { IS_SANDBOX: '1' } })`.
 *
 * Setting `sandboxId` names the sandbox. Creation never resumes an existing
 * sandbox and a conflicting name fails; use
 * {@link resumeModalNetworkSandboxSession} to reattach. Modal cannot restart
 * a terminated sandbox, so the session's `stop()` snapshots the sandbox
 * filesystem, publishes the snapshot as a Modal image named after the
 * session `id`, and terminates the sandbox, without keeping running
 * processes. `destroy()` terminates the sandbox and deletes its stop
 * snapshot. Creating a sandbox
 * with the `sandboxId` of a stopped one leaves the old stop snapshot in place
 * until the next `stop()` or `destroy()`.
 *
 * With a `template`, the prepared filesystem is published as a Modal image
 * named after the template, and later sandboxes start from it.
 *
 * The session's `setNetworkPolicy()` only works on a sandbox that was created
 * with an `outboundDomainAllowlist` and without `blockNetwork`, so sandboxes
 * are created with allowlists that admit everything unless `blockNetwork` or
 * an allowlist is passed. Modal admits a host only for TLS traffic on port
 * 443, rejects IPv6 ranges, and has no deny list, so a policy with
 * `deniedCIDRs` fails with a `HarnessCapabilityUnsupportedError`, as does a
 * sandbox whose policy Modal cannot change.
 *
 * The session does not implement request transformations, so bridge-backed
 * harness adapters forward model credentials into the sandbox process
 * instead of brokering them. Each harness adapter's `credentialForwarding`
 * setting controls what the sandbox receives.
 */
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
    name: _name,
    ...nativeOptions
  } = options;
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
        ...createParams,
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
        });
      } catch (error) {
        await sandbox.terminate().catch(() => {});
        sandbox.detach();
        throw error;
      }
    },
  });
}

/**
 * Reattaches to the Modal sandbox named `sandboxId` while it is running.
 * Otherwise starts a new sandbox from its stop snapshot and gives it the same
 * ID, with the working directory and the rest of the filesystem as `stop()`
 * left them. A harness session that keeps its state in the sandbox, such as
 * Claude Code or Codex, can then be resumed with
 * `createSession({ sandboxSession, sessionId, resumeFrom })`.
 *
 * Modal does not keep the configuration of a stopped sandbox, so pass the
 * creation options again, for example
 * `resumeModalNetworkSandboxSession({ sandboxId, encryptedPorts: [4000], blockNetwork: false })`.
 * They are used only when the sandbox has to be restored and are ignored when
 * reattaching to a running sandbox.
 *
 * Modal does not keep the network settings of a stopped sandbox either,
 * whether they were set at creation or with `setNetworkPolicy()`, and a
 * restore without them would open all outbound access. A restore is
 * therefore refused unless `blockNetwork`, `outboundCidrAllowlist`, or
 * `outboundDomainAllowlist` is passed. `blockNetwork: false` restores the
 * sandbox with open outbound access. Reattaching to a running sandbox needs
 * no network settings.
 *
 * Tunnel URLs stay the same for as long as a sandbox runs, including after
 * reattaching. A restored sandbox is a new Modal sandbox, so its tunnel URLs
 * are new, and without `encryptedPorts` it exposes no ports.
 *
 * Only `stop()` takes a snapshot. A sandbox that ends another way, for example
 * by reaching `timeoutMs`, cannot be restored from its last state: resuming it
 * restores the snapshot of an earlier `stop()` when there is one, and
 * otherwise fails. Modal keeps a snapshot for 30 days, after which the
 * stopped sandbox cannot be resumed. Each `stop()` publishes a new snapshot
 * image, `destroy()` deletes the current one, and earlier ones stay in the
 * Modal account until they expire.
 */
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
        abortSignal?.throwIfAborted();
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

/**
 * Adapts an existing native `Sandbox` for AI SDK tools that accept
 * `experimental_sandbox`. Modal reports a sandbox's working directory only
 * through an asynchronous call, so the adaptation takes the `workdir` that the
 * sandbox was created with.
 */
export function createModalSandboxSessionFromNativeSandbox(
  nativeSandbox: ModalNativeSandboxSession,
): SandboxSession {
  return new ModalSandboxSession(nativeSandbox.sandbox, nativeSandbox.workdir);
}

/**
 * Adapts an existing native `Sandbox` to a network sandbox session. Modal
 * reports a sandbox's working directory and tunnels only through asynchronous
 * calls, so the adaptation takes the `workdir` and `encryptedPorts` that the
 * sandbox was created with. The session does not snapshot the sandbox:
 * `stop()` and `destroy()` both terminate it.
 */
export function createModalNetworkSandboxSessionFromNativeSandbox(
  nativeSandbox: ModalNativeSandboxSession,
): HarnessV1NetworkSandboxSession {
  return new ModalNetworkSandboxSession({
    sandbox: nativeSandbox.sandbox,
    workingDirectory: nativeSandbox.workdir,
    ports: nativeSandbox.encryptedPorts ?? [],
  });
}
