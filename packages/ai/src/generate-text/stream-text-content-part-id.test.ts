import type {
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { jsonSchema, tool } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { expect, it } from 'vitest';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { stepCountIs } from './stop-condition';
import { streamText } from './stream-text';

const testUsage: LanguageModelV3Usage = {
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

it('emits unique text part IDs across steps', async () => {
  let responseCount = 0;
  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => {
        let streamParts: LanguageModelV3StreamPart[];

        switch (responseCount++) {
          case 0:
            streamParts = [
              { type: 'text-start', id: '0' },
              { type: 'text-delta', id: '0', delta: 'Checking.' },
              { type: 'text-end', id: '0' },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'tool1',
                input: '{}',
              },
              {
                type: 'finish',
                finishReason: {
                  unified: 'tool-calls',
                  raw: 'tool-calls',
                },
                usage: testUsage,
              },
            ];
            break;
          case 1:
            streamParts = [
              { type: 'text-start', id: '0' },
              { type: 'text-delta', id: '0', delta: 'Done.' },
              { type: 'text-end', id: '0' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: testUsage,
              },
            ];
            break;
          default:
            throw new Error(`Unexpected response count: ${responseCount}`);
        }

        return {
          stream: convertArrayToReadableStream(streamParts),
        };
      },
    }),
    tools: {
      tool1: tool({
        inputSchema: jsonSchema({ type: 'object', properties: {} }),
        execute: async () => 'result1',
      }),
    },
    prompt: 'test prompt',
    stopWhen: stepCountIs(2),
    onError: () => {},
    _internal: {
      generateId: mockId({ prefix: 'id' }),
    },
  });

  const chunks = await convertAsyncIterableToArray(result.fullStream);
  const startIds = chunks
    .filter(chunk => chunk.type === 'text-start')
    .map(chunk => chunk.id);
  const endIds = chunks
    .filter(chunk => chunk.type === 'text-end')
    .map(chunk => chunk.id);
  const deltaIds = chunks
    .filter(chunk => chunk.type === 'text-delta')
    .map(chunk => chunk.id);

  expect(new Set(startIds).size).toBe(2);
  expect(deltaIds).toEqual(startIds);
  expect(endIds).toEqual(startIds);
});
