import { APICallError, type LanguageModelV2Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  MoonshotAIAssistantMessageProviderOptions,
  MoonshotAIMessageProviderOptions,
  MoonshotAISystemMessageProviderOptions,
} from './moonshotai-chat-options';
import { createMoonshotAI } from './moonshotai-provider';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createMoonshotAI({
  apiKey: 'test-api-key',
});

const server = createTestServer({
  'https://api.moonshot.ai/v1/chat/completions': {},
});

function readJsonFixture(filename: string) {
  return JSON.parse(
    fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
  );
}

function prepareJsonResponse() {
  server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
    type: 'json-value',
    body: {
      id: 'chatcmpl-sampling',
      object: 'chat.completion',
      created: 1785880000,
      model: 'kimi-k3',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
    },
  };
}

function prepareChunksFixtureResponse(filename: string) {
  const chunks = fs
    .readFileSync(`src/__fixtures__/${filename}.chunks.txt`, 'utf8')
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => `data: ${line}\n\n`);
  chunks.push('data: [DONE]\n\n');

  server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
    type: 'stream-chunks',
    chunks,
  };
}

async function getStreamParts(filename: string) {
  prepareChunksFixtureResponse(filename);

  const result = await provider.chatModel('kimi-k2.5').doStream({
    prompt: TEST_PROMPT,
  });

  return convertReadableStreamToArray(result.stream);
}

describe('MoonshotAIChatLanguageModel', () => {
  describe('doGenerate', () => {
    beforeEach(() => {
      prepareJsonResponse();
    });

    it('should send message names', async () => {
      await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: [
          {
            role: 'system',
            content: 'You are a helpful assistant.',
            providerOptions: {
              moonshotai: {
                name: 'guide',
              } satisfies MoonshotAIMessageProviderOptions,
            },
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            providerOptions: {
              moonshotai: {
                name: 'alice',
              } satisfies MoonshotAIMessageProviderOptions,
            },
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello, Alice.' }],
            providerOptions: {
              moonshotai: {
                name: 'assistant',
              } satisfies MoonshotAIMessageProviderOptions,
            },
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant.',
            name: 'guide',
          },
          { role: 'user', content: 'Hello', name: 'alice' },
          {
            role: 'assistant',
            content: 'Hello, Alice.',
            name: 'assistant',
          },
        ],
      });
    });

    it('should send a name on a multi-part user message', async () => {
      await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image.' },
              {
                type: 'file',
                data: new URL('https://example.com/image.jpg'),
                mediaType: 'image/jpeg',
              },
            ],
            providerOptions: {
              moonshotai: {
                name: 'alice',
              } satisfies MoonshotAIMessageProviderOptions,
            },
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        messages: [{ role: 'user', name: 'alice' }],
      });
    });

    it('should omit a name on a tool message with a warning', async () => {
      const result = await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'weather',
                output: { type: 'text', value: 'sunny' },
              },
            ],
            providerOptions: {
              moonshotai: {
                name: 'weather_tool',
              } satisfies MoonshotAIMessageProviderOptions,
            },
          },
        ],
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).toMatchObject({
        messages: [
          {
            role: 'tool',
            tool_call_id: 'call-1',
            content: 'sunny',
          },
        ],
      });
      expect(requestBody.messages[0]).not.toHaveProperty('name');
      expect(result.warnings).toContainEqual({
        type: 'other',
        message:
          'Moonshot AI does not support message names on tool messages. The name has been omitted.',
      });
    });

    it('should reject a non-string message name', async () => {
      await expect(
        provider.chatModel('moonshot-v1-8k').doGenerate({
          prompt: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
              providerOptions: { moonshotai: { name: 123 } },
            },
          ],
        }),
      ).rejects.toThrow('invalid moonshotai provider options');
    });

    it('should send partial true on the final assistant message', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Continue this prefix.' }],
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'The sky is' }],
            providerOptions: {
              moonshotai: {
                name: 'writer',
                partial: true,
              } satisfies MoonshotAIAssistantMessageProviderOptions,
            },
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        messages: [
          { role: 'user', content: 'Continue this prefix.' },
          {
            role: 'assistant',
            content: 'The sky is',
            name: 'writer',
            partial: true,
          },
        ],
      });
    });

    it('should reject partial true on a non-assistant message', async () => {
      await expect(
        provider.chatModel('kimi-k3').doGenerate({
          prompt: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
              providerOptions: { moonshotai: { partial: true } },
            },
          ],
        }),
      ).rejects.toThrow(
        'Moonshot AI Partial Mode requires `partial: true` on an assistant message.',
      );

      expect(server.calls).toHaveLength(0);
    });

    it('should reject a partial assistant message that is not final', async () => {
      await expect(
        provider.chatModel('kimi-k3').doGenerate({
          prompt: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'The sky is' }],
              providerOptions: { moonshotai: { partial: true } },
            },
            {
              role: 'user',
              content: [{ type: 'text', text: 'Continue.' }],
            },
          ],
        }),
      ).rejects.toThrow(
        'Moonshot AI Partial Mode requires the partial assistant message to be the final message.',
      );

      expect(server.calls).toHaveLength(0);
    });

    it('should reject Partial Mode with JSON object response format before the API call', async () => {
      await expect(
        provider.chatModel('kimi-k3').doGenerate({
          prompt: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: '{' }],
              providerOptions: {
                moonshotai: {
                  partial: true,
                } satisfies MoonshotAIAssistantMessageProviderOptions,
              },
            },
          ],
          responseFormat: { type: 'json' },
        }),
      ).rejects.toThrow(
        'Moonshot AI Partial Mode cannot be combined with JSON object response format.',
      );

      expect(server.calls).toHaveLength(0);
    });

    it('should allow Partial Mode with JSON schema response format', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: '{' }],
            providerOptions: {
              moonshotai: {
                partial: true,
              } satisfies MoonshotAIAssistantMessageProviderOptions,
            },
          },
        ],
        responseFormat: {
          type: 'json',
          name: 'result',
          schema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.messages[0]).toMatchObject({ partial: true });
      expect(requestBody.response_format).toMatchObject({
        type: 'json_schema',
      });
    });

    it('should send normalized dynamic tools in a K3 system message', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'Calculate.' }] },
          {
            role: 'system',
            content: '',
            providerOptions: {
              moonshotai: {
                tools: [
                  {
                    type: 'function',
                    name: 'calculator',
                    description: 'Evaluate an expression',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        values: {
                          type: 'array',
                          items: [{ type: 'number' }, { type: 'number' }],
                        },
                      },
                    },
                    strict: true,
                  },
                ],
              } satisfies MoonshotAISystemMessageProviderOptions,
            },
          },
        ],
      });

      expect((await server.calls[0].requestBodyJson).messages.at(-1)).toEqual({
        role: 'system',
        tools: [
          {
            type: 'function',
            function: {
              name: 'calculator',
              description: 'Evaluate an expression',
              parameters: {
                type: 'object',
                properties: {
                  values: {
                    type: 'array',
                    prefixItems: [{ type: 'number' }, { type: 'number' }],
                  },
                },
              },
              strict: true,
            },
          },
        ],
      });
    });

    it('should omit dynamic messages and warn for non-K3 official models', async () => {
      const result = await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: [
          {
            role: 'system',
            content: '',
            providerOptions: {
              moonshotai: {
                tools: [
                  {
                    type: 'function',
                    name: 'calculator',
                    inputSchema: { type: 'object', properties: {} },
                  },
                ],
              },
            },
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        messages: [],
      });
      expect(result.warnings).toContainEqual({
        type: 'other',
        message:
          'Moonshot documents dynamic tool loading only for Kimi K3. The dynamic system message has been omitted for model "kimi-k2.6".',
      });
    });

    it('should preserve dynamic messages for unknown custom models', async () => {
      await provider.chatModel('custom-model').doGenerate({
        prompt: [
          {
            role: 'system',
            content: '',
            providerOptions: {
              moonshotai: {
                tools: [
                  {
                    type: 'function',
                    name: 'calculator',
                    inputSchema: { type: 'object', properties: {} },
                  },
                ],
              },
            },
          },
        ],
      });

      expect((await server.calls[0].requestBodyJson).messages[0]).toMatchObject(
        {
          role: 'system',
          tools: [{ function: { name: 'calculator' } }],
        },
      );
    });

    it('should preserve an ordinary system message when tools is empty', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: [
          {
            role: 'system',
            content: 'You are Kimi.',
            providerOptions: { moonshotai: { tools: [] } },
          },
        ],
      });

      expect((await server.calls[0].requestBodyJson).messages).toEqual([
        { role: 'system', content: 'You are Kimi.' },
      ]);
    });

    it('should reject incomplete dynamic tool definitions', async () => {
      await expect(
        provider.chatModel('kimi-k3').doGenerate({
          prompt: [
            {
              role: 'system',
              content: '',
              providerOptions: {
                moonshotai: {
                  tools: [
                    {
                      type: 'function',
                      name: 'calculator',
                      inputSchema: null,
                    },
                  ],
                },
              },
            },
          ],
        }),
      ).rejects.toThrow('invalid moonshotai provider options');
      expect(server.calls).toHaveLength(0);
    });

    it('should reject content alongside dynamic tools', async () => {
      await expect(
        provider.chatModel('kimi-k3').doGenerate({
          prompt: [
            {
              role: 'system',
              content: 'Do not send this.',
              providerOptions: {
                moonshotai: {
                  tools: [
                    {
                      type: 'function',
                      name: 'calculator',
                      inputSchema: { type: 'object', properties: {} },
                    },
                  ],
                },
              },
            },
          ],
        }),
      ).rejects.toThrow(
        'A Moonshot dynamic-tool system message must use empty content because the API forbids content alongside tools.',
      );
      expect(server.calls).toHaveLength(0);
    });

    it('should reject dynamic tools on non-system messages', async () => {
      await expect(
        provider.chatModel('kimi-k3').doGenerate({
          prompt: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Hello' }],
              providerOptions: {
                moonshotai: {
                  tools: [
                    {
                      type: 'function',
                      name: 'calculator',
                      inputSchema: { type: 'object', properties: {} },
                    },
                  ],
                },
              },
            },
          ],
        }),
      ).rejects.toThrow(
        'Moonshot dynamic tools must be configured on a system message.',
      );
      expect(server.calls).toHaveLength(0);
    });

    it('should send maxOutputTokens as max_completion_tokens', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        maxOutputTokens: 17,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.max_completion_tokens).toBe(17);
      expect(requestBody).not.toHaveProperty('max_tokens');
    });

    it('should omit max_completion_tokens when maxOutputTokens is undefined', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('max_completion_tokens');
      expect(requestBody).not.toHaveProperty('max_tokens');
    });

    it.each([
      'kimi-k2.5',
      'kimi-k2.6',
      'kimi-k2.7-code',
      'kimi-k2.7-code-highspeed',
      'kimi-k3',
    ] as const)(
      'should omit fixed sampling options and warn for %s',
      async modelId => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          temperature: 0.2,
          topP: 0.4,
          frequencyPenalty: 0.5,
          presencePenalty: 0.6,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: modelId,
          messages: [{ role: 'user', content: 'Hello' }],
        });
        expect(result.warnings).toStrictEqual([
          {
            type: 'unsupported-setting',
            setting: 'temperature',
            details: `temperature is fixed by model "${modelId}" and has been omitted.`,
          },
          {
            type: 'unsupported-setting',
            setting: 'topP',
            details: `topP is fixed by model "${modelId}" and has been omitted.`,
          },
          {
            type: 'unsupported-setting',
            setting: 'frequencyPenalty',
            details: `frequencyPenalty is fixed by model "${modelId}" and has been omitted.`,
          },
          {
            type: 'unsupported-setting',
            setting: 'presencePenalty',
            details: `presencePenalty is fixed by model "${modelId}" and has been omitted.`,
          },
        ]);
      },
    );

    it.each(['moonshot-v1-8k', 'custom-model'] as const)(
      'should preserve sampling options for %s',
      async modelId => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          temperature: 0.2,
          topP: 0.4,
          frequencyPenalty: 0.5,
          presencePenalty: 0.6,
        });

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          model: modelId,
          temperature: 0.2,
          top_p: 0.4,
          frequency_penalty: 0.5,
          presence_penalty: 0.6,
        });
        expect(result.warnings).toStrictEqual([]);
      },
    );

    it.each([
      'kimi-k2.6',
      'kimi-k2.7-code',
      'kimi-k2.7-code-highspeed',
    ] as const)(
      'should omit required tool choice and warn for %s',
      async modelId => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'get_weather',
              description: 'Get the weather',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
          toolChoice: { type: 'required' },
        });

        expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
          'tool_choice',
        );
        expect(result.warnings).toStrictEqual([
          {
            type: 'unsupported-setting',
            setting: 'toolChoice',
            details: `toolChoice "required" is not supported by model "${modelId}" and has been omitted; use "auto" or select a specific tool instead.`,
          },
        ]);
      },
    );

    it.each(['kimi-k3', 'custom-model'] as const)(
      'should preserve required tool choice for %s',
      async modelId => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'get_weather',
              description: 'Get the weather',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
          toolChoice: { type: 'required' },
        });

        expect((await server.calls[0].requestBodyJson).tool_choice).toBe(
          'required',
        );
        expect(result.warnings).toStrictEqual([]);
      },
    );

    it('should preserve non-required tool choices for unsupported models', async () => {
      const result = await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Get the weather',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        toolChoice: { type: 'auto' },
      });

      expect((await server.calls[0].requestBodyJson).tool_choice).toBe('auto');
      expect(result.warnings).toStrictEqual([]);
    });

    it('should omit unsupported budget tokens and warn', async () => {
      const result = await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            thinking: { type: 'enabled', budgetTokens: 2048 },
          },
        },
      });

      expect((await server.calls[0].requestBodyJson).thinking).toStrictEqual({
        type: 'enabled',
      });
      expect(result.warnings).toStrictEqual([
        {
          type: 'other',
          message:
            'providerOptions.moonshotai.thinking.budgetTokens is deprecated because Moonshot Chat Completions does not support budget_tokens. The option has been omitted.',
        },
      ]);
    });

    it('should map K2.6 preserved reasoning to thinking.keep', async () => {
      await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            thinking: { type: 'enabled' },
            reasoningHistory: 'preserved',
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.thinking).toStrictEqual({
        type: 'enabled',
        keep: 'all',
      });
      expect(requestBody).not.toHaveProperty('reasoningHistory');
      expect(requestBody).not.toHaveProperty('reasoning_history');
    });

    it('should not send other reasoning history modes', async () => {
      await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { reasoningHistory: 'interleaved' },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('reasoningHistory');
      expect(requestBody).not.toHaveProperty('reasoning_history');
      expect(requestBody).not.toHaveProperty('thinking');
    });

    it('should pass K3 reasoning effort through', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { reasoningEffort: 'low' },
        },
      });

      expect((await server.calls[0].requestBodyJson).reasoning_effort).toBe(
        'low',
      );
    });

    it('should omit thinking for Kimi K3', async () => {
      const result = await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            thinking: { type: 'disabled' },
            reasoningHistory: 'preserved',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'thinking',
      );
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details:
            'Kimi K3 always reasons and does not accept providerOptions.moonshotai.thinking. The option has been omitted.',
        },
      ]);
    });

    it.each(['kimi-k2.7-code', 'kimi-k2.7-code-highspeed'] as const)(
      'should not disable thinking for %s',
      async modelId => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            moonshotai: { thinking: { type: 'disabled' } },
          },
        });

        expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
          'thinking',
        );
        expect(result.warnings).toStrictEqual([
          {
            type: 'unsupported-setting',
            setting: 'providerOptions',
            details:
              'Kimi K2.7 thinking cannot be disabled. providerOptions.moonshotai.thinking has been omitted.',
          },
        ]);
      },
    );

    it('should rely on K2.7 preserved-thinking defaults', async () => {
      const result = await provider.chatModel('kimi-k2.7-code').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { reasoningHistory: 'preserved' },
        },
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'thinking',
      );
      expect(result.warnings).toStrictEqual([]);
    });

    it('should omit reasoning effort for K2 models and warn', async () => {
      const result = await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { reasoningEffort: 'high' },
        },
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'reasoning_effort',
      );
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details:
            'providerOptions.moonshotai.reasoningEffort is only supported by Kimi K3 and has been omitted for model "kimi-k2.6".',
        },
      ]);
    });

    it('should omit thinking and reasoning options for Moonshot V1', async () => {
      const result = await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            reasoningEffort: 'high',
            thinking: { type: 'enabled' },
            reasoningHistory: 'preserved',
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('reasoning_effort');
      expect(requestBody).not.toHaveProperty('thinking');
      expect(requestBody).not.toHaveProperty('reasoningHistory');
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details:
            'providerOptions.moonshotai.reasoningEffort is only supported by Kimi K3 and has been omitted for model "moonshot-v1-8k".',
        },
        {
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details:
            'providerOptions.moonshotai.thinking is not supported by model "moonshot-v1-8k" and has been omitted.',
        },
        {
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details:
            'providerOptions.moonshotai.reasoningHistory \'preserved\' is not supported by model "moonshot-v1-8k" and has been omitted.',
        },
      ]);
    });

    it('should omit preserved reasoning for K2.5 and warn', async () => {
      const result = await provider.chatModel('kimi-k2.5').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { reasoningHistory: 'preserved' },
        },
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'thinking',
      );
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details:
            'providerOptions.moonshotai.reasoningHistory \'preserved\' is not supported by model "kimi-k2.5" and has been omitted.',
        },
      ]);
    });

    describe('structured outputs', () => {
      it('should normalize schemas and enable strict validation by default', async () => {
        await provider.chatModel('kimi-k3').doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
            name: 'named_pair',
            schema: {
              $schema: 'http://json-schema.org/draft-07/schema#',
              type: 'object',
              properties: {
                pair: {
                  type: 'array',
                  items: [{ type: 'string' }, { type: 'number' }],
                },
              },
            },
          },
        });

        expect(
          (await server.calls[0].requestBodyJson).response_format,
        ).toStrictEqual({
          type: 'json_schema',
          json_schema: {
            name: 'named_pair',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                pair: {
                  type: 'array',
                  prefixItems: [{ type: 'string' }, { type: 'number' }],
                },
              },
            },
          },
        });
      });

      it('should allow strict validation to be disabled without leaking the provider option', async () => {
        await provider.chatModel('kimi-k3').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            moonshotai: { strictJsonSchema: false },
          },
          responseFormat: {
            type: 'json',
            schema: { type: 'object', properties: {} },
          },
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody).not.toHaveProperty('strictJsonSchema');
        expect(requestBody.response_format.json_schema.strict).toBe(false);
      });

      it('should fall back to json_object without a schema', async () => {
        await provider.chatModel('kimi-k3').doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: { type: 'json' },
        });

        expect(
          (await server.calls[0].requestBodyJson).response_format,
        ).toStrictEqual({ type: 'json_object' });
      });

      it.each([
        'moonshot-v1-8k',
        'moonshot-v1-32k',
        'moonshot-v1-128k',
        'moonshot-v1-auto',
        'moonshot-v1-8k-vision-preview',
        'moonshot-v1-32k-vision-preview',
        'moonshot-v1-128k-vision-preview',
      ])('should use json_schema for %s', async modelId => {
        await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
            name: 'response',
            schema: { type: 'object', properties: {} },
          },
        });

        expect(
          (await server.calls[0].requestBodyJson).response_format,
        ).toStrictEqual({
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
            schema: { type: 'object', properties: {} },
          },
        });
      });

      it('should fall back to json_object for unknown models', async () => {
        await provider.chatModel('custom-model').doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
            schema: { type: 'object', properties: {} },
          },
        });

        expect(
          (await server.calls[0].requestBodyJson).response_format,
        ).toStrictEqual({ type: 'json_object' });
      });
    });

    it('should send logprobs options and expose response logprobs', async () => {
      server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
        type: 'json-value',
        body: JSON.parse(
          fs.readFileSync('src/__fixtures__/moonshotai-logprobs.json', 'utf8'),
        ),
      };

      const result = await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            logprobs: true,
            topLogprobs: 1,
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        logprobs: true,
        top_logprobs: 1,
      });
      expect(result.providerMetadata?.moonshotai.logprobs).toEqual({
        content: [
          {
            token: 'OK',
            logprob: -0.0004808938247151673,
            bytes: [79, 75],
            top_logprobs: [
              {
                token: 'OK',
                logprob: -0.0004808938247151673,
                bytes: [79, 75],
              },
            ],
          },
          {
            token: '!',
            logprob: -0.01,
            bytes: null,
            top_logprobs: [
              {
                token: '!',
                logprob: -0.01,
                bytes: null,
              },
            ],
          },
        ],
      });
    });

    it('should enable logprobs when topLogprobs is set', async () => {
      await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { topLogprobs: 0 },
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        logprobs: true,
        top_logprobs: 0,
      });
    });

    it('should validate topLogprobs at runtime', async () => {
      await expect(
        provider.chatModel('moonshot-v1-8k').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            moonshotai: { topLogprobs: 21 },
          },
        }),
      ).rejects.toThrow('invalid moonshotai provider options');
    });

    it('should preserve the moonshot error envelope', async () => {
      const data = readJsonFixture('moonshotai-error');

      server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify(data),
      };

      const error = await Promise.resolve(
        provider.chatModel('kimi-k3').doGenerate({ prompt: TEST_PROMPT }),
      ).catch((error: unknown) => error);

      expect(APICallError.isInstance(error)).toBe(true);
      if (!APICallError.isInstance(error)) {
        expect.fail('Expected an APICallError');
      }
      expect(error.message).toBe(data.error.message);
      expect(error.data).toStrictEqual(data);
    });

    it.each([
      {
        name: 'nullable code',
        data: {
          error: {
            message: 'Invalid request with nullable code',
            type: 'invalid_request_error',
            code: null,
          },
        },
      },
      {
        name: 'message-only error',
        data: {
          error: {
            message: 'Invalid request',
          },
        },
      },
    ])('should preserve a $name envelope', async ({ data }) => {
      server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify(data),
      };

      const error = await Promise.resolve(
        provider.chatModel('kimi-k3').doGenerate({ prompt: TEST_PROMPT }),
      ).catch((error: unknown) => error);

      expect(APICallError.isInstance(error)).toBe(true);
      if (!APICallError.isInstance(error)) {
        expect.fail('Expected an APICallError');
      }
      expect(error.message).toBe(data.error.message);
      expect(error.data).toStrictEqual(data);
    });
  });

  describe('doStream', () => {
    it('should preserve a provider error envelope in stream errors', async () => {
      const chunks = await getStreamParts('moonshotai-error');
      const errorPart = chunks.find(chunk => chunk.type === 'error');

      expect(errorPart?.type).toBe('error');
      if (errorPart?.type !== 'error') {
        expect.fail('Expected an error part');
      }

      expect(errorPart.error).toStrictEqual({
        message: 'Internal server error',
        type: 'server_error',
        code: 'upstream_failure',
      });
    });

    it('should send partial true when streaming', async () => {
      prepareChunksFixtureResponse('moonshot-text');

      await provider.chatModel('kimi-k3').doStream({
        prompt: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'The sky is' }],
            providerOptions: {
              moonshotai: {
                partial: true,
              } satisfies MoonshotAIAssistantMessageProviderOptions,
            },
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        messages: [{ role: 'assistant', content: 'The sky is', partial: true }],
      });
    });

    it('should omit sampling options and add v2 warnings when streaming', async () => {
      prepareChunksFixtureResponse('moonshot-text');

      const result = await provider.chatModel('kimi-k3').doStream({
        prompt: TEST_PROMPT,
        temperature: 0.2,
        topP: 0.4,
      });
      const parts = await convertReadableStreamToArray(result.stream);

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('temperature');
      expect(requestBody).not.toHaveProperty('top_p');
      expect(parts[0]).toStrictEqual({
        type: 'stream-start',
        warnings: [
          {
            type: 'unsupported-setting',
            setting: 'temperature',
            details:
              'temperature is fixed by model "kimi-k3" and has been omitted.',
          },
          {
            type: 'unsupported-setting',
            setting: 'topP',
            details: 'topP is fixed by model "kimi-k3" and has been omitted.',
          },
        ],
      });
    });

    it('should sanitize thinking options and add v2 warnings when streaming', async () => {
      prepareChunksFixtureResponse('moonshot-text');

      const result = await provider.chatModel('kimi-k2.7-code').doStream({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { thinking: { type: 'disabled' } },
        },
      });
      const parts = await convertReadableStreamToArray(result.stream);

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'thinking',
      );
      expect(parts[0]).toStrictEqual({
        type: 'stream-start',
        warnings: [
          {
            type: 'unsupported-setting',
            setting: 'providerOptions',
            details:
              'Kimi K2.7 thinking cannot be disabled. providerOptions.moonshotai.thinking has been omitted.',
          },
        ],
      });
    });

    it('should omit required tool choice and add a v2 warning when streaming', async () => {
      prepareChunksFixtureResponse('moonshot-text');

      const result = await provider.chatModel('kimi-k2.6').doStream({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Get the weather',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        toolChoice: { type: 'required' },
      });
      const parts = await convertReadableStreamToArray(result.stream);

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'tool_choice',
      );
      expect(parts[0]).toStrictEqual({
        type: 'stream-start',
        warnings: [
          {
            type: 'unsupported-setting',
            setting: 'toolChoice',
            details:
              'toolChoice "required" is not supported by model "kimi-k2.6" and has been omitted; use "auto" or select a specific tool instead.',
          },
        ],
      });
    });

    describe('cached tokens at top level (MoonshotAI format)', () => {
      beforeEach(() => {
        prepareChunksFixtureResponse('moonshot-cached-tokens');
      });

      it('should extract cachedInputTokens from top-level cached_tokens', async () => {
        const result = await provider.chatModel('kimi-k2.5').doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(result.stream);
        const finishPart = parts.find(part => part.type === 'finish');

        expect(finishPart).toBeDefined();
        expect(finishPart!.type).toBe('finish');
        if (finishPart!.type === 'finish') {
          expect(finishPart!.usage).toEqual({
            inputTokens: 100,
            outputTokens: 10,
            totalTokens: 110,
            reasoningTokens: undefined,
            cachedInputTokens: 80,
          });
        }
      });

      it('should not emit raw chunks when not requested', async () => {
        const result = await provider.chatModel('kimi-k2.5').doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(result.stream);
        const rawParts = parts.filter(part => part.type === 'raw');

        expect(rawParts).toHaveLength(0);
      });

      it('should emit raw chunks when includeRawChunks is true', async () => {
        const result = await provider.chatModel('kimi-k2.5').doStream({
          prompt: TEST_PROMPT,
          includeRawChunks: true,
        });

        const parts = await convertReadableStreamToArray(result.stream);
        const rawParts = parts.filter(part => part.type === 'raw');

        expect(rawParts.length).toBeGreaterThan(0);
      });
    });

    describe('without cached tokens', () => {
      beforeEach(() => {
        prepareChunksFixtureResponse('moonshot-text');
      });

      it('should handle usage without cached_tokens', async () => {
        const result = await provider.chatModel('kimi-k2.5').doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(result.stream);
        const finishPart = parts.find(part => part.type === 'finish');

        expect(finishPart).toBeDefined();
        expect(finishPart!.type).toBe('finish');
        if (finishPart!.type === 'finish') {
          expect(finishPart!.usage).toEqual({
            inputTokens: 50,
            outputTokens: 5,
            totalTokens: 55,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          });
        }
      });
    });

    it('should assemble tool calls without explicit indices', async () => {
      const parts = await getStreamParts(
        'moonshotai-issue-19546-indexless-tool-calls',
      );

      expect(parts.some(part => part.type === 'error')).toBe(false);
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
          toolCallId: 'weather_0',
          toolName: 'weather',
          input: '{"location":"San Francisco"}',
        },
        {
          toolCallId: 'time_1',
          toolName: 'time',
          input: '{"zone":"UTC"}',
        },
      ]);
    });

    it('should preserve explicit tool call indices', async () => {
      const parts = await getStreamParts(
        'moonshotai-issue-19546-explicit-index-live',
      );

      expect(parts.some(part => part.type === 'error')).toBe(false);
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
          toolCallId: 'weather_0',
          toolName: 'weather',
          input: '{"location": "San Francisco"}',
        },
      ]);
    });

    it('should collect choice-level usage', async () => {
      const parts = await getStreamParts(
        'moonshotai-issue-19546-choice-usage-live',
      );
      const finishPart = parts.find(part => part.type === 'finish');

      expect(finishPart?.usage).toEqual({
        inputTokens: 12,
        outputTokens: 5,
        totalTokens: 17,
        reasoningTokens: 1,
        cachedInputTokens: undefined,
      });
    });

    it('should prefer top-level usage over choice-level usage', async () => {
      const parts = await getStreamParts(
        'moonshotai-issue-19546-usage-precedence',
      );
      const finishPart = parts.find(part => part.type === 'finish');

      expect(finishPart?.usage).toEqual({
        inputTokens: 99,
        outputTokens: 33,
        totalTokens: 132,
        reasoningTokens: undefined,
        cachedInputTokens: undefined,
      });
    });

    it('should reject malformed tool call indices', async () => {
      const parts = await getStreamParts('moonshotai-issue-19546-malformed');

      expect(parts.some(part => part.type === 'error')).toBe(true);
    });

    it('should send dynamic tool messages when streaming', async () => {
      prepareChunksFixtureResponse('moonshot-text');

      await provider.chatModel('kimi-k3').doStream({
        prompt: [
          {
            role: 'system',
            content: '',
            providerOptions: {
              moonshotai: {
                tools: [
                  {
                    type: 'function',
                    name: 'calculator',
                    inputSchema: { type: 'object', properties: {} },
                  },
                ],
              },
            },
          },
        ],
      });

      expect((await server.calls[0].requestBodyJson).messages[0]).toMatchObject(
        {
          role: 'system',
          tools: [{ function: { name: 'calculator' } }],
        },
      );
    });

    it('should send maxOutputTokens as max_completion_tokens', async () => {
      prepareChunksFixtureResponse('moonshot-text');

      await provider.chatModel('kimi-k3').doStream({
        prompt: TEST_PROMPT,
        maxOutputTokens: 17,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.max_completion_tokens).toBe(17);
      expect(requestBody).not.toHaveProperty('max_tokens');
    });

    it('should omit max_completion_tokens when maxOutputTokens is undefined', async () => {
      prepareChunksFixtureResponse('moonshot-text');

      await provider.chatModel('kimi-k3').doStream({
        prompt: TEST_PROMPT,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('max_completion_tokens');
      expect(requestBody).not.toHaveProperty('max_tokens');
    });

    it('should collect streamed logprobs in finish provider metadata', async () => {
      prepareChunksFixtureResponse('moonshotai-logprobs');

      const result = await provider.chatModel('moonshot-v1-8k').doStream({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { topLogprobs: 1 },
        },
      });
      const parts = await convertReadableStreamToArray(result.stream);

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        logprobs: true,
        top_logprobs: 1,
      });
      expect(
        parts
          .filter(part => part.type === 'text-delta')
          .map(part => part.delta)
          .join(''),
      ).toBe('OK!');
      expect(
        parts.find(part => part.type === 'finish')?.providerMetadata?.moonshotai
          .logprobs,
      ).toEqual({
        content: [
          {
            token: 'OK',
            logprob: -0.0004457433824427426,
            bytes: [79, 75],
            top_logprobs: [
              {
                token: 'OK',
                logprob: -0.0004457433824427426,
                bytes: [79, 75],
              },
            ],
          },
          {
            token: '!',
            logprob: -0.01,
            bytes: null,
            top_logprobs: [
              {
                token: '!',
                logprob: -0.01,
                bytes: null,
              },
            ],
          },
        ],
      });
    });
  });
});
