import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import assert from 'node:assert/strict';
import { streamObject } from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { z } from 'zod/v4';

const usage: LanguageModelV4Usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

class ReproducedBugError extends Error {}

function createModel(chunks: string[]) {
  const streamParts: LanguageModelV4StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text-1' },
    ...chunks.map(
      (delta): LanguageModelV4StreamPart => ({
        type: 'text-delta',
        id: 'text-1',
        delta,
      }),
    ),
    { type: 'text-end', id: 'text-1' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
    },
  ];

  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: streamParts,
        initialDelayInMs: null,
        chunkDelayInMs: null,
      }),
    }),
  });
}

async function readTextStream(chunks: string[]) {
  const result = streamObject({
    model: createModel(chunks),
    prompt: 'Return the requested array.',
    output: 'array',
    schema: z.string(),
  });

  let text = '';
  for await (const delta of result.textStream) {
    text += delta;
  }

  return { text, object: await result.object };
}

async function readTextStreamResponse(chunks: string[]) {
  const result = streamObject({
    model: createModel(chunks),
    prompt: 'Return the requested array.',
    output: 'array',
    schema: z.string(),
  });

  const text = await result.toTextStreamResponse().text();
  return { text, object: await result.object };
}

async function main() {
  const completeEmpty = await readTextStream(['{"elements":[]}']);
  const splitEmpty = await readTextStream(['{"elements":[', ']}']);
  const characterByCharacterEmpty = await readTextStream([
    ...'{"elements":[]}',
  ]);
  const splitEmptyResponse = await readTextStreamResponse([
    '{"elements":[',
    ']}',
  ]);
  const splitNonempty = await readTextStream([
    '{"elements":[',
    '"value"',
    ']}',
  ]);

  assert.deepEqual(completeEmpty, { text: '[]', object: [] });
  assert.deepEqual(splitEmpty.object, []);
  assert.deepEqual(characterByCharacterEmpty.object, []);
  assert.deepEqual(splitEmptyResponse.object, []);
  assert.deepEqual(splitNonempty, { text: '["value"]', object: ['value'] });

  console.log(
    JSON.stringify({
      completeEmpty,
      splitEmpty,
      characterByCharacterEmpty,
      splitEmptyResponse,
      splitNonempty,
    }),
  );

  if (splitEmpty.text !== '[]') {
    throw new ReproducedBugError(
      `ISSUE_22613_REPRODUCED: split empty-array textStream emitted invalid JSON ${JSON.stringify(splitEmpty.text)}`,
    );
  }

  if (characterByCharacterEmpty.text !== '[]') {
    throw new ReproducedBugError(
      `ISSUE_22613_REPRODUCED: character-by-character empty-array textStream emitted invalid JSON ${JSON.stringify(characterByCharacterEmpty.text)}`,
    );
  }

  if (splitEmptyResponse.text !== '[]') {
    throw new ReproducedBugError(
      `ISSUE_22613_REPRODUCED: split empty-array toTextStreamResponse emitted invalid JSON ${JSON.stringify(splitEmptyResponse.text)}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
