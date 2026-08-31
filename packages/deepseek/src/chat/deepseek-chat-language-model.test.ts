import type { JSONSchema7, LanguageModelV4Prompt } from '@ai-sdk/provider';
import { isProviderStreamError } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDeepSeek } from '../deepseek-provider';
import { DeepSeekChatLanguageModel } from './deepseek-chat-language-model';
import type {
  DeepSeekAssistantMessageProviderOptions,
  DeepSeekLanguageModelChatOptions,
  DeepSeekMessageProviderOptions,
} from './deepseek-chat-language-model-options';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createDeepSeek({
  apiKey: 'test-api-key',
});

const betaProvider = createDeepSeek({
  apiKey: 'test-api-key',
  baseURL: 'https://api.deepseek.com/beta',
});

const server = createTestServer({
  'https://api.deepseek.com/chat/completions': {},
  'https://api.deepseek.com/beta/chat/completions': {},
});

describe('DeepSeekChatLanguageModel', () => {
  describe('model IDs', () => {
    it.each(['deepseek-v4-flash', 'deepseek-v4-pro'] as const)(
      'should forward the %s model ID',
      async modelId => {
        server.urls['https://api.deepseek.com/chat/completions'].response = {
          type: 'json-value',
          body: {
            id: 'test-id',
            choices: [
              {
                finish_reason: 'stop',
                index: 0,
                message: { content: 'Hello', role: 'assistant' },
              },
            ],
            created: 0,
            model: modelId,
            object: 'chat.completion',
            usage: {
              completion_tokens: 1,
              prompt_tokens: 1,
              total_tokens: 2,
            },
          },
        };

        await provider.chat(modelId).doGenerate({ prompt: TEST_PROMPT });

        expect((await server.calls[0].requestBodyJson).model).toBe(modelId);
      },
    );
  });

  describe('supportedUrls', () => {
    it('should natively support HTTP image URLs', () => {
      expect(provider.chat('deepseek-chat').supportedUrls).toEqual({
        'image/*': [/^https?:\/\/.*$/],
      });
    });
  });

  describe('doGenerate', () => {
    function prepareJsonFixtureResponse(filename: string) {
      server.urls['https://api.deepseek.com/chat/completions'].response = {
        type: 'json-value',
        body: JSON.parse(
          fs.readFileSync(`src/chat/__fixtures__/${filename}.json`, 'utf8'),
        ),
      };
      return;
    }

    describe('text', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('deepseek-text');
      });

      it('should send correct request body', async () => {
        await provider.chat('deepseek-chat').doGenerate({
          prompt: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
          temperature: 0.5,
          topP: 0.3,
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "messages": [
              {
                "content": "You are a helpful assistant.",
                "role": "system",
              },
              {
                "content": "Hello",
                "role": "user",
              },
            ],
            "model": "deepseek-chat",
            "temperature": 0.5,
            "top_p": 0.3,
          }
        `);
      });

      it('should omit deprecated and ineffective sampling options in default V4 thinking mode', async () => {
        const result = await provider.chat('deepseek-v4-flash').doGenerate({
          prompt: TEST_PROMPT,
          temperature: 0.2,
          topP: 0.4,
          frequencyPenalty: 0.5,
          presencePenalty: 0.6,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'deepseek-v4-flash',
          messages: [{ role: 'user', content: 'Hello' }],
        });
        expect(result.warnings).toStrictEqual([
          {
            type: 'deprecated',
            setting: 'frequencyPenalty',
            message:
              'frequencyPenalty is deprecated by DeepSeek and has been omitted. Remove frequencyPenalty from the request.',
          },
          {
            type: 'deprecated',
            setting: 'presencePenalty',
            message:
              'presencePenalty is deprecated by DeepSeek and has been omitted. Remove presencePenalty from the request.',
          },
          {
            type: 'unsupported',
            feature: 'temperature',
            details:
              "temperature has no effect when DeepSeek thinking is enabled. Set providerOptions.deepseek.thinking.type to 'disabled' to use temperature.",
          },
          {
            type: 'unsupported',
            feature: 'topP',
            details:
              "topP has no effect when DeepSeek thinking is enabled. Set providerOptions.deepseek.thinking.type to 'disabled' to use topP.",
          },
        ]);
      });

      it('should preserve supported sampling options when V4 thinking is disabled', async () => {
        const result = await provider.chat('deepseek-v4-flash').doGenerate({
          prompt: TEST_PROMPT,
          temperature: 0.2,
          topP: 0.4,
          frequencyPenalty: 0.5,
          presencePenalty: 0.6,
          providerOptions: {
            deepseek: {
              thinking: { type: 'disabled' },
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'deepseek-v4-flash',
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 0.2,
          top_p: 0.4,
          thinking: { type: 'disabled' },
        });
        expect(result.warnings).toStrictEqual([
          {
            type: 'deprecated',
            setting: 'frequencyPenalty',
            message:
              'frequencyPenalty is deprecated by DeepSeek and has been omitted. Remove frequencyPenalty from the request.',
          },
          {
            type: 'deprecated',
            setting: 'presencePenalty',
            message:
              'presencePenalty is deprecated by DeepSeek and has been omitted. Remove presencePenalty from the request.',
          },
        ]);
      });

      it('should send message names', async () => {
        await provider.chat('deepseek-chat').doGenerate({
          prompt: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
              providerOptions: {
                deepseek: {
                  name: 'guide',
                } satisfies DeepSeekMessageProviderOptions,
              },
            },
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
              providerOptions: {
                deepseek: {
                  name: 'alice',
                } satisfies DeepSeekMessageProviderOptions,
              },
            },
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Hello, Alice.' }],
              providerOptions: {
                deepseek: {
                  name: 'assistant',
                } satisfies DeepSeekMessageProviderOptions,
              },
            },
            {
              role: 'user',
              content: [{ type: 'text', text: 'How are you?' }],
              providerOptions: {
                deepseek: {
                  name: 'alice',
                } satisfies DeepSeekMessageProviderOptions,
              },
            },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "messages": [
              {
                "content": "You are a helpful assistant.",
                "name": "guide",
                "role": "system",
              },
              {
                "content": "Hello",
                "name": "alice",
                "role": "user",
              },
              {
                "content": "Hello, Alice.",
                "name": "assistant",
                "role": "assistant",
              },
              {
                "content": "How are you?",
                "name": "alice",
                "role": "user",
              },
            ],
            "model": "deepseek-chat",
          }
        `);
      });

      it('should pass providerOptions userId as user_id', async () => {
        await provider.chat('deepseek-chat').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            deepseek: {
              userId: 'tenant_123-user',
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          user_id: 'tenant_123-user',
        });
      });

      it('should omit user_id when userId is not provided', async () => {
        await provider.chat('deepseek-chat').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
          'user_id',
        );
      });

      it('should reject strict tools on the standard endpoint before fetching', async () => {
        await expect(
          provider.chat('deepseek-chat').doGenerate({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'function',
                name: 'getWeather',
                inputSchema: { type: 'object', properties: {} },
                strict: true,
              },
            ],
          }),
        ).rejects.toThrow(
          'DeepSeek strict tool calls require a beta base URL ending in `/beta`.',
        );

        expect(server.calls).toHaveLength(0);
      });

      it('should send all-strict tools on the beta endpoint', async () => {
        server.urls['https://api.deepseek.com/beta/chat/completions'].response =
          {
            type: 'json-value',
            body: JSON.parse(
              fs.readFileSync(
                'src/chat/__fixtures__/deepseek-text.json',
                'utf8',
              ),
            ),
          };

        await betaProvider.chat('deepseek-chat').doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'getWeather',
              inputSchema: { type: 'object', properties: {} },
              strict: true,
            },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          tools: [
            {
              type: 'function',
              function: {
                name: 'getWeather',
                strict: true,
              },
            },
          ],
        });
      });

      it('should reject mixed strict tools in streaming requests', async () => {
        await expect(
          betaProvider.chat('deepseek-chat').doStream({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'function',
                name: 'strictTool',
                inputSchema: { type: 'object', properties: {} },
                strict: true,
              },
              {
                type: 'function',
                name: 'nonStrictTool',
                inputSchema: { type: 'object', properties: {} },
              },
            ],
          }),
        ).rejects.toThrow(
          'DeepSeek strict mode requires every function tool in the request to set `strict: true`.',
        );

        expect(server.calls).toHaveLength(0);
      });

      it.each([
        ['', 'userId must match /^[a-zA-Z0-9_-]+$/'],
        ['contains space', 'userId must match /^[a-zA-Z0-9_-]+$/'],
        ['a'.repeat(513), 'userId must be at most 512 characters long'],
      ])(
        'should reject invalid userId %j before making an API request',
        async (userId, validationMessage) => {
          await expect(
            provider.chat('deepseek-chat').doGenerate({
              prompt: TEST_PROMPT,
              providerOptions: {
                deepseek: {
                  userId,
                } satisfies DeepSeekLanguageModelChatOptions,
              },
            }),
          ).rejects.toMatchObject({
            name: 'AI_InvalidArgumentError',
            argument: 'providerOptions',
            message: 'invalid deepseek provider options',
            cause: {
              message: expect.stringContaining(validationMessage),
            },
          });

          expect(server.calls).toHaveLength(0);
        },
      );

      it('should extract text content', async () => {
        const result = await provider.chat('deepseek-chat').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result).toMatchSnapshot();
      });

      it('should include the system fingerprint in provider metadata', async () => {
        const result = await provider.chat('deepseek-chat').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.providerMetadata?.deepseek.systemFingerprint).toBe(
          'fp_eaab8d114b_prod0820_fp8_kvcache',
        );
      });

      it.each([null, undefined])(
        'should tolerate a %s system fingerprint',
        async systemFingerprint => {
          const responseBody = JSON.parse(
            fs.readFileSync('src/chat/__fixtures__/deepseek-text.json', 'utf8'),
          );
          responseBody.system_fingerprint = systemFingerprint;

          if (systemFingerprint === undefined) {
            delete responseBody.system_fingerprint;
          }

          server.urls['https://api.deepseek.com/chat/completions'].response = {
            type: 'json-value',
            body: responseBody,
          };

          const result = await provider.chat('deepseek-chat').doGenerate({
            prompt: TEST_PROMPT,
          });

          expect(result.providerMetadata?.deepseek).not.toHaveProperty(
            'systemFingerprint',
          );
        },
      );
    });

    describe('reasoning', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('deepseek-reasoning');
      });

      it('should send correct request body', async () => {
        await provider.chat('deepseek-reasoner').doGenerate({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'How many "r"s are in the word "strawberry"?',
                },
              ],
            },
          ],
          providerOptions: {
            deepseek: {
              thinking: { type: 'enabled' },
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "messages": [
              {
                "content": "How many "r"s are in the word "strawberry"?",
                "role": "user",
              },
            ],
            "model": "deepseek-reasoner",
            "thinking": {
              "type": "enabled",
            },
          }
        `);
      });

      it('should extract text content', async () => {
        const result = await provider.chat('deepseek-chat').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result).toMatchSnapshot();
      });
    });

    describe('logprobs', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('deepseek-logprobs');
      });

      it('should send logprobs provider options', async () => {
        await provider.chat('deepseek-v4-flash').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            deepseek: {
              logprobs: true,
              topLogprobs: 1,
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "logprobs": true,
            "messages": [
              {
                "content": "Hello",
                "role": "user",
              },
            ],
            "model": "deepseek-v4-flash",
            "top_logprobs": 1,
          }
        `);
      });

      it('should enable logprobs when topLogprobs is set', async () => {
        await provider.chat('deepseek-v4-flash').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            deepseek: {
              topLogprobs: 1,
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          logprobs: true,
          top_logprobs: 1,
        });
      });

      it('should extract content and reasoning logprobs', async () => {
        const result = await provider.chat('deepseek-v4-flash').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            deepseek: {
              logprobs: true,
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        });

        expect(result.providerMetadata?.deepseek.logprobs)
          .toMatchInlineSnapshot(`
            {
              "content": [
                {
                  "bytes": [
                    79,
                    75,
                  ],
                  "logprob": -0.00002467602,
                  "token": "OK",
                  "top_logprobs": [
                    {
                      "bytes": [
                        79,
                        75,
                      ],
                      "logprob": -0.00002467602,
                      "token": "OK",
                    },
                  ],
                },
              ],
              "reasoning_content": [
                {
                  "bytes": null,
                  "logprob": -0.1,
                  "token": "Reasoning",
                  "top_logprobs": [
                    {
                      "bytes": null,
                      "logprob": -0.1,
                      "token": "Reasoning",
                    },
                  ],
                },
              ],
            }
          `);
      });
    });

    describe('top-level reasoning', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('deepseek-text');
      });

      it('should map top-level reasoning to thinking enabled', async () => {
        await provider.chat('deepseek-reasoner').doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'high',
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody.thinking).toStrictEqual({
          type: 'enabled',
        });
        expect(requestBody.reasoning_effort).toBe('high');
      });

      it('should map top-level reasoning none to thinking disabled', async () => {
        await provider.chat('deepseek-reasoner').doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'none',
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody.thinking).toStrictEqual({
          type: 'disabled',
        });
        expect(requestBody.reasoning_effort).toBeUndefined();
      });

      it('should map top-level reasoning xhigh to reasoning_effort max', async () => {
        const result = await provider.chat('deepseek-reasoner').doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'xhigh',
        });

        expect((await server.calls[0].requestBodyJson).reasoning_effort).toBe(
          'max',
        );
        expect(result.warnings).toContainEqual({
          type: 'compatibility',
          feature: 'reasoning',
          details:
            'reasoning "xhigh" is not directly supported by this model. mapped to effort "max".',
        });
      });

      it('should map top-level reasoning low to reasoning_effort low without a compatibility warning', async () => {
        const result = await provider.chat('deepseek-reasoner').doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'low',
        });

        expect((await server.calls[0].requestBodyJson).reasoning_effort).toBe(
          'low',
        );
        expect(result.warnings).not.toContainEqual(
          expect.objectContaining({
            type: 'compatibility',
            feature: 'reasoning',
          }),
        );
      });

      it('should map top-level reasoning medium to reasoning_effort high with a compatibility warning', async () => {
        const result = await provider.chat('deepseek-reasoner').doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'medium',
        });

        expect((await server.calls[0].requestBodyJson).reasoning_effort).toBe(
          'high',
        );
        expect(result.warnings).toContainEqual({
          type: 'compatibility',
          feature: 'reasoning',
          details:
            'reasoning "medium" is not directly supported by this model. mapped to effort "high".',
        });
      });

      it('should map top-level reasoning minimal to reasoning_effort low with compatibility warning', async () => {
        const result = await provider.chat('deepseek-reasoner').doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'minimal',
        });

        expect((await server.calls[0].requestBodyJson).reasoning_effort).toBe(
          'low',
        );
        expect(result.warnings).toContainEqual({
          type: 'compatibility',
          feature: 'reasoning',
          details:
            'reasoning "minimal" is not directly supported by this model. mapped to effort "low".',
        });
      });

      it.each([
        { input: 'low', output: 'low', warning: false },
        { input: 'medium', output: 'high', warning: true },
        { input: 'xhigh', output: 'max', warning: true },
      ] as const)(
        'should map providerOptions reasoningEffort $input to $output',
        async ({ input, output, warning }) => {
          const result = await provider.chat('deepseek-reasoner').doGenerate({
            prompt: TEST_PROMPT,
            providerOptions: {
              deepseek: {
                reasoningEffort: input,
              },
            },
          });

          expect((await server.calls[0].requestBodyJson).reasoning_effort).toBe(
            output,
          );
          expect(result.warnings).toEqual(
            warning
              ? [
                  {
                    type: 'compatibility',
                    feature: 'reasoningEffort',
                    details: `reasoningEffort "${input}" is not a canonical DeepSeek value. mapped to "${output}".`,
                  },
                ]
              : [],
          );
        },
      );

      it('should map legacy providerOptions thinking.type=adaptive to enabled with a compatibility warning', async () => {
        const result = await provider.chat('deepseek-reasoner').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            deepseek: {
              thinking: { type: 'adaptive' },
            },
          },
        });

        expect((await server.calls[0].requestBodyJson).thinking).toStrictEqual({
          type: 'enabled',
        });
        expect(result.warnings).toContainEqual({
          type: 'compatibility',
          feature: 'thinking.type',
          details:
            'thinking.type "adaptive" is not a canonical DeepSeek value. mapped to "enabled".',
        });
      });

      it('should pass providerOptions reasoningEffort', async () => {
        await provider.chat('deepseek-reasoner').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            deepseek: {
              reasoningEffort: 'max',
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody.reasoning_effort).toBe('max');
        // When only reasoningEffort is set without thinking, thinking should be
        // undefined and rely on the API default (enabled).
        expect(requestBody.thinking).toBeUndefined();
      });

      it('should prefer providerOptions thinking over top-level reasoning', async () => {
        await provider.chat('deepseek-reasoner').doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'none',
          providerOptions: {
            deepseek: {
              thinking: { type: 'enabled' },
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        });

        expect((await server.calls[0].requestBodyJson).thinking).toStrictEqual({
          type: 'enabled',
        });
      });

      it('should prefer providerOptions reasoningEffort over top-level reasoning', async () => {
        await provider.chat('deepseek-reasoner').doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'high',
          providerOptions: {
            deepseek: {
              reasoningEffort: 'max',
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        });

        expect((await server.calls[0].requestBodyJson).reasoning_effort).toBe(
          'max',
        );
      });

      it('should not set thinking when reasoning is not specified', async () => {
        await provider.chat('deepseek-reasoner').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(
          (await server.calls[0].requestBodyJson).thinking,
        ).toBeUndefined();
      });
    });

    describe('tool call', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('deepseek-tool-call');
      });

      it('should send correct request body', async () => {
        await provider.chat('deepseek-reasoner').doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'weather',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
                required: ['location'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          ],
          providerOptions: {
            deepseek: {
              thinking: { type: 'enabled' },
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "messages": [
              {
                "content": "Hello",
                "role": "user",
              },
            ],
            "model": "deepseek-reasoner",
            "thinking": {
              "type": "enabled",
            },
            "tools": [
              {
                "function": {
                  "name": "weather",
                  "parameters": {
                    "$schema": "http://json-schema.org/draft-07/schema#",
                    "additionalProperties": false,
                    "properties": {
                      "location": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "location",
                    ],
                    "type": "object",
                  },
                },
                "type": "function",
              },
            ],
          }
        `);
      });

      describe('json response format', () => {
        beforeEach(() => {
          prepareJsonFixtureResponse('deepseek-json');
        });

        it('should send correct request body without schema', async () => {
          await provider.chat('deepseek-reasoner').doGenerate({
            prompt: TEST_PROMPT,
            responseFormat: { type: 'json' },
            tools: [
              {
                type: 'function',
                name: 'weather',
                inputSchema: {
                  type: 'object',
                  properties: { location: { type: 'string' } },
                  required: ['location'],
                  additionalProperties: false,
                  $schema: 'http://json-schema.org/draft-07/schema#',
                },
              },
            ],
            providerOptions: {
              deepseek: {
                thinking: { type: 'enabled' },
              } satisfies DeepSeekLanguageModelChatOptions,
            },
          });

          expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
            {
              "messages": [
                {
                  "content": "Return JSON.",
                  "role": "system",
                },
                {
                  "content": "Hello",
                  "role": "user",
                },
              ],
              "model": "deepseek-reasoner",
              "response_format": {
                "type": "json_object",
              },
              "thinking": {
                "type": "enabled",
              },
              "tools": [
                {
                  "function": {
                    "name": "weather",
                    "parameters": {
                      "$schema": "http://json-schema.org/draft-07/schema#",
                      "additionalProperties": false,
                      "properties": {
                        "location": {
                          "type": "string",
                        },
                      },
                      "required": [
                        "location",
                      ],
                      "type": "object",
                    },
                  },
                  "type": "function",
                },
              ],
            }
          `);
        });

        it('should send correct request body with schema', async () => {
          await provider.chat('deepseek-reasoner').doGenerate({
            prompt: TEST_PROMPT,
            responseFormat: {
              type: 'json',
              schema: {
                type: 'object',
                properties: {
                  elements: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        location: { type: 'string' },
                        temperature: { type: 'number' },
                        condition: { type: 'string' },
                      },
                      required: ['location', 'temperature', 'condition'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['elements'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
            tools: [
              {
                type: 'function',
                name: 'weather',
                inputSchema: {
                  type: 'object',
                  properties: { location: { type: 'string' } },
                  required: ['location'],
                  additionalProperties: false,
                  $schema: 'http://json-schema.org/draft-07/schema#',
                },
              },
            ],
            providerOptions: {
              deepseek: {
                thinking: { type: 'enabled' },
              } satisfies DeepSeekLanguageModelChatOptions,
            },
          });

          expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
            {
              "messages": [
                {
                  "content": "Return JSON that conforms to the following schema: {"type":"object","properties":{"elements":{"type":"array","items":{"type":"object","properties":{"location":{"type":"string"},"temperature":{"type":"number"},"condition":{"type":"string"}},"required":["location","temperature","condition"],"additionalProperties":false}}},"required":["elements"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}",
                  "role": "system",
                },
                {
                  "content": "Hello",
                  "role": "user",
                },
              ],
              "model": "deepseek-reasoner",
              "response_format": {
                "type": "json_object",
              },
              "thinking": {
                "type": "enabled",
              },
              "tools": [
                {
                  "function": {
                    "name": "weather",
                    "parameters": {
                      "$schema": "http://json-schema.org/draft-07/schema#",
                      "additionalProperties": false,
                      "properties": {
                        "location": {
                          "type": "string",
                        },
                      },
                      "required": [
                        "location",
                      ],
                      "type": "object",
                    },
                  },
                  "type": "function",
                },
              ],
            }
          `);
        });

        it('should extract text content', async () => {
          const result = await provider.chat('deepseek-reasoner').doGenerate({
            prompt: TEST_PROMPT,
            responseFormat: { type: 'json' },
            tools: [
              {
                type: 'function',
                name: 'weather',
                inputSchema: {
                  type: 'object',
                  properties: { location: { type: 'string' } },
                  required: ['location'],
                  additionalProperties: false,
                  $schema: 'http://json-schema.org/draft-07/schema#',
                },
              },
            ],
            providerOptions: {
              deepseek: {
                thinking: { type: 'enabled' },
              } satisfies DeepSeekLanguageModelChatOptions,
            },
          });

          expect(result).toMatchSnapshot();
        });
      });

      describe('json response format with structured outputs', () => {
        const structuredOutputsModel = new DeepSeekChatLanguageModel(
          'deepseek-v4-flash',
          {
            provider: 'azure.deepseek',
            url: () => 'https://api.deepseek.com/chat/completions',
            headers: () => ({}),
            supportsStructuredOutputs: true,
          },
        );

        const TEST_SCHEMA: JSONSchema7 = {
          type: 'object',
          properties: { sentiment: { type: 'string' } },
          required: ['sentiment'],
          additionalProperties: false,
        };

        beforeEach(() => {
          prepareJsonFixtureResponse('deepseek-json');
        });

        it('should send json_schema response format and skip schema injection', async () => {
          const { warnings } = await structuredOutputsModel.doGenerate({
            prompt: TEST_PROMPT,
            responseFormat: {
              type: 'json',
              name: 'sentiment',
              schema: TEST_SCHEMA,
            },
          });

          expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
            {
              "messages": [
                {
                  "content": "Hello",
                  "role": "user",
                },
              ],
              "model": "deepseek-v4-flash",
              "response_format": {
                "json_schema": {
                  "name": "sentiment",
                  "schema": {
                    "additionalProperties": false,
                    "properties": {
                      "sentiment": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "sentiment",
                    ],
                    "type": "object",
                  },
                  "strict": true,
                },
                "type": "json_schema",
              },
            }
          `);
          expect(warnings).toStrictEqual([]);
        });

        it('should honor strictJsonSchema provider option', async () => {
          await structuredOutputsModel.doGenerate({
            prompt: TEST_PROMPT,
            responseFormat: { type: 'json', schema: TEST_SCHEMA },
            providerOptions: {
              azure: {
                strictJsonSchema: false,
              } satisfies DeepSeekLanguageModelChatOptions,
            },
          });

          const body = await server.calls[0].requestBodyJson;
          expect(body.response_format).toMatchObject({
            type: 'json_schema',
            json_schema: { strict: false, name: 'response' },
          });
        });

        it('should fall back to json_object without a schema', async () => {
          await structuredOutputsModel.doGenerate({
            prompt: TEST_PROMPT,
            responseFormat: { type: 'json' },
          });

          const body = await server.calls[0].requestBodyJson;
          expect(body.response_format).toStrictEqual({ type: 'json_object' });
          expect(body.messages[0]).toStrictEqual({
            role: 'system',
            content: 'Return JSON.',
          });
        });
      });

      it('should extract tool call content', async () => {
        const result = await provider.chat('deepseek-reasoner').doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'weather',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
                required: ['location'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          ],
          providerOptions: {
            deepseek: {
              thinking: { type: 'enabled' },
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        });

        expect(result).toMatchSnapshot();
      });
    });

    describe('assistant prefix completion', () => {
      beforeEach(() => {
        server.urls['https://api.deepseek.com/beta/chat/completions'].response =
          {
            type: 'json-value',
            body: JSON.parse(
              fs.readFileSync(
                'src/chat/__fixtures__/deepseek-text.json',
                'utf8',
              ),
            ),
          };
      });

      it('should send name and prefix on the final assistant message', async () => {
        await betaProvider.chat('deepseek-chat').doGenerate({
          prompt: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Complete this sentence.' }],
            },
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'The answer is' }],
              providerOptions: {
                deepseek: {
                  name: 'assistant',
                  prefix: true,
                } satisfies DeepSeekAssistantMessageProviderOptions,
              },
            },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          messages: [
            {
              role: 'user',
              content: 'Complete this sentence.',
            },
            {
              role: 'assistant',
              content: 'The answer is',
              name: 'assistant',
              prefix: true,
            },
          ],
          model: 'deepseek-chat',
        });
      });

      it('should reject prefix completion with the default base URL', async () => {
        await expect(
          provider.chat('deepseek-chat').doGenerate({
            prompt: [
              {
                role: 'assistant',
                content: [{ type: 'text', text: 'The answer is' }],
                providerOptions: {
                  deepseek: {
                    prefix: true,
                  } satisfies DeepSeekAssistantMessageProviderOptions,
                },
              },
            ],
          }),
        ).rejects.toThrow(
          'DeepSeek assistant prefix completion requires a beta base URL ending in `/beta`.',
        );

        expect(server.calls).toHaveLength(0);
      });
    });
  });

  describe('doStream', () => {
    function prepareChunksFixtureResponse(filename: string) {
      const chunks = fs
        .readFileSync(`src/chat/__fixtures__/${filename}.chunks.txt`, 'utf8')
        .split('\n')
        .map(line => `data: ${line}\n\n`);
      chunks.push('data: [DONE]\n\n');

      server.urls['https://api.deepseek.com/chat/completions'].response = {
        type: 'stream-chunks',
        chunks,
      };
    }

    it('should preserve a provider error envelope in stream errors', async () => {
      const data = {
        error: {
          message: 'Rate limit reached',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
        },
      };

      server.urls['https://api.deepseek.com/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [`data: ${JSON.stringify(data)}\n\n`, 'data: [DONE]\n\n'],
      };

      const result = await provider.chat('deepseek-chat').doStream({
        prompt: TEST_PROMPT,
      });
      const chunks = await convertReadableStreamToArray(result.stream);
      const errorPart = chunks.find(chunk => chunk.type === 'error');

      expect(errorPart?.type).toBe('error');
      if (errorPart?.type !== 'error') {
        expect.fail('Expected an error part');
      }

      expect(isProviderStreamError(errorPart.error)).toBe(true);
      expect(errorPart.error).toMatchObject({
        message: 'Rate limit reached',
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
        statusCode: 429,
        isRetryable: true,
        data,
      });
    });

    it('should classify insufficient quota as non-retryable', async () => {
      const data = {
        error: {
          message: 'You exceeded your current quota.',
          type: 'rate_limit_error',
          code: 'insufficient_quota',
        },
      };

      server.urls['https://api.deepseek.com/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [`data: ${JSON.stringify(data)}\n\n`, 'data: [DONE]\n\n'],
      };

      const result = await provider.chat('deepseek-chat').doStream({
        prompt: TEST_PROMPT,
      });
      const chunks = await convertReadableStreamToArray(result.stream);
      const errorPart = chunks.find(chunk => chunk.type === 'error');

      expect(errorPart).toMatchObject({
        type: 'error',
        error: {
          message: data.error.message,
          type: data.error.type,
          code: data.error.code,
          statusCode: 429,
          isRetryable: false,
          data,
        },
      });
    });

    it('should preserve the provider type when code is an HTTP status', async () => {
      const data = {
        error: {
          message: 'Rate limit reached',
          type: 'rate_limit_error',
          code: '429',
        },
      };

      server.urls['https://api.deepseek.com/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [`data: ${JSON.stringify(data)}\n\n`, 'data: [DONE]\n\n'],
      };

      const result = await provider.chat('deepseek-chat').doStream({
        prompt: TEST_PROMPT,
      });
      const chunks = await convertReadableStreamToArray(result.stream);
      const errorPart = chunks.find(chunk => chunk.type === 'error');

      expect(errorPart).toMatchObject({
        type: 'error',
        error: {
          message: data.error.message,
          type: data.error.type,
          code: data.error.code,
          statusCode: 429,
          isRetryable: true,
          data,
        },
      });
    });

    describe('text', () => {
      beforeEach(() => {
        prepareChunksFixtureResponse('deepseek-text');
      });

      it('should send model id, settings, and input', async () => {
        await provider.chat('deepseek-chat').doStream({
          prompt: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
          temperature: 0.5,
          topP: 0.3,
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "messages": [
              {
                "content": "You are a helpful assistant.",
                "role": "system",
              },
              {
                "content": "Hello",
                "role": "user",
              },
            ],
            "model": "deepseek-chat",
            "stream": true,
            "stream_options": {
              "include_usage": true,
            },
            "temperature": 0.5,
            "top_p": 0.3,
          }
        `);
      });

      it('should omit deprecated and ineffective sampling options in default V4 thinking mode', async () => {
        const result = await provider.chat('deepseek-v4-flash').doStream({
          prompt: TEST_PROMPT,
          temperature: 0.2,
          topP: 0.4,
          frequencyPenalty: 0.5,
          presencePenalty: 0.6,
        });
        const parts = await convertReadableStreamToArray(result.stream);

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'deepseek-v4-flash',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
          stream_options: { include_usage: true },
        });
        expect(parts[0]).toStrictEqual({
          type: 'stream-start',
          warnings: [
            {
              type: 'deprecated',
              setting: 'frequencyPenalty',
              message:
                'frequencyPenalty is deprecated by DeepSeek and has been omitted. Remove frequencyPenalty from the request.',
            },
            {
              type: 'deprecated',
              setting: 'presencePenalty',
              message:
                'presencePenalty is deprecated by DeepSeek and has been omitted. Remove presencePenalty from the request.',
            },
            {
              type: 'unsupported',
              feature: 'temperature',
              details:
                "temperature has no effect when DeepSeek thinking is enabled. Set providerOptions.deepseek.thinking.type to 'disabled' to use temperature.",
            },
            {
              type: 'unsupported',
              feature: 'topP',
              details:
                "topP has no effect when DeepSeek thinking is enabled. Set providerOptions.deepseek.thinking.type to 'disabled' to use topP.",
            },
          ],
        });
      });

      it('should preserve supported sampling options when V4 thinking is disabled', async () => {
        const result = await provider.chat('deepseek-v4-flash').doStream({
          prompt: TEST_PROMPT,
          temperature: 0.2,
          topP: 0.4,
          frequencyPenalty: 0.5,
          presencePenalty: 0.6,
          providerOptions: {
            deepseek: {
              thinking: { type: 'disabled' },
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        });
        const parts = await convertReadableStreamToArray(result.stream);

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'deepseek-v4-flash',
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 0.2,
          top_p: 0.4,
          thinking: { type: 'disabled' },
          stream: true,
          stream_options: { include_usage: true },
        });
        expect(parts[0]).toStrictEqual({
          type: 'stream-start',
          warnings: [
            {
              type: 'deprecated',
              setting: 'frequencyPenalty',
              message:
                'frequencyPenalty is deprecated by DeepSeek and has been omitted. Remove frequencyPenalty from the request.',
            },
            {
              type: 'deprecated',
              setting: 'presencePenalty',
              message:
                'presencePenalty is deprecated by DeepSeek and has been omitted. Remove presencePenalty from the request.',
            },
          ],
        });
      });

      it('should send message names', async () => {
        await provider.chat('deepseek-chat').doStream({
          prompt: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
              providerOptions: {
                deepseek: {
                  name: 'guide',
                } satisfies DeepSeekMessageProviderOptions,
              },
            },
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
              providerOptions: {
                deepseek: {
                  name: 'alice',
                } satisfies DeepSeekMessageProviderOptions,
              },
            },
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Hello, Alice.' }],
              providerOptions: {
                deepseek: {
                  name: 'assistant',
                } satisfies DeepSeekMessageProviderOptions,
              },
            },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "messages": [
              {
                "content": "You are a helpful assistant.",
                "name": "guide",
                "role": "system",
              },
              {
                "content": "Hello",
                "name": "alice",
                "role": "user",
              },
              {
                "content": "Hello, Alice.",
                "name": "assistant",
                "role": "assistant",
              },
            ],
            "model": "deepseek-chat",
            "stream": true,
            "stream_options": {
              "include_usage": true,
            },
          }
        `);
      });

      it('should pass providerOptions userId as user_id', async () => {
        await provider.chat('deepseek-chat').doStream({
          prompt: TEST_PROMPT,
          providerOptions: {
            deepseek: {
              userId: 'tenant_123-user',
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          stream: true,
          user_id: 'tenant_123-user',
        });
      });

      it('should stream text', async () => {
        const result = await provider.chat('deepseek-chat').doStream({
          prompt: TEST_PROMPT,
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });

      it('should include the repeated system fingerprint in provider metadata', async () => {
        const result = await provider.chat('deepseek-chat').doStream({
          prompt: TEST_PROMPT,
        });
        const parts = await convertReadableStreamToArray(result.stream);

        expect(parts).toContainEqual(
          expect.objectContaining({
            type: 'finish',
            providerMetadata: {
              deepseek: expect.objectContaining({
                systemFingerprint: 'fp_eaab8d114b_prod0820_fp8_kvcache',
              }),
            },
          }),
        );
      });

      it('should keep the latest non-null system fingerprint', async () => {
        server.urls['https://api.deepseek.com/chat/completions'].response = {
          type: 'stream-chunks',
          chunks: [
            'data: {"system_fingerprint":"fp_initial","choices":[{"delta":{"content":"OK"},"finish_reason":null}],"usage":null}\n\n',
            'data: {"system_fingerprint":null,"choices":[{"delta":{},"finish_reason":null}],"usage":null}\n\n',
            'data: {"system_fingerprint":"fp_latest","choices":[{"delta":{},"finish_reason":"stop"}],"usage":null}\n\n',
            'data: [DONE]\n\n',
          ],
        };

        const result = await provider.chat('deepseek-chat').doStream({
          prompt: TEST_PROMPT,
        });
        const parts = await convertReadableStreamToArray(result.stream);

        expect(parts).toContainEqual(
          expect.objectContaining({
            type: 'finish',
            providerMetadata: {
              deepseek: expect.objectContaining({
                systemFingerprint: 'fp_latest',
              }),
            },
          }),
        );
      });

      it.each([null, undefined])(
        'should tolerate a %s system fingerprint',
        async systemFingerprint => {
          const chunk: Record<string, unknown> = {
            system_fingerprint: systemFingerprint,
            choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }],
            usage: null,
          };

          if (systemFingerprint === undefined) {
            delete chunk.system_fingerprint;
          }

          server.urls['https://api.deepseek.com/chat/completions'].response = {
            type: 'stream-chunks',
            chunks: [`data: ${JSON.stringify(chunk)}\n\n`, 'data: [DONE]\n\n'],
          };

          const result = await provider.chat('deepseek-chat').doStream({
            prompt: TEST_PROMPT,
          });
          const parts = await convertReadableStreamToArray(result.stream);

          const finishPart = parts.find(part => part.type === 'finish');

          expect(finishPart?.providerMetadata?.deepseek).not.toHaveProperty(
            'systemFingerprint',
          );
        },
      );
    });

    describe('reasoning', () => {
      beforeEach(() => {
        prepareChunksFixtureResponse('deepseek-reasoning');
      });

      it('should map legacy thinking and generic reasoning to canonical request values', async () => {
        const result = await provider.chat('deepseek-reasoner').doStream({
          prompt: TEST_PROMPT,
          reasoning: 'medium',
          providerOptions: {
            deepseek: {
              thinking: { type: 'adaptive' },
            },
          },
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody.thinking).toStrictEqual({ type: 'enabled' });
        expect(requestBody.reasoning_effort).toBe('high');

        const streamParts = await convertReadableStreamToArray(result.stream);
        expect(streamParts[0]).toStrictEqual({
          type: 'stream-start',
          warnings: [
            {
              type: 'compatibility',
              feature: 'thinking.type',
              details:
                'thinking.type "adaptive" is not a canonical DeepSeek value. mapped to "enabled".',
            },
            {
              type: 'compatibility',
              feature: 'reasoning',
              details:
                'reasoning "medium" is not directly supported by this model. mapped to effort "high".',
            },
          ],
        });
      });

      it('should stream reasoning', async () => {
        const result = await provider.chat('deepseek-reasoning').doStream({
          prompt: TEST_PROMPT,
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });

    describe('logprobs', () => {
      beforeEach(() => {
        prepareChunksFixtureResponse('deepseek-logprobs');
      });

      it('should send logprobs provider options and collect streamed logprobs', async () => {
        const result = await provider.chat('deepseek-v4-flash').doStream({
          prompt: TEST_PROMPT,
          providerOptions: {
            deepseek: {
              logprobs: true,
              topLogprobs: 1,
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        });

        const parts = await convertReadableStreamToArray(result.stream);

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          logprobs: true,
          top_logprobs: 1,
        });
        expect(parts.find(part => part.type === 'finish')?.providerMetadata)
          .toMatchInlineSnapshot(`
            {
              "deepseek": {
                "choiceIndex": 0,
                "logprobs": {
                  "content": [
                    {
                      "bytes": [
                        79,
                        75,
                      ],
                      "logprob": -0.00002467602,
                      "token": "OK",
                      "top_logprobs": [
                        {
                          "bytes": [
                            79,
                            75,
                          ],
                          "logprob": -0.00002467602,
                          "token": "OK",
                        },
                      ],
                    },
                  ],
                  "reasoning_content": [
                    {
                      "bytes": null,
                      "logprob": -0.1,
                      "token": "Reasoning",
                      "top_logprobs": [
                        {
                          "bytes": null,
                          "logprob": -0.1,
                          "token": "Reasoning",
                        },
                      ],
                    },
                  ],
                },
                "messageRole": "assistant",
                "promptCacheHitTokens": 0,
                "promptCacheMissTokens": 9,
                "responseObject": "chat.completion.chunk",
              },
            }
          `);
      });
    });

    describe('tool call', () => {
      beforeEach(() => {
        prepareChunksFixtureResponse('deepseek-tool-call');
      });

      it('should stream tool call', async () => {
        const result = await provider.chat('deepseek-reasoner').doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'weather',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
                required: ['location'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          ],
          providerOptions: {
            deepseek: {
              thinking: { type: 'enabled' },
            } satisfies DeepSeekLanguageModelChatOptions,
          },
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });

    describe('assistant prefix completion', () => {
      beforeEach(() => {
        const chunks = fs
          .readFileSync(
            'src/chat/__fixtures__/deepseek-text.chunks.txt',
            'utf8',
          )
          .split('\n')
          .map(line => `data: ${line}\n\n`);
        chunks.push('data: [DONE]\n\n');

        server.urls['https://api.deepseek.com/beta/chat/completions'].response =
          {
            type: 'stream-chunks',
            chunks,
          };
      });

      it('should send prefix true on the final assistant message', async () => {
        await betaProvider.chat('deepseek-chat').doStream({
          prompt: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Complete this sentence.' }],
            },
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'The answer is' }],
              providerOptions: {
                deepseek: {
                  prefix: true,
                } satisfies DeepSeekAssistantMessageProviderOptions,
              },
            },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          messages: [
            {
              role: 'user',
              content: 'Complete this sentence.',
            },
            {
              role: 'assistant',
              content: 'The answer is',
              prefix: true,
            },
          ],
          model: 'deepseek-chat',
          stream: true,
        });
      });
    });
  });
});
