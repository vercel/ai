import type { Image, ModalClient, Sandbox } from 'modal';
import { isModalError, isSandboxFinishedFailure } from './utils';

const STOP_SNAPSHOT_VERSION = 1;

/**
 * What a session needs to keep a stopped sandbox resumable. Sessions adapted
 * from a native sandbox do not have it and only terminate on `stop()`.
 */
export type ModalStopSnapshotContext = {
  readonly client: ModalClient;
  readonly appName: string;
};

/**
 * Modal cannot restart a terminated sandbox, so a stopped sandbox is kept as
 * a filesystem snapshot published under a name derived from the session ID.
 */
async function getStopSnapshotName({
  appName,
  sandboxId,
}: {
  appName: string;
  sandboxId: string;
}): Promise<string> {
  const material = JSON.stringify([STOP_SNAPSHOT_VERSION, appName, sandboxId]);
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material)),
  );
  return `ai-sdk-sandbox-stopped-${Array.from(digest.slice(0, 12), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Snapshots the filesystem of a running sandbox and publishes it as the stop
 * snapshot of the session. Returns `false` when the sandbox has already
 * finished and there is nothing left to snapshot.
 */
export async function publishStopSnapshot({
  sandbox,
  appName,
  sandboxId,
}: {
  sandbox: Sandbox;
  appName: string;
  sandboxId: string;
}): Promise<boolean> {
  let image: Image;
  try {
    image = await sandbox.snapshotFilesystem();
  } catch (error) {
    if (!isSandboxFinishedFailure(error)) throw error;
    // Modal reports other failed preconditions with the same status code, so
    // the sandbox is only treated as finished when it reports an exit code.
    if ((await sandbox.poll()) == null) throw error;
    return false;
  }
  await image.publish(await getStopSnapshotName({ appName, sandboxId }));
  return true;
}

/**
 * Returns the stop snapshot of a session, or `undefined` when there is none.
 * A published name outlives its image, so the image itself is looked up too.
 */
export async function findStopSnapshot({
  client,
  appName,
  sandboxId,
}: ModalStopSnapshotContext & {
  sandboxId: string;
}): Promise<Image | undefined> {
  try {
    const published = await client.images.fromName(
      await getStopSnapshotName({ appName, sandboxId }),
    );
    return await client.images.fromId(published.imageId);
  } catch (error) {
    if (isModalError(error, 'NotFoundError')) return undefined;
    throw error;
  }
}

export async function deleteStopSnapshot({
  client,
  appName,
  sandboxId,
}: ModalStopSnapshotContext & { sandboxId: string }): Promise<void> {
  const image = await findStopSnapshot({ client, appName, sandboxId });
  if (image == null) return;
  try {
    await client.images.delete(image.imageId);
  } catch (error) {
    if (!isModalError(error, 'NotFoundError')) throw error;
  }
}
