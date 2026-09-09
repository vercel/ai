import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { expect, it } from 'vitest';
import { createOpenAICompatible } from '../openai-compatible-provider';

const url = 'https://my.api.com/v1/chat/completions';
const server = createTestServer({ [url]: {} });
const model = createOpenAICompatible({
  baseURL: 'https://my.api.com/v1',
  name: 'test-provider',
})('test-model');
const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'What is 17 * 23?' }],
  },
];

it('should stream text and thinking content parts', async () => {
  server.urls[url].response = {
    type: 'stream-chunks',
    chunks: [
      `data: ${JSON.stringify({
        choices: [
          {
            index: 0,
            delta: {
              content: [
                {
                  type: 'thinking',
                  thinking: [{ type: 'text', text: 'Let me think.' }],
                },
                { type: 'text', text: 'The answer is 391.' },
              ],
            },
            finish_reason: null,
          },
        ],
      })}\n\n`,
      `data: ${JSON.stringify({
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      })}\n\n`,
      'data: [DONE]\n\n',
    ],
  };

  const { stream } = await model.doStream({ prompt });
  const events = await convertReadableStreamToArray(stream);

  expect(events.filter(event => event.type === 'error')).toEqual([]);
  expect(events.filter(event => event.type.endsWith('delta'))).toEqual([
    {
      type: 'reasoning-delta',
      id: 'reasoning-0',
      delta: 'Let me think.',
    },
    {
      type: 'text-delta',
      id: 'txt-0',
      delta: 'The answer is 391.',
    },
  ]);
});

it('should ignore unknown streamed content parts', async () => {
  server.urls[url].response = {
    type: 'stream-chunks',
    chunks: [
      `data: ${JSON.stringify({
        choices: [
          {
            index: 0,
            delta: {
              content: [
                {
                  type: 'future-part',
                  text: { nested: true },
                  thinking: { nested: true },
                },
                { type: 'text', text: 'The answer is 391.' },
              ],
            },
            finish_reason: null,
          },
        ],
      })}\n\n`,
      `data: ${JSON.stringify({
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      })}\n\n`,
      'data: [DONE]\n\n',
    ],
  };

  const { stream } = await model.doStream({ prompt });
  const events = await convertReadableStreamToArray(stream);

  expect(events.filter(event => event.type === 'error')).toEqual([]);
  expect(events.filter(event => event.type === 'text-delta')).toEqual([
    {
      type: 'text-delta',
      id: 'txt-0',
      delta: 'The answer is 391.',
    },
  ]);
});
