import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
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
}

export async function saveMemorySaver({
  path,
  saver,
}: {
  path: string;
  saver: MemorySaver;
}): Promise<void> {
  const lines = [SNAPSHOT_HEADER];

  for (const [threadId, namespaces] of Object.entries(saver.storage)) {
    for (const [namespace, checkpoints] of Object.entries(namespaces)) {
      for (const [
        checkpointId,
        [checkpoint, metadata, parentCheckpointId],
      ] of Object.entries(checkpoints)) {
        lines.push(
          [
            'S',
            encodeString(threadId),
            encodeString(namespace),
            encodeString(checkpointId),
            encodeBytes(checkpoint),
            encodeBytes(metadata),
            parentCheckpointId == null ? '' : encodeString(parentCheckpointId),
          ].join('\t'),
        );
      }
    }
  }

  for (const [key, indexedWrites] of Object.entries(saver.writes)) {
    for (const [index, [taskId, channel, value]] of Object.entries(
      indexedWrites,
    )) {
      lines.push(
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

  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${lines.join('\n')}\n`, 'utf8');
  await rename(temporaryPath, path);
}

export async function removeMemorySaverSnapshot(path: string): Promise<void> {
  await rm(path, { force: true });
}
