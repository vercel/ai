import { HarnessSandboxAuthenticationError } from '@ai-sdk/harness';
import {
  AuthenticationError,
  Sandbox,
  type ConnectionOpts,
  type SandboxOpts,
} from 'e2b';

/**
 * Flattens an intersection of object types into a single object type so the
 * resolved shape displays as its named properties rather than a chain of
 * `A & B & C`.
 */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Options forwarded to the `e2b` SDK's `Sandbox.create`. Aliased directly
 * from the underlying SDK so the full surface, including its native `network`
 * and `lifecycle` configuration, is available without re-declaring it. The
 * SDK's `template` (the E2B template name) is exposed as `baseTemplate`,
 * because `template` is the harness sandbox template.
 */
export type E2BSandboxCreateParams = Omit<SandboxOpts, 'template'>;

export const E2B_PROVIDER_ID = 'e2b-sandbox';

/**
 * 30 minutes. E2B kills a sandbox 5 minutes after it is created or resumed
 * unless a timeout is passed, which is too short for multi-step workflows.
 */
export const DEFAULT_SANDBOX_TIMEOUT_MS = 30 * 60 * 1_000;

/**
 * Sandbox metadata key that records the ports a session was created with.
 * E2B routes every port without registering it, so the list would otherwise
 * be lost when another process reattaches to the sandbox.
 */
export const PORTS_METADATA_KEY = 'ai-sdk-sandbox-ports';

const MAX_PORT = 65_535;

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= MAX_PORT;
}

/**
 * Validates and de-duplicates a port list, preserving its order: bridge-backed
 * harness adapters bind the first listed port.
 */
export function normalizePorts(
  ports: ReadonlyArray<number> | undefined,
): number[] {
  const normalized: number[] = [];
  for (const port of ports ?? []) {
    if (!isValidPort(port)) {
      throw new Error(
        `Invalid sandbox port ${String(port)}. Ports must be integers between 1 and ${MAX_PORT}.`,
      );
    }
    if (!normalized.includes(port)) normalized.push(port);
  }
  return normalized;
}

export function serializePortsMetadata(ports: ReadonlyArray<number>): string {
  return ports.join(',');
}

/**
 * Reads the port list back from sandbox metadata. Metadata that was not
 * written by this package is ignored rather than trusted.
 */
export function parsePortsMetadata(
  metadata: Record<string, string> | undefined,
): number[] {
  const value = metadata?.[PORTS_METADATA_KEY];
  if (value == null || value === '') return [];
  const ports = value.split(',').map(Number);
  return ports.every(isValidPort) ? normalizePorts(ports) : [];
}

export function withDefaultSandboxSettings(
  createParams: E2BSandboxCreateParams,
): E2BSandboxCreateParams {
  return {
    ...createParams,
    timeoutMs: createParams.timeoutMs ?? DEFAULT_SANDBOX_TIMEOUT_MS,
  };
}

const E2B_SANDBOX_AUTHENTICATION_MESSAGE =
  'E2B authentication failed. Set E2B_API_KEY, or pass apiKey to createE2BNetworkSandboxSession(), then verify that the key can access E2B.';

export async function withE2BSandboxAuthenticationError<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof AuthenticationError)) throw error;
    throw new HarnessSandboxAuthenticationError({
      message: E2B_SANDBOX_AUTHENTICATION_MESSAGE,
      sandboxProviderId: E2B_PROVIDER_ID,
      cause: error,
    });
  }
}

/**
 * Reads the directory that commands run in by default, which the template
 * determines.
 */
export async function resolveSandboxWorkingDirectory({
  sandbox,
  abortSignal,
}: {
  sandbox: Sandbox;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const result = await sandbox.commands.run('pwd', {
    ...(abortSignal ? { signal: abortSignal } : {}),
  });
  const workingDirectory = result.stdout.trim();
  if (!workingDirectory.startsWith('/')) {
    throw new Error(
      `Could not resolve the working directory of E2B sandbox "${sandbox.sandboxId}".`,
    );
  }
  return workingDirectory;
}

/**
 * Returns the ID of the snapshot that holds the prepared harness sandbox
 * template, creating it when it does not exist: a sandbox is started from the
 * base template, prepared, snapshotted under `templateName`, and killed.
 */
export async function ensureTemplateSnapshot({
  templateName,
  baseTemplate,
  createParams,
  onCreate,
}: {
  templateName: string;
  baseTemplate: string | undefined;
  createParams: E2BSandboxCreateParams;
  onCreate: (sandbox: Sandbox) => Promise<void>;
}): Promise<string> {
  const { signal } = createParams;
  const existing = await findSnapshot({
    name: templateName,
    connection: getSandboxConnectionParams(createParams),
    abortSignal: signal,
  });
  if (existing != null) return existing;

  signal?.throwIfAborted();
  const sandbox =
    baseTemplate == null
      ? await Sandbox.create(createParams)
      : await Sandbox.create(baseTemplate, createParams);
  try {
    await onCreate(sandbox);
    signal?.throwIfAborted();
    const snapshot = await sandbox.createSnapshot({
      name: templateName,
      ...(signal ? { signal } : {}),
    });
    return snapshot.snapshotId;
  } finally {
    await sandbox.kill().catch(() => {});
  }
}

async function findSnapshot({
  name,
  connection,
  abortSignal,
}: {
  name: string;
  connection: E2BSandboxConnectionParams;
  abortSignal: AbortSignal | undefined;
}): Promise<string | undefined> {
  const paginator = Sandbox.listSnapshots({ ...connection, name });
  while (paginator.hasNext) {
    abortSignal?.throwIfAborted();
    const snapshots = await paginator.nextItems({
      ...connection,
      ...(abortSignal ? { signal: abortSignal } : {}),
    });
    const match = snapshots.find(snapshot =>
      snapshot.names.some(fullName => getSnapshotName(fullName) === name),
    );
    if (match != null) return match.snapshotId;
  }
  return undefined;
}

/**
 * E2B reports snapshot names with the project slug and tag, such as
 * `project-slug/my-snapshot:default`.
 */
function getSnapshotName(fullName: string): string {
  const name = fullName.slice(fullName.lastIndexOf('/') + 1);
  const tagIndex = name.indexOf(':');
  return tagIndex === -1 ? name : name.slice(0, tagIndex);
}

const CONNECTION_OPTION_KEYS = [
  'apiKey',
  'domain',
  'apiUrl',
  'sandboxUrl',
  'debug',
  'requestTimeoutMs',
  'retries',
  'logger',
  'headers',
  'apiHeaders',
  'proxy',
] as const satisfies ReadonlyArray<keyof ConnectionOpts>;

type E2BSandboxConnectionParams = Pick<
  ConnectionOpts,
  (typeof CONNECTION_OPTION_KEYS)[number]
>;

/**
 * Selects the connection settings from the creation options, so the static
 * `Sandbox` calls other than `Sandbox.create` reach the same account and API.
 */
function getSandboxConnectionParams(
  params: E2BSandboxCreateParams,
): E2BSandboxConnectionParams {
  return Object.fromEntries(
    CONNECTION_OPTION_KEYS.filter(key => params[key] != null).map(key => [
      key,
      params[key],
    ]),
  );
}
