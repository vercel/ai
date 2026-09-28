import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HumanMessage } from '@langchain/core/messages';
import { emptyCheckpoint, MemorySaver } from '@langchain/langgraph';
import { afterEach, describe, expect, it } from 'vitest';
import { loadMemorySaver, saveMemorySaver } from './persistent-memory-saver';

const temporaryDirectories: string[] = [];

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
});
