import { HarnessSandboxAuthenticationError } from '@ai-sdk/harness';
import type { App, Image, ModalClient, Sandbox, Tunnel } from 'modal';

/**
 * Flattens an intersection of object types into a single object type so the
 * resolved shape displays as its named properties rather than a chain of
 * `A & B & C`.
 */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Parameters forwarded to the `modal` SDK's `client.sandboxes.create` when
 * creating a sandbox from scratch. Aliased directly from the underlying SDK
 * so the full surface is available without us re-declaring it.
 */
export type ModalSandboxCreateParams = NonNullable<
  Parameters<ModalClient['sandboxes']['create']>[2]
>;

export const MODAL_PROVIDER_ID = 'modal-sandbox';

/**
 * 30 minutes. The `modal` SDK defaults to 5 minutes which is too short for
 * multi-step workflows — the sandbox is terminated between steps.
 */
export const DEFAULT_SANDBOX_TIMEOUT_MS = 30 * 60 * 1_000;

/**
 * Modal sandboxes always belong to an App. Sandboxes created without an
 * explicit `appName` share this one, which is created on first use.
 */
export const DEFAULT_SANDBOX_APP_NAME = 'ai-sdk-sandbox';

export const DEFAULT_SANDBOX_IMAGE_TAG = 'node:24';

/**
 * Allowlists that admit all outbound traffic. Modal only changes the network
 * policy of a running sandbox that was created with a domain allowlist, so
 * sandboxes are created with these instead of with no allowlist at all.
 */
export const ALLOW_ALL_NETWORK_ALLOWLISTS = {
  outboundCidrAllowlist: ['0.0.0.0/0'],
  outboundDomainAllowlist: ['*'],
} as const;

/**
 * Bridge-backed harness adapters install their in-sandbox bridge with `pnpm`,
 * which the Node.js registry image does not ship. The image also has no
 * working directory of its own, so commands would run in `/`.
 */
const DEFAULT_SANDBOX_IMAGE_COMMANDS = [
  'RUN npm install --global pnpm@11',
  'WORKDIR /workspace',
];

const TEMPLATE_IMAGE_VERSION = 1;

const MODAL_SANDBOX_AUTHENTICATION_MESSAGE =
  'Modal authentication failed. Set MODAL_TOKEN_ID and MODAL_TOKEN_SECRET, configure a profile in ~/.modal.toml, or pass a configured ModalClient as `client`, then verify that the credentials can access Modal.';

export async function withModalSandboxAuthenticationError<T>({
  operation,
}: {
  operation: () => Promise<T>;
}): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isModalSandboxAuthenticationFailure(error)) {
      throw error;
    }
    throw new HarnessSandboxAuthenticationError({
      message: MODAL_SANDBOX_AUTHENTICATION_MESSAGE,
      sandboxProviderId: MODAL_PROVIDER_ID,
      cause: error,
    });
  }
}

/** gRPC status code the Modal API returns for rejected credentials. */
const GRPC_STATUS_UNAUTHENTICATED = 16;

const MODAL_AUTHENTICATION_ERROR_MESSAGE = /Profile is missing credentials/i;

function isModalSandboxAuthenticationFailure(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current != null && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (candidate.code === GRPC_STATUS_UNAUTHENTICATED) {
      return true;
    }
    if (
      typeof candidate.message === 'string' &&
      MODAL_AUTHENTICATION_ERROR_MESSAGE.test(candidate.message)
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

/**
 * Matches errors thrown by the `modal` SDK by class name. The SDK ships both
 * ES module and CommonJS builds, so an `instanceof` check fails for a native
 * sandbox that was created through the other build.
 */
export function isModalError(error: unknown, name: string): boolean {
  return (
    error != null &&
    typeof error === 'object' &&
    (error as { name?: unknown }).name === name
  );
}

export function withDefaultSandboxSettings(
  createParams: ModalSandboxCreateParams,
): ModalSandboxCreateParams {
  const hasNetworkSettings =
    createParams.blockNetwork === true ||
    createParams.outboundCidrAllowlist != null ||
    createParams.outboundDomainAllowlist != null;
  return {
    ...createParams,
    timeoutMs: createParams.timeoutMs ?? DEFAULT_SANDBOX_TIMEOUT_MS,
    ...(hasNetworkSettings
      ? {}
      : {
          outboundCidrAllowlist: [
            ...ALLOW_ALL_NETWORK_ALLOWLISTS.outboundCidrAllowlist,
          ],
          outboundDomainAllowlist: [
            ...ALLOW_ALL_NETWORK_ALLOWLISTS.outboundDomainAllowlist,
          ],
        }),
  };
}

/**
 * Whether the caller stated the outbound network access of a sandbox. Unlike
 * the creation default, `blockNetwork: false` counts: it is the explicit
 * choice of open access.
 */
export function hasExplicitNetworkSettings(
  createParams: ModalSandboxCreateParams,
): boolean {
  return (
    createParams.blockNetwork != null ||
    createParams.outboundCidrAllowlist != null ||
    createParams.outboundDomainAllowlist != null
  );
}

export function resolveSandboxImage({
  client,
  image,
}: {
  client: ModalClient;
  image: Image | string | undefined;
}): Image {
  if (image == null) {
    return client.images
      .fromRegistry(DEFAULT_SANDBOX_IMAGE_TAG)
      .dockerfileCommands(DEFAULT_SANDBOX_IMAGE_COMMANDS);
  }
  return typeof image === 'string' ? client.images.fromRegistry(image) : image;
}

/**
 * Reads the directory that commands run in when no working directory is
 * given. Modal only reports it from inside the running sandbox.
 */
export async function resolveSandboxWorkingDirectory(
  sandbox: Sandbox,
): Promise<string> {
  const process = await sandbox.exec(['pwd']);
  const [stdout, stderr, exitCode] = await Promise.all([
    process.stdout.readText(),
    process.stderr.readText(),
    process.wait(),
  ]);
  const workingDirectory = stdout.trim();
  if (exitCode !== 0 || !workingDirectory.startsWith('/')) {
    throw new Error(
      `Failed to resolve the Modal sandbox working directory (exit ${exitCode}): ${stderr || stdout}`,
    );
  }
  return workingDirectory;
}

/**
 * Container ports that Modal tunnels with TLS, in ascending order. Tunnels
 * created through `unencryptedPorts` carry an unencrypted host and are left
 * out, so every listed port resolves to a `wss://` URL.
 */
export function getEncryptedTunnelPorts(
  tunnels: Record<number, Tunnel>,
): number[] {
  return Object.entries(tunnels)
    .filter(([, tunnel]) => tunnel.unencryptedHost == null)
    .map(([port]) => Number(port))
    .sort((a, b) => a - b);
}

export function normalizePorts(ports: ReadonlyArray<number>): number[] {
  return [...new Set(ports)].sort((a, b) => a - b);
}

/**
 * Looks up the running sandbox that a session ID refers to. The ID is the
 * sandbox name when one was assigned at creation and Modal's own sandbox ID
 * otherwise, so the name lookup runs first.
 */
export async function getRunningSandbox({
  client,
  appName,
  sandboxId,
}: {
  client: ModalClient;
  appName: string;
  sandboxId: string;
}): Promise<Sandbox> {
  let sandbox: Sandbox;
  let notFoundError: unknown;
  try {
    sandbox = await client.sandboxes.fromName(appName, sandboxId);
  } catch (error) {
    if (!isModalError(error, 'NotFoundError')) throw error;
    notFoundError = error;
    sandbox = await client.sandboxes.fromId(sandboxId);
  }

  // `fromId` only builds a handle, and `fromName` can still return a sandbox
  // that has just terminated, so the sandbox is polled to prove it is running.
  let exitCode: number | null;
  try {
    exitCode = await sandbox.poll();
  } catch (error) {
    sandbox.detach();
    if (isSandboxFinishedFailure(error)) {
      throw createSandboxTerminatedError(sandboxId, error);
    }
    throw notFoundError != null && isSandboxLookupFailure(error)
      ? notFoundError
      : error;
  }
  if (exitCode != null) {
    sandbox.detach();
    throw createSandboxTerminatedError(sandboxId);
  }
  return sandbox;
}

const sandboxTerminatedErrors = new WeakSet<Error>();

export function createSandboxTerminatedError(
  sandboxId: string,
  cause?: unknown,
): Error {
  const error = new Error(
    `Modal sandbox "${sandboxId}" has terminated and cannot be resumed.`,
  );
  sandboxTerminatedErrors.add(error);
  return cause === undefined ? error : Object.assign(error, { cause });
}

/**
 * Matches the failures that mean no running sandbox has the session ID: the
 * sandbox was not found, or it has terminated. A stopped sandbox may still be
 * restored from its stop snapshot in both cases.
 */
export function isSandboxUnavailableError(error: unknown): boolean {
  return (
    isModalError(error, 'NotFoundError') ||
    (error instanceof Error && sandboxTerminatedErrors.has(error))
  );
}

const GRPC_STATUS_INVALID_ARGUMENT = 3;
const GRPC_STATUS_NOT_FOUND = 5;
export const GRPC_STATUS_FAILED_PRECONDITION = 9;

const MODAL_SANDBOX_FINISHED_MESSAGE = /has already (finished|completed)/i;

export function getErrorCode(error: unknown): unknown {
  return error != null && typeof error === 'object'
    ? (error as { code?: unknown }).code
    : undefined;
}

function isSandboxLookupFailure(error: unknown): boolean {
  if (isModalError(error, 'NotFoundError')) return true;
  if (isModalError(error, 'InvalidError')) return true;
  const code = getErrorCode(error);
  return (
    code === GRPC_STATUS_INVALID_ARGUMENT || code === GRPC_STATUS_NOT_FOUND
  );
}

/**
 * Matches the errors Modal raises for calls on a sandbox that has already
 * finished. A sandbox that has just terminated can still poll as running, so
 * these calls are where the termination first shows.
 */
export function isSandboxFinishedFailure(error: unknown): boolean {
  if (isModalError(error, 'ConflictError')) return true;
  if (getErrorCode(error) === GRPC_STATUS_FAILED_PRECONDITION) return true;
  return hasSandboxFinishedMessage(error);
}

/**
 * Matches the message of those errors. Modal uses the same status code when
 * it refuses a call on a running sandbox, so the message is what tells a
 * finished sandbox apart.
 */
export function hasSandboxFinishedMessage(error: unknown): boolean {
  const message =
    error != null && typeof error === 'object'
      ? (error as { message?: unknown }).message
      : undefined;
  return (
    typeof message === 'string' && MODAL_SANDBOX_FINISHED_MESSAGE.test(message)
  );
}

/**
 * Returns the published image that holds a prepared harness template,
 * preparing and publishing it first when it does not exist yet. The image is
 * named after the template identity and the base image, so every sandbox with
 * the same recipe starts from the same prepared filesystem.
 */
export async function ensureTemplateImage({
  client,
  app,
  baseImage,
  createParams,
  templateIdentity,
  prepare,
  abortSignal,
}: {
  client: ModalClient;
  app: App;
  baseImage: Image;
  createParams: ModalSandboxCreateParams;
  templateIdentity: string;
  prepare: (sandbox: Sandbox) => Promise<void>;
  abortSignal?: AbortSignal;
}): Promise<Image> {
  const builtBaseImage = await baseImage.build(app);
  const templateImageName = await getTemplateImageName({
    templateIdentity,
    baseImageId: builtBaseImage.imageId,
  });
  try {
    return await client.images.fromName(templateImageName);
  } catch (error) {
    if (!isModalError(error, 'NotFoundError')) throw error;
  }

  abortSignal?.throwIfAborted();
  const {
    name: _name,
    command: _command,
    encryptedPorts: _encryptedPorts,
    unencryptedPorts: _unencryptedPorts,
    readinessProbe: _readinessProbe,
    ...templateParams
  } = createParams;
  const sandbox = await client.sandboxes.create(
    app,
    builtBaseImage,
    templateParams,
  );
  try {
    await prepare(sandbox);
    abortSignal?.throwIfAborted();
    // Modal expires snapshot images after 30 days by default, which would
    // leave the published name pointing at a deleted image.
    const templateImage = await sandbox.snapshotFilesystem({ ttlMs: null });
    await templateImage.publish(templateImageName);
    return templateImage;
  } finally {
    await sandbox.terminate().catch(() => {});
    sandbox.detach();
  }
}

async function getTemplateImageName({
  templateIdentity,
  baseImageId,
}: {
  templateIdentity: string;
  baseImageId: string;
}): Promise<string> {
  const material = JSON.stringify([
    TEMPLATE_IMAGE_VERSION,
    templateIdentity,
    baseImageId,
  ]);
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material)),
  );
  return `ai-sdk-harness-${Array.from(digest.slice(0, 12), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
