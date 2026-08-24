import type { JSONSchema7, LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDeepSeek } from '../deepseek-provider';
import { DeepSeekChatLanguageModel } from './deepseek-chat-language-model';
import type {
  DeepSeekAssistantMessageProviderOptions,
  DeepSeekLanguageModelChatOptions,
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

      it('should send prefix true on the final assistant message', async () => {
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
