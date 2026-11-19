import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { MemorySaver } from '@langchain/langgraph';

const SNAPSHOT_HEADER = 'deepagents-memory-saver-v1';

function encodeString(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function decodeString(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8');
}

function encodeBytes(value: Uint8Array): string {
  return Buffer.from(value).toString('base64');
}

function decodeBytes(value: string): Uint8Array {
  return Buffer.from(value, 'base64');
}

function getLatestCheckpointId(
  checkpoints: Record<string, unknown>,
): string | undefined {
  return Object.keys(checkpoints).sort((a, b) => b.localeCompare(a))[0];
}

function getCheckpointStorageKey({
  threadId,
  namespace,
  checkpointId,
}: {
  threadId: string;
  namespace: string;
  checkpointId: string;
}): string {
  return JSON.stringify([threadId, namespace, checkpointId]);
}

export function pruneMemorySaver({ saver }: { saver: MemorySaver }): void {
  const retainedCheckpointKeys = new Set<string>();

  for (const [threadId, namespaces] of Object.entries(saver.storage)) {
    for (const [namespace, checkpoints] of Object.entries(namespaces)) {
      const latestCheckpointId = getLatestCheckpointId(checkpoints);
      if (latestCheckpointId === undefined) {
        delete namespaces[namespace];
        continue;
      }

      for (const checkpointId of Object.keys(checkpoints)) {
        if (checkpointId !== latestCheckpointId) {
          delete checkpoints[checkpointId];
        }
      }

      const latestCheckpoint = checkpoints[latestCheckpointId];
      if (latestCheckpoint !== undefined) latestCheckpoint[2] = undefined;

      retainedCheckpointKeys.add(
        getCheckpointStorageKey({
          threadId,
          namespace,
          checkpointId: latestCheckpointId,
        }),
      );
    }

    if (Object.keys(namespaces).length === 0) delete saver.storage[threadId];
  }

  for (const key of Object.keys(saver.writes)) {
    if (!retainedCheckpointKeys.has(key)) delete saver.writes[key];
  }
}

export async function loadMemorySaver({
  path,
  saver,
}: {
  path: string;
  saver: MemorySaver;
}): Promise<void> {
  let snapshot: string;
  try {
    snapshot = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }

  const [header, ...lines] = snapshot.split('\n');
  if (header !== SNAPSHOT_HEADER) {
    throw new Error('Unsupported Deep Agents conversation checkpoint format');
  }

  const storage: MemorySaver['storage'] = Object.create(null);
  const writes: MemorySaver['writes'] = Object.create(null);

  for (const line of lines) {
    if (line === '') continue;
    const fields = line.split('\t');
    if (fields[0] === 'S' && fields.length === 7) {
      const [, threadIdValue, namespaceValue, checkpointIdValue] = fields;
      const threadId = decodeString(threadIdValue);
      const namespace = decodeString(namespaceValue);
      const checkpointId = decodeString(checkpointIdValue);
      storage[threadId] ??= Object.create(null);
      storage[threadId][namespace] ??= Object.create(null);
      storage[threadId][namespace][checkpointId] = [
        decodeBytes(fields[4]),
        decodeBytes(fields[5]),
        fields[6] === '' ? undefined : decodeString(fields[6]),
      ];
      continue;
    }
    if (fields[0] === 'W' && fields.length === 6) {
      const [, keyValue, indexValue, taskIdValue, channelValue, value] = fields;
      const key = decodeString(keyValue);
      const index = decodeString(indexValue);
      writes[key] ??= Object.create(null);
      writes[key][index] = [
        decodeString(taskIdValue),
        decodeString(channelValue),
        decodeBytes(value),
      ];
      continue;
    }
    throw new Error('Invalid Deep Agents conversation checkpoint');
  }

  saver.storage = storage;
  saver.writes = writes;
  pruneMemorySaver({ saver });
}

export async function saveMemorySaver({
  path,
  saver,
}: {
  path: string;
  saver: MemorySaver;
}): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  const retainedCheckpointKeys = new Set<string>();

  try {
    const file = await open(temporaryPath, 'w');
    try {
      const writeLine = async (line: string) => {
        await file.writeFile(`${line}\n`, 'utf8');
      };

      await writeLine(SNAPSHOT_HEADER);

      for (const [threadId, namespaces] of Object.entries(saver.storage)) {
        for (const [namespace, checkpoints] of Object.entries(namespaces)) {
          const checkpointId = getLatestCheckpointId(checkpoints);
          if (checkpointId === undefined) continue;

          retainedCheckpointKeys.add(
            getCheckpointStorageKey({ threadId, namespace, checkpointId }),
          );
          const [checkpoint, metadata] = checkpoints[checkpointId];
          await writeLine(
            [
              'S',
              encodeString(threadId),
              encodeString(namespace),
              encodeString(checkpointId),
              encodeBytes(checkpoint),
              encodeBytes(metadata),
              '',
            ].join('\t'),
          );
        }
      }

      for (const [key, indexedWrites] of Object.entries(saver.writes)) {
        if (!retainedCheckpointKeys.has(key)) continue;

        for (const [index, [taskId, channel, value]] of Object.entries(
          indexedWrites,
        )) {
          await writeLine(
            [
              'W',
              encodeString(key),
              encodeString(index),
              encodeString(taskId),
              encodeString(channel),
              encodeBytes(value),
            ].join('\t'),
          );
        }
      }
    } finally {
      await file.close();
    }

    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function removeMemorySaverSnapshot(path: string): Promise<void> {
  await rm(path, { force: true });
}
