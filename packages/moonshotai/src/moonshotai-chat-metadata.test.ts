import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { createMoonshotAI } from './moonshotai-provider';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Use get_weather.' }] },
];

function createFixtureProvider({
  generateResponse,
  streamChunks,
}: {
  generateResponse: unknown;
  streamChunks?: unknown[];
}) {
  return createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body));

      if (requestBody.stream) {
        const data = (streamChunks ?? [])
          .map(chunk => `data: ${JSON.stringify(chunk)}\n\n`)
          .join('');
        return new Response(`${data}data: [DONE]\n\n`, {
          headers: { 'content-type': 'text/event-stream' },
        });
      }

      return new Response(JSON.stringify(generateResponse), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
}

describe('MoonshotAI chat response metadata', () => {
  it('preserves generate metadata without changing content or the raw response', async () => {
    const generateResponse = {
      id: 'chatcmpl-generate',
      object: 'chat.completion',
      created: 1787762060,
      model: 'kimi-k3',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                index: 0,
                id: 'get_weather_0',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city":"Paris"}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    };
    const provider = createFixtureProvider({ generateResponse });

    const result = await provider.chatModel('kimi-k3').doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(result.providerMetadata).toEqual({
      moonshotai: {
        responseObject: 'chat.completion',
        choiceIndex: 0,
        messageRole: 'assistant',
        toolCallTypes: ['function'],
      },
    });
    expect(result.content).toContainEqual({
      type: 'tool-call',
      toolCallId: 'get_weather_0',
      toolName: 'get_weather',
      input: '{"city":"Paris"}',
    });
    expect(result.response?.body).toEqual(generateResponse);
  });

  it('accumulates stream metadata by tool-call index without changing raw chunks or content', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-stream',
        object: 'chat.completion.chunk',
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              tool_calls: [
                {
                  index: 1,
                  id: 'get_time_1',
                  type: 'function',
                  function: { name: 'get_time', arguments: '' },
                },
                {
                  index: 0,
                  id: 'get_weather_0',
                  type: 'function',
                  function: { name: 'get_weather', arguments: '' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-stream',
        object: 'chat.completion.chunk',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: '{"city":"Paris"}' },
                },
                {
                  index: 1,
                  function: { arguments: '{"zone":"UTC"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      },
    ];
    const provider = createFixtureProvider({
      generateResponse: {},
      streamChunks,
    });

    const result = await provider.chatModel('kimi-k3').doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: true,
    });
    const parts = await convertReadableStreamToArray(result.stream);

    expect(
      parts.filter(part => part.type === 'raw').map(part => part.rawValue),
    ).toEqual(streamChunks);
    expect(
      parts
        .filter(part => part.type === 'tool-call')
        .map(({ toolCallId, toolName, input }) => ({
          toolCallId,
          toolName,
          input,
        })),
    ).toEqual([
      {
        toolCallId: 'get_weather_0',
        toolName: 'get_weather',
        input: '{"city":"Paris"}',
      },
      {
        toolCallId: 'get_time_1',
        toolName: 'get_time',
        input: '{"zone":"UTC"}',
      },
    ]);
    expect(
      parts.find(part => part.type === 'finish')?.providerMetadata,
    ).toEqual({
      moonshotai: {
        responseObject: 'chat.completion.chunk',
        choiceIndex: 0,
        messageRole: 'assistant',
        toolCallTypes: ['function', 'function'],
      },
    });
  });

  it.each([null, undefined])(
    'safely omits %s generate metadata fields',
    async metadataValue => {
      const provider = createFixtureProvider({
        generateResponse: {
          id: 'chatcmpl-generate',
          object: metadataValue,
          choices: [
            {
              index: metadataValue,
              message: {
                role: metadataValue,
                content: 'Hello',
                tool_calls: metadataValue,
              },
              finish_reason: 'stop',
            },
          ],
        },
      });

      const result = await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.providerMetadata).toEqual({ moonshotai: {} });
    },
  );

  it.each([null, undefined])(
    'safely omits %s stream metadata fields',
    async metadataValue => {
      const provider = createFixtureProvider({
        generateResponse: {},
        streamChunks: [
          {
            id: 'chatcmpl-stream',
            object: metadataValue,
            choices: [
              {
                index: metadataValue,
                delta: {
                  role: metadataValue,
                  content: 'Hello',
                  tool_calls: metadataValue,
                },
                finish_reason: 'stop',
              },
            ],
          },
        ],
      });

      const result = await provider.chatModel('kimi-k3').doStream({
        prompt: TEST_PROMPT,
      });
      const parts = await convertReadableStreamToArray(result.stream);

      expect(
        parts.find(part => part.type === 'finish')?.providerMetadata,
      ).toEqual({ moonshotai: {} });
    },
  );
});
