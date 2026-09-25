import { Sandbox } from '@vercel/sandbox';
import type { BaseCreateSandboxParams } from './vercel-sandbox';

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
