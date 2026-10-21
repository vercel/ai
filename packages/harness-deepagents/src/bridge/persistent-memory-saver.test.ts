import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HumanMessage } from '@langchain/core/messages';
import { emptyCheckpoint, MemorySaver } from '@langchain/langgraph';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadMemorySaver,
  pruneMemorySaver,
  saveMemorySaver,
} from './persistent-memory-saver';

const temporaryDirectories: string[] = [];
const SNAPSHOT_HEADER = 'deepagents-memory-saver-v1';

function encodeString(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function encodeBytes(value: Uint8Array): string {
  return Buffer.from(value).toString('base64');
}

function createImageMessage(id: string): HumanMessage {
  return new HumanMessage([
    { type: 'text', text: `Inspect image ${id}.` },
    {
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${'iVBORw=='.repeat(128)}` },
    },
  ]);
}

async function putImageCheckpoint({
  saver,
  threadId = 'bridge-session',
  namespace,
  id,
  parentId,
}: {
  saver: MemorySaver;
  threadId?: string;
  namespace: string;
  id: string;
  parentId?: string;
}) {
  const config = await saver.put(
    {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: namespace,
        ...(parentId === undefined ? {} : { checkpoint_id: parentId }),
      },
    },
    {
      ...emptyCheckpoint(),
      id,
      channel_values: { messages: [createImageMessage(id)] },
      channel_versions: { messages: id },
    },
    { source: 'loop', step: 0, parents: {} },
  );
  await saver.putWrites(
    config,
    [['result', { checkpointId: id }]],
    `task-${id}`,
  );
  return config;
}

function createLegacySnapshot(saver: MemorySaver): string {
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
            parentCheckpointId === undefined
              ? ''
              : encodeString(parentCheckpointId),
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

  return `${lines.join('\n')}\n`;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(path => rm(path, { force: true, recursive: true })),
  );
});

describe('persistent memory saver', () => {
  it('restores checkpoints and pending writes in a new saver', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'harness-deepagents-checkpoint-'),
    );
    temporaryDirectories.push(directory);
    const path = join(directory, 'conversation.checkpoint');
    const saver = new MemorySaver();
    const config = await saver.put(
      {
        configurable: {
          thread_id: 'bridge-session',
          checkpoint_ns: '',
        },
      },
      {
        ...emptyCheckpoint(),
        id: 'checkpoint-1',
        channel_values: {
          messages: [new HumanMessage('My name is Felix.')],
        },
        channel_versions: { messages: 1 },
      },
      { source: 'input', step: 0, parents: {} },
    );
    await saver.putWrites(
      config,
      [['result', { rememberedName: 'Felix' }]],
      'task-1',
    );

    await saveMemorySaver({ path, saver });

    const restoredSaver = new MemorySaver();
    await loadMemorySaver({ path, saver: restoredSaver });

    const restored = await restoredSaver.getTuple(config);
    expect(restored?.checkpoint.channel_values.messages).toEqual([
      new HumanMessage('My name is Felix.'),
    ]);
    expect(restored?.pendingWrites).toEqual([
      ['task-1', 'result', { rememberedName: 'Felix' }],
    ]);
  });

  it('keeps only the latest checkpoint and its pending writes per namespace', async () => {
    const saver = new MemorySaver();
    await putImageCheckpoint({
      saver,
      namespace: '',
      id: 'root-1',
    });
    await putImageCheckpoint({
      saver,
      namespace: '',
      id: 'root-2',
      parentId: 'root-1',
    });
    const latestRootConfig = await putImageCheckpoint({
      saver,
      namespace: '',
      id: 'root-3',
      parentId: 'root-2',
    });
    await putImageCheckpoint({
      saver,
      namespace: 'task|agent',
      id: 'child-1',
    });
    const latestChildConfig = await putImageCheckpoint({
      saver,
      namespace: 'task|agent',
      id: 'child-2',
      parentId: 'child-1',
    });
    await putImageCheckpoint({
      saver,
      threadId: 'other-session',
      namespace: '',
      id: 'other-1',
    });
    const latestOtherThreadConfig = await putImageCheckpoint({
      saver,
      threadId: 'other-session',
      namespace: '',
      id: 'other-2',
      parentId: 'other-1',
    });

    pruneMemorySaver({ saver });

    expect(
      Object.keys(saver.storage['bridge-session']?.[''] ?? {}).sort(),
    ).toEqual(['root-3']);
    expect(
      Object.keys(saver.storage['bridge-session']?.['task|agent'] ?? {}).sort(),
    ).toEqual(['child-2']);
    expect(
      Object.keys(saver.storage['other-session']?.[''] ?? {}).sort(),
    ).toEqual(['other-2']);
    expect(Object.keys(saver.writes).sort()).toEqual(
      [
        JSON.stringify(['bridge-session', '', 'root-3']),
        JSON.stringify(['bridge-session', 'task|agent', 'child-2']),
        JSON.stringify(['other-session', '', 'other-2']),
      ].sort(),
    );

    const latestRoot = await saver.getTuple(latestRootConfig);
    expect(latestRoot?.parentConfig).toBeUndefined();
    expect(latestRoot?.pendingWrites).toEqual([
      ['task-root-3', 'result', { checkpointId: 'root-3' }],
    ]);
    expect((await saver.getTuple(latestChildConfig))?.pendingWrites).toEqual([
      ['task-child-2', 'result', { checkpointId: 'child-2' }],
    ]);
    expect(
      (await saver.getTuple(latestOtherThreadConfig))?.pendingWrites,
    ).toEqual([['task-other-2', 'result', { checkpointId: 'other-2' }]]);
  });

  it('loads legacy snapshots, prunes history, and saves a compact snapshot', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'harness-deepagents-checkpoint-'),
    );
    temporaryDirectories.push(directory);
    const path = join(directory, 'conversation.checkpoint');
    const legacySaver = new MemorySaver();
    await putImageCheckpoint({
      saver: legacySaver,
      namespace: '',
      id: 'checkpoint-1',
    });
    await putImageCheckpoint({
      saver: legacySaver,
      namespace: '',
      id: 'checkpoint-2',
      parentId: 'checkpoint-1',
    });
    const latestConfig = await putImageCheckpoint({
      saver: legacySaver,
      namespace: '',
      id: 'checkpoint-3',
      parentId: 'checkpoint-2',
    });
    await writeFile(path, createLegacySnapshot(legacySaver), 'utf8');

    const restoredSaver = new MemorySaver();
    await loadMemorySaver({ path, saver: restoredSaver });

    expect(
      Object.keys(restoredSaver.storage['bridge-session']?.[''] ?? {}),
    ).toEqual(['checkpoint-3']);
    const restored = await restoredSaver.getTuple(latestConfig);
    expect(restored?.parentConfig).toBeUndefined();
    expect(restored?.checkpoint.channel_values.messages).toEqual([
      createImageMessage('checkpoint-3'),
    ]);
    expect(restored?.pendingWrites).toEqual([
      ['task-checkpoint-3', 'result', { checkpointId: 'checkpoint-3' }],
    ]);

    await saveMemorySaver({ path, saver: legacySaver });
    const snapshot = await readFile(path, 'utf8');
    expect(
      snapshot.split('\n').filter(line => line.startsWith('S\t')),
    ).toHaveLength(1);
    expect(
      snapshot.split('\n').filter(line => line.startsWith('W\t')),
    ).toHaveLength(1);

    const compactedSaver = new MemorySaver();
    await loadMemorySaver({ path, saver: compactedSaver });
    expect(
      (await compactedSaver.getTuple(latestConfig))?.pendingWrites,
    ).toEqual([
      ['task-checkpoint-3', 'result', { checkpointId: 'checkpoint-3' }],
    ]);
  });
});
