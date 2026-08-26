import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { createMoonshotAI } from './moonshotai-provider';

const prompt: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Use get_weather.' }] },
];

const server = createTestServer({
  'https://api.moonshot.ai/v1/chat/completions': {},
});

const provider = createMoonshotAI({ apiKey: 'test-api-key' });

function prepareLiveGenerateResponse() {
  server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
    type: 'json-value',
    body: JSON.parse(
      fs.readFileSync('src/__fixtures__/moonshotai-metadata-live.json', 'utf8'),
    ),
  };
}

function prepareLiveStreamResponse() {
  const chunks = fs
    .readFileSync(
      'src/__fixtures__/moonshotai-metadata-live.chunks.txt',
      'utf8',
    )
    .trim()
    .split('\n')
    .map(line => `data: ${line}\n\n`);
  chunks.push('data: [DONE]\n\n');

  server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
    type: 'stream-chunks',
    chunks,
  };
}

it('preserves live Moonshot metadata in generate results', async () => {
  prepareLiveGenerateResponse();

  const result = await provider.chatModel('kimi-k3').doGenerate({ prompt });

  expect(result.content).toContainEqual({
    type: 'tool-call',
    toolCallId: 'get_weather_0',
    toolName: 'get_weather',
    input: '{"city": "Paris"}',
  });
  expect(result.response?.body).toMatchObject({
    object: 'chat.completion',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          tool_calls: [{ type: 'function' }],
        },
      },
    ],
  });
  expect(result.providerMetadata).toStrictEqual({
    moonshotai: {
      responseObject: 'chat.completion',
      choiceIndex: 0,
      messageRole: 'assistant',
      toolCallTypes: ['function'],
    },
  });
});

it('preserves live Moonshot metadata in stream finish results', async () => {
  prepareLiveStreamResponse();

  const result = await provider.chatModel('kimi-k3').doStream({
    prompt,
    includeRawChunks: true,
  });
  const parts = await convertReadableStreamToArray(result.stream);

  expect(parts).toContainEqual({
    type: 'tool-call',
    toolCallId: 'get_weather_0',
    toolName: 'get_weather',
    input: '{"city": "Paris"}',
  });
  expect(parts).toContainEqual({
    type: 'raw',
    rawValue: expect.objectContaining({
      object: 'chat.completion.chunk',
      choices: [
        expect.objectContaining({
          index: 0,
          delta: expect.objectContaining({
            tool_calls: [
              expect.objectContaining({
                type: 'function',
              }),
            ],
          }),
        }),
      ],
    }),
  });
  expect(parts.at(-1)).toMatchObject({
    type: 'finish',
    providerMetadata: {
      moonshotai: {
        responseObject: 'chat.completion.chunk',
        choiceIndex: 0,
        messageRole: 'assistant',
        toolCallTypes: ['function'],
      },
    },
  });
});

it('handles missing and null metadata fields safely for generate and stream', async () => {
  server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
    type: 'json-value',
    body: {
      id: 'chatcmpl-null-metadata',
      object: null,
      created: 1787762055,
      model: 'kimi-k3',
      choices: [
        {
          index: null,
          message: {
            role: null,
            content: 'safe',
            tool_calls: [
              {
                id: 'call-null-type',
                type: null,
                function: {
                  name: 'noop',
                  arguments: '{}',
                },
              },
            ],
          },
          finish_reason: 'stop',
        },
      ],
      usage: null,
    },
  };

  const result = await provider.chatModel('kimi-k3').doGenerate({ prompt });

  expect(result.content).toContainEqual({ type: 'text', text: 'safe' });
  expect(result.content).toContainEqual({
    type: 'tool-call',
    toolCallId: 'call-null-type',
    toolName: 'noop',
    input: '{}',
  });
  expect(result.providerMetadata?.moonshotai).not.toMatchObject({
    responseObject: expect.anything(),
    choiceIndex: expect.anything(),
    messageRole: expect.anything(),
    toolCallTypes: expect.anything(),
  });

  server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
    type: 'stream-chunks',
    chunks: [
      `data: ${JSON.stringify({
        id: 'chatcmpl-null-stream-metadata',
        object: null,
        created: 1787762055,
        model: 'kimi-k3',
        choices: [
          {
            index: null,
            delta: {
              role: null,
              content: 'safe',
              tool_calls: [
                {
                  index: 0,
                  id: 'call-null-stream-type',
                  type: null,
                  function: {
                    name: 'noop',
                    arguments: '{}',
                  },
                },
              ],
            },
            finish_reason: 'stop',
          },
        ],
        usage: null,
      })}\n\n`,
      'data: [DONE]\n\n',
    ],
  };

  const streamResult = await provider.chatModel('kimi-k3').doStream({ prompt });
  const parts = await convertReadableStreamToArray(streamResult.stream);

  expect(parts.some(part => part.type === 'error')).toBe(false);
  expect(parts).toContainEqual({
    type: 'tool-call',
    toolCallId: 'call-null-stream-type',
    toolName: 'noop',
    input: '{}',
  });
  expect(
    parts.find(part => part.type === 'finish')?.providerMetadata?.moonshotai,
  ).not.toMatchObject({
    responseObject: expect.anything(),
    choiceIndex: expect.anything(),
    messageRole: expect.anything(),
    toolCallTypes: expect.anything(),
  });
});
