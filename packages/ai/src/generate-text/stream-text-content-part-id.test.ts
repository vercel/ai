import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { jsonSchema, tool } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { expect, it } from 'vitest';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { isStepCount } from './stop-condition';
import { streamText } from './stream-text';

const testUsage: LanguageModelV4Usage = {
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

it('preserves text-tool-text order when a provider reuses text part IDs across steps', async () => {
  let responseCount = 0;
  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => {
        let streamParts: LanguageModelV4StreamPart[];

        switch (responseCount++) {
          case 0:
            streamParts = [
              { type: 'text-start', id: 'txt-0' },
              { type: 'text-delta', id: 'txt-0', delta: 'Before tool.' },
              { type: 'text-end', id: 'txt-0' },
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
              { type: 'text-start', id: 'txt-0' },
              { type: 'text-delta', id: 'txt-0', delta: 'After tool.' },
              { type: 'text-end', id: 'txt-0' },
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
    stopWhen: isStepCount(2),
    onError: () => {},
    _internal: {
      generateId: mockId({ prefix: 'id' }),
      generateCallId: () => 'test-call-id',
    },
  });

  const chunks = await convertAsyncIterableToArray(result.fullStream);
  const uiParts: Array<
    | { type: 'text'; id: string; text: string }
    | { type: 'tool'; toolName: string }
  > = [];
  const textPartIndexes = new Map<string, number>();

  for (const chunk of chunks) {
    if (chunk.type === 'text-start') {
      textPartIndexes.set(chunk.id, uiParts.length);
      uiParts.push({ type: 'text', id: chunk.id, text: '' });
    } else if (chunk.type === 'text-delta') {
      const index = textPartIndexes.get(chunk.id);
      const part = index == null ? undefined : uiParts[index];

      if (part?.type === 'text') {
        part.text += chunk.text;
      }
    } else if (chunk.type === 'tool-call') {
      uiParts.push({ type: 'tool', toolName: chunk.toolName });
    }
  }

  expect(uiParts.map(part => part.type)).toEqual(['text', 'tool', 'text']);
  expect(
    uiParts.map(part => (part.type === 'text' ? part.text : null)),
  ).toEqual(['Before tool.', null, 'After tool.']);

  const textPartIds = uiParts.flatMap(part =>
    part.type === 'text' ? [part.id] : [],
  );
  expect(new Set(textPartIds).size).toBe(2);
});
