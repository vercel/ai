import assert from 'node:assert/strict';
import { toUIMessageStream } from '@ai-sdk/langchain';
import { AIMessageChunk } from '@langchain/core/messages';

type StreamEvent = {
  event: 'on_chat_model_start' | 'on_chat_model_stream' | 'on_chat_model_end';
  run_id: string;
  name: string;
  tags: string[];
  metadata: Record<string, never>;
  parent_ids: string[];
  data: Record<string, unknown>;
};

function start(runId: string): StreamEvent {
  return {
    event: 'on_chat_model_start',
    run_id: runId,
    name: 'mock',
    tags: [],
    metadata: {},
    parent_ids: [],
    data: { input: {} },
  };
}

function chunk(runId: string, text: string): StreamEvent {
  return {
    event: 'on_chat_model_stream',
    run_id: runId,
    name: 'mock',
    tags: [],
    metadata: {},
    parent_ids: [],
    data: {
      chunk: new AIMessageChunk({ id: runId, content: text }),
    },
  };
}

function end(runId: string): StreamEvent {
  return {
    event: 'on_chat_model_end',
    run_id: runId,
    name: 'mock',
    tags: [],
    metadata: {},
    parent_ids: [],
    data: {
      output: new AIMessageChunk({ id: runId, content: '' }),
    },
  };
}

async function collectTextParts(events: StreamEvent[]) {
  async function* eventStream() {
    yield* events;
  }

  const parts: Record<string, string> = {};
  const starts: string[] = [];

  for await (const messageChunk of toUIMessageStream(
    eventStream() as unknown as Parameters<typeof toUIMessageStream>[0],
  )) {
    if (messageChunk.type === 'text-start') {
      starts.push(messageChunk.id);
    }

    if (messageChunk.type === 'text-delta') {
      parts[messageChunk.id] =
        (parts[messageChunk.id] ?? '') + messageChunk.delta;
    }
  }

  return { parts, starts };
}

async function main() {
  const sequential = await collectTextParts([
    start('a'),
    chunk('a', 'A'),
    end('a'),
    start('b'),
    chunk('b', 'B'),
    end('b'),
  ]);

  const parallel = await collectTextParts([
    start('a'),
    start('b'),
    chunk('a', 'A'),
    chunk('b', 'B'),
    chunk('a', 'a'),
    chunk('b', 'b'),
    end('a'),
    end('b'),
  ]);

  console.log(JSON.stringify({ sequential, parallel }, null, 2));

  assert.deepEqual(sequential.parts, { a: 'A', b: 'B' });
  assert.deepEqual(
    parallel.parts,
    { a: 'Aa', b: 'Bb' },
    'Issue #22870 reproduced: parallel model runs merged into one UI text part',
  );
}

main();
