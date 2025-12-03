import {
  LanguageModelV3,
  LanguageModelV3Content,
  LanguageModelV3FunctionTool,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';
import {
  openaiResponsesModelIds,
  OpenAIResponsesProviderOptions,
  openaiResponsesReasoningModelIds,
} from './openai-responses-options';

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const TEST_TOOLS: Array<LanguageModelV3FunctionTool> = [
  {
    type: 'function',
    name: 'weather',
    inputSchema: {
      type: 'object',
      properties: { location: { type: 'string' } },
      required: ['location'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'cityAttractions',
    inputSchema: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
      additionalProperties: false,
    },
  },
];

const nonReasoningModelIds = openaiResponsesModelIds.filter(
  modelId =>
    !openaiResponsesReasoningModelIds.includes(
      modelId as (typeof openaiResponsesReasoningModelIds)[number],
    ),
);

function createModel(modelId: string, fileIdPrefixes?: readonly string[]) {
  return new OpenAIResponsesLanguageModel(modelId, {
    provider: 'openai',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers: () => ({ Authorization: `Bearer APIKEY` }),
    generateId: mockId(),
    fileIdPrefixes,
  });
}

describe('OpenAIResponsesLanguageModel', () => {
  const server = createTestServer({
    'https://api.openai.com/v1/responses': {},
  });

  function prepareJsonFixtureResponse(filename: string) {
    server.urls['https://api.openai.com/v1/responses'].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(`src/responses/__fixtures__/${filename}.json`, 'utf8'),
      ),
    };
    return;
  }

  function prepareChunksFixtureResponse(filename: string) {
    const chunks = fs
      .readFileSync(`src/responses/__fixtures__/${filename}.chunks.txt`, 'utf8')
      .split('\n')
      .map(line => `data: ${line}\n\n`);
    chunks.push('data: [DONE]\n\n');

    server.urls['https://api.openai.com/v1/responses'].response = {
      type: 'stream-chunks',
      chunks,
    };
  }

  describe('doGenerate', () => {
    function prepareJsonResponse(body: any) {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'json-value',
        body,
      };
    }

    describe('basic text response', () => {
      beforeEach(() => {
        prepareJsonResponse({
          id: 'resp_67c97c0203188190a025beb4a75242bc',
          object: 'response',
          created_at: 1741257730,
          status: 'completed',
          error: null,
          incomplete_details: null,
          input: [],
          instructions: null,
          max_output_tokens: null,
          model: 'gpt-4o-2024-07-18',
          output: [
            {
              id: 'msg_67c97c02656c81908e080dfdf4a03cd1',
              type: 'message',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'answer text',
                  annotations: [],
                },
              ],
            },
          ],
          parallel_tool_calls: true,
          previous_response_id: null,
          reasoning: {
            effort: null,
            summary: null,
          },
          store: true,
          temperature: 1,
          text: {
            format: {
              type: 'text',
            },
          },
          tool_choice: 'auto',
          tools: [],
          top_p: 1,
          truncation: 'disabled',
          usage: {
            input_tokens: 345,
            input_tokens_details: {
              cached_tokens: 234,
            },
            output_tokens: 538,
            output_tokens_details: {
              reasoning_tokens: 123,
            },
            total_tokens: 572,
          },
          user: null,
          metadata: {},
        });
      });

      it('should generate text', async () => {
        const result = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                },
              },
              "text": "answer text",
              "type": "text",
            },
          ]
        `);
      });

      it('should extract usage', async () => {
        const result = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.usage).toMatchInlineSnapshot(`
          {
            "cachedInputTokens": 234,
            "inputTokens": 345,
            "outputTokens": 538,
            "reasoningTokens": 123,
            "totalTokens": 883,
          }
        `);
      });

      it('should extract response id metadata ', async () => {
        const result = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.providerMetadata).toStrictEqual({
          openai: {
            responseId: 'resp_67c97c0203188190a025beb4a75242bc',
          },
        });
      });

      it('should send model id, settings, and input', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
          temperature: 0.5,
          topP: 0.3,
          providerOptions: {
            openai: {
              maxToolCalls: 10,
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": "You are a helpful assistant.",
                "role": "system",
              },
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "max_tool_calls": 10,
            "model": "gpt-4o",
            "temperature": 0.5,
            "top_p": 0.3,
          }
        `);

        expect(warnings).toStrictEqual([]);
      });

      it('should remove unsupported settings for o1', async () => {
        const { warnings } = await createModel('o1').doGenerate({
          prompt: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
          temperature: 0.5,
          topP: 0.3,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'o1',
          input: [
            { role: 'developer', content: 'You are a helpful assistant.' },
            {
              role: 'user',
              content: [{ type: 'input_text', text: 'Hello' }],
            },
          ],
        });

        expect(warnings).toStrictEqual([
          {
            details: 'temperature is not supported for reasoning models',
            feature: 'temperature',
            type: 'unsupported',
          },
          {
            details: 'topP is not supported for reasoning models',
            feature: 'topP',
            type: 'unsupported',
          },
        ]);
      });

      it.each(openaiResponsesReasoningModelIds)(
        'should remove and warn about unsupported settings for reasoning model %s',
        async modelId => {
          const { warnings } = await createModel(modelId).doGenerate({
            prompt: [
              { role: 'system', content: 'You are a helpful assistant.' },
              { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
            ],
            temperature: 0.5,
            topP: 0.3,
          });

          const expectedMessages = [
            {
              role: 'developer',
              content: 'You are a helpful assistant.',
            },
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ];

          expect(await server.calls[0].requestBodyJson).toStrictEqual({
            model: modelId,
            input: expectedMessages,
          });

          expect(warnings).toStrictEqual([
            {
              details: 'temperature is not supported for reasoning models',
              feature: 'temperature',
              type: 'unsupported',
            },
            {
              details: 'topP is not supported for reasoning models',
              feature: 'topP',
              type: 'unsupported',
            },
          ]);
        },
      );

      it('should send response format json schema', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
            name: 'response',
            description: 'A response',
            schema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-4o",
            "text": {
              "format": {
                "description": "A response",
                "name": "response",
                "schema": {
                  "$schema": "http://json-schema.org/draft-07/schema#",
                  "additionalProperties": false,
                  "properties": {
                    "value": {
                      "type": "string",
                    },
                  },
                  "required": [
                    "value",
                  ],
                  "type": "object",
                },
                "strict": true,
                "type": "json_schema",
              },
            },
          }
        `);

        expect(warnings).toStrictEqual([]);
      });

      it('should send response format json object', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-4o",
            "text": {
              "format": {
                "type": "json_object",
              },
            },
          }
        `);

        expect(warnings).toStrictEqual([]);
      });

      it('should send parallelToolCalls provider option', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              parallelToolCalls: false,
            } satisfies OpenAIResponsesProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-4o",
            "parallel_tool_calls": false,
          }
        `);

        expect(warnings).toStrictEqual([]);
      });

      it('should send store = false provider option and opt into reasoning.encrypted_content for reasoning models', async () => {
        const { warnings } = await createModel('gpt-5-mini').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              store: false,
            } satisfies OpenAIResponsesProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "include": [
              "reasoning.encrypted_content",
            ],
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-5-mini",
            "store": false,
          }
        `);

        expect(warnings).toStrictEqual([]);
      });

      it('should send store = false provider option and not opt into reasoning.encrypted_content for non-reasoning models', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              store: false,
            } satisfies OpenAIResponsesProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-4o",
            "store": false,
          }
        `);

        expect(warnings).toStrictEqual([]);
      });

      it('should send store = true provider option without reasoning.encrypted_content', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              store: true,
            } satisfies OpenAIResponsesProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-4o",
            "store": true,
          }
        `);

        expect(warnings).toStrictEqual([]);
      });

      it('should send user provider option', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              user: 'user_123',
            } satisfies OpenAIResponsesProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-4o",
            "user": "user_123",
          }
        `);

        expect(warnings).toStrictEqual([]);
      });

      it('should send conversation provider option', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              conversation: 'conv_123',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          conversation: 'conv_123',
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should warn when both conversation and previousResponseId are provided', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              conversation: 'conv_123',
              previousResponseId: 'resp_123',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          conversation: 'conv_123',
          previous_response_id: 'resp_123',
        });

        expect(warnings).toStrictEqual([
          {
            type: 'unsupported',
            feature: 'conversation',
            details:
              'conversation and previousResponseId cannot be used together',
          },
        ]);
      });

      it('should send previous response id provider option', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              previousResponseId: 'resp_123',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          previous_response_id: 'resp_123',
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send metadata provider option', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              user: 'user_123',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          user: 'user_123',
        });

        expect(warnings).toStrictEqual([]);
      });

      it.each(openaiResponsesReasoningModelIds)(
        'should send reasoningEffort and reasoningSummary provider options for %s',
        async modelId => {
          const { warnings } = await createModel(modelId).doGenerate({
            prompt: TEST_PROMPT,
            providerOptions: {
              openai: {
                reasoningEffort: 'low',
                reasoningSummary: 'auto',
              } satisfies OpenAIResponsesProviderOptions,
            },
          });

          expect(await server.calls[0].requestBodyJson).toStrictEqual({
            model: modelId,
            input: [
              {
                role: 'user',
                content: [{ type: 'input_text', text: 'Hello' }],
              },
            ],
            reasoning: {
              effort: 'low',
              summary: 'auto',
            },
          });

          expect(warnings).toStrictEqual([]);
        },
      );

      it.each(nonReasoningModelIds)(
        'should not send and warn about unsupported reasoningEffort and reasoningSummary provider options for %s',
        async modelId => {
          const { warnings } = await createModel(modelId).doGenerate({
            prompt: TEST_PROMPT,
            providerOptions: {
              openai: {
                reasoningEffort: 'low',
              } satisfies OpenAIResponsesProviderOptions,
            },
          });

          expect(await server.calls[0].requestBodyJson).toStrictEqual({
            model: modelId,
            input: [
              {
                role: 'user',
                content: [{ type: 'input_text', text: 'Hello' }],
              },
            ],
          });

          expect(warnings).toStrictEqual([
            {
              type: 'unsupported',
              feature: 'reasoningEffort',
              details:
                'reasoningEffort is not supported for non-reasoning models',
            },
          ]);
        },
      );

      it('should send instructions provider option', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              instructions: 'You are a friendly assistant.',
            } satisfies OpenAIResponsesProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          instructions: 'You are a friendly assistant.',
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send include provider option', async () => {
        const { warnings } = await createModel('o3-mini').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              include: ['reasoning.encrypted_content'],
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'o3-mini',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          include: ['reasoning.encrypted_content'],
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send include provider option with multiple values', async () => {
        const { warnings } = await createModel('o3-mini').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              include: [
                'reasoning.encrypted_content',
                'file_search_call.results',
              ],
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'o3-mini',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          include: ['reasoning.encrypted_content', 'file_search_call.results'],
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send textVerbosity provider option', async () => {
        const { warnings } = await createModel('gpt-5').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              textVerbosity: 'low',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-5",
            "text": {
              "verbosity": "low",
            },
          }
        `);

        expect(warnings).toStrictEqual([]);
      });

      it('should send textVerbosity provider option', async () => {
        const { warnings } = await createModel('gpt-5').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              textVerbosity: 'medium',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-5",
            "text": {
              "verbosity": "medium",
            },
          }
        `);

        expect(warnings).toStrictEqual([]);
      });

      it('should send textVerbosity provider option', async () => {
        const { warnings } = await createModel('gpt-5').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              textVerbosity: 'high',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-5",
            "text": {
              "verbosity": "high",
            },
          }
        `);

        expect(warnings).toStrictEqual([]);
      });

      it('should send promptCacheKey provider option', async () => {
        const { warnings } = await createModel('gpt-5').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              promptCacheKey: 'test-cache-key-123',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-5',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          prompt_cache_key: 'test-cache-key-123',
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send promptCacheRetention provider option', async () => {
        const { warnings } = await createModel('gpt-5').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              promptCacheRetention: '24h',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-5',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          prompt_cache_retention: '24h',
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send safetyIdentifier provider option', async () => {
        const { warnings } = await createModel('gpt-5').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              safetyIdentifier: 'test-safety-identifier-123',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-5',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          safety_identifier: 'test-safety-identifier-123',
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send truncation auto provider option', async () => {
        const { warnings } = await createModel('gpt-5').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              truncation: 'auto',
            } satisfies OpenAIResponsesProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-5',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          truncation: 'auto',
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send truncation disabled provider option', async () => {
        const { warnings } = await createModel('gpt-5').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              truncation: 'disabled',
            } satisfies OpenAIResponsesProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-5',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          truncation: 'disabled',
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should not send truncation when not specified', async () => {
        const { warnings } = await createModel('gpt-5').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-5',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send logprobs provider option', async () => {
        const { warnings } = await createModel('gpt-5').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              logprobs: 5,
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-5',
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          top_logprobs: 5,
          include: ['message.output_text.logprobs'],
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send responseFormat json format', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          responseFormat: { type: 'json' },
          prompt: TEST_PROMPT,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          text: { format: { type: 'json_object' } },
          input: [
            { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should send responseFormat json_schema format', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          responseFormat: {
            type: 'json',
            name: 'response',
            description: 'A response',
            schema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
          prompt: TEST_PROMPT,
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-4o",
            "text": {
              "format": {
                "description": "A response",
                "name": "response",
                "schema": {
                  "$schema": "http://json-schema.org/draft-07/schema#",
                  "additionalProperties": false,
                  "properties": {
                    "value": {
                      "type": "string",
                    },
                  },
                  "required": [
                    "value",
                  ],
                  "type": "object",
                },
                "strict": true,
                "type": "json_schema",
              },
            },
          }
        `);

        expect(warnings).toStrictEqual([]);
      });

      it('should send responseFormat json_schema format with strictJsonSchema false', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          responseFormat: {
            type: 'json',
            name: 'response',
            description: 'A response',
            schema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              strictJsonSchema: false,
            } satisfies OpenAIResponsesProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'gpt-4o',
          text: {
            format: {
              type: 'json_schema',
              strict: false,
              name: 'response',
              description: 'A response',
              schema: {
                type: 'object',
                properties: { value: { type: 'string' } },
                required: ['value'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          },
          input: [
            {
              role: 'user',
              content: [{ type: 'input_text', text: 'Hello' }],
            },
          ],
        });

        expect(warnings).toStrictEqual([]);
      });

      it('should warn about unsupported settings', async () => {
        const { warnings } = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          stopSequences: ['\n\n'],
          topK: 0.1,
          presencePenalty: 0,
          frequencyPenalty: 0,
          seed: 42,
        });

        expect(warnings).toMatchInlineSnapshot(`
          [
            {
              "feature": "topK",
              "type": "unsupported",
            },
            {
              "feature": "seed",
              "type": "unsupported",
            },
            {
              "feature": "presencePenalty",
              "type": "unsupported",
            },
            {
              "feature": "frequencyPenalty",
              "type": "unsupported",
            },
            {
              "feature": "stopSequences",
              "type": "unsupported",
            },
          ]
        `);
      });

      it('should extract logprobs in providerMetadata', async () => {
        prepareJsonResponse({
          id: 'resp_67c97c0203188190a025beb4a75242bc',
          object: 'response',
          created_at: 1741257730,
          status: 'completed',
          error: null,
          incomplete_details: null,
          input: [],
          instructions: null,
          max_output_tokens: null,
          model: 'gpt-4o-2024-07-18',
          output: [
            {
              id: 'msg_67c97c02656c81908e080dfdf4a03cd1',
              type: 'message',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'answer text',
                  annotations: [],
                  logprobs: [
                    {
                      token: 'Hello',
                      logprob: -0.0009994634,
                      top_logprobs: [
                        {
                          token: 'Hello',
                          logprob: -0.0009994634,
                        },
                        {
                          token: 'Hi',
                          logprob: -0.2,
                        },
                      ],
                    },
                    {
                      token: '!',
                      logprob: -0.13410144,
                      top_logprobs: [
                        {
                          token: '!',
                          logprob: -0.13410144,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          parallel_tool_calls: true,
          previous_response_id: null,
          reasoning: {
            effort: null,
            summary: null,
          },
          store: true,
          temperature: 1,
          text: {
            format: {
              type: 'text',
            },
          },
          tool_choice: 'auto',
          tools: [],
          top_p: 1,
          truncation: 'disabled',
          usage: {
            input_tokens: 345,
            input_tokens_details: {
              cached_tokens: 234,
            },
            output_tokens: 538,
            output_tokens_details: {
              reasoning_tokens: 123,
            },
            total_tokens: 572,
          },
          user: null,
          metadata: {},
        });

        const result = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              logprobs: 2,
            },
          },
        });

        expect(result.providerMetadata?.openai.logprobs).toMatchInlineSnapshot(`
          [
            [
              {
                "logprob": -0.0009994634,
                "token": "Hello",
                "top_logprobs": [
                  {
                    "logprob": -0.0009994634,
                    "token": "Hello",
                  },
                  {
                    "logprob": -0.2,
                    "token": "Hi",
                  },
                ],
              },
              {
                "logprob": -0.13410144,
                "token": "!",
                "top_logprobs": [
                  {
                    "logprob": -0.13410144,
                    "token": "!",
                  },
                ],
              },
            ],
          ]
        `);
      });
    });

    describe('errors', () => {
      it('should throw an error', async () => {
        prepareJsonFixtureResponse('openai-error.1');

        expect(
          createModel('gpt-4o').doGenerate({
            prompt: TEST_PROMPT,
          }),
        ).rejects.toThrow(
          'You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.',
        );
      });
    });

    describe('reasoning', () => {
      it('should handle reasoning with summary', async () => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'json-value',
          body: {
            id: 'resp_67c97c0203188190a025beb4a75242bc',
            object: 'response',
            created_at: 1741257730,
            status: 'completed',
            error: null,
            incomplete_details: null,
            input: [],
            instructions: null,
            max_output_tokens: null,
            model: 'o3-mini-2025-01-31',
            output: [
              {
                id: 'rs_6808709f6fcc8191ad2e2fdd784017b3',
                type: 'reasoning',
                summary: [
                  {
                    type: 'summary_text',
                    text: '**Exploring burrito origins**\n\nThe user is curious about the debate regarding Taqueria La Cumbre and El Farolito.',
                  },
                  {
                    type: 'summary_text',
                    text: "**Investigating burrito origins**\n\nThere's a fascinating debate about who created the Mission burrito.",
                  },
                ],
              },
              {
                id: 'msg_67c97c02656c81908e080dfdf4a03cd1',
                type: 'message',
                status: 'completed',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text: 'answer text',
                    annotations: [],
                  },
                ],
              },
            ],
            parallel_tool_calls: true,
            previous_response_id: null,
            reasoning: {
              effort: 'low',
              summary: 'auto',
            },
            store: true,
            temperature: 1,
            text: {
              format: {
                type: 'text',
              },
            },
            tool_choice: 'auto',
            tools: [],
            top_p: 1,
            truncation: 'disabled',
            usage: {
              input_tokens: 34,
              input_tokens_details: {
                cached_tokens: 0,
              },
              output_tokens: 538,
              output_tokens_details: {
                reasoning_tokens: 320,
              },
              total_tokens: 572,
            },
            user: null,
            metadata: {},
          },
        };

        const result = await createModel('o3-mini').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              reasoningEffort: 'low',
              reasoningSummary: 'auto',
            },
          },
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  "reasoningEncryptedContent": null,
                },
              },
              "text": "**Exploring burrito origins**

          The user is curious about the debate regarding Taqueria La Cumbre and El Farolito.",
              "type": "reasoning",
            },
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  "reasoningEncryptedContent": null,
                },
              },
              "text": "**Investigating burrito origins**

          There's a fascinating debate about who created the Mission burrito.",
              "type": "reasoning",
            },
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                },
              },
              "text": "answer text",
              "type": "text",
            },
          ]
        `);

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          model: 'o3-mini',
          reasoning: {
            effort: 'low',
            summary: 'auto',
          },
        });
      });

      it('should handle reasoning with empty summary', async () => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'json-value',
          body: {
            id: 'resp_67c97c0203188190a025beb4a75242bc',
            object: 'response',
            created_at: 1741257730,
            status: 'completed',
            error: null,
            incomplete_details: null,
            input: [],
            instructions: null,
            max_output_tokens: null,
            model: 'o3-mini-2025-01-31',
            output: [
              {
                id: 'rs_6808709f6fcc8191ad2e2fdd784017b3',
                type: 'reasoning',
                summary: [],
              },
              {
                id: 'msg_67c97c02656c81908e080dfdf4a03cd1',
                type: 'message',
                status: 'completed',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text: 'answer text',
                    annotations: [],
                  },
                ],
              },
            ],
            parallel_tool_calls: true,
            previous_response_id: null,
            reasoning: {
              effort: 'low',
              summary: 'auto',
            },
            store: true,
            temperature: 1,
            text: {
              format: {
                type: 'text',
              },
            },
            tool_choice: 'auto',
            tools: [],
            top_p: 1,
            truncation: 'disabled',
            usage: {
              input_tokens: 34,
              input_tokens_details: {
                cached_tokens: 0,
              },
              output_tokens: 538,
              output_tokens_details: {
                reasoning_tokens: 320,
              },
              total_tokens: 572,
            },
            user: null,
            metadata: {},
          },
        };

        const result = await createModel('o3-mini').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              reasoningEffort: 'low',
              reasoningSummary: null,
            },
          },
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  "reasoningEncryptedContent": null,
                },
              },
              "text": "",
              "type": "reasoning",
            },
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                },
              },
              "text": "answer text",
              "type": "text",
            },
          ]
        `);

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          model: 'o3-mini',
          reasoning: {
            effort: 'low',
          },
        });
      });

      it('should handle encrypted content with summary', async () => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'json-value',
          body: {
            id: 'resp_67c97c0203188190a025beb4a75242bc',
            object: 'response',
            created_at: 1741257730,
            status: 'completed',
            error: null,
            incomplete_details: null,
            input: [],
            instructions: null,
            max_output_tokens: null,
            model: 'o3-mini-2025-01-31',
            output: [
              {
                id: 'rs_6808709f6fcc8191ad2e2fdd784017b3',
                type: 'reasoning',
                encrypted_content: 'encrypted_reasoning_data_abc123',
                summary: [
                  {
                    type: 'summary_text',
                    text: '**Exploring burrito origins**\n\nThe user is curious about the debate regarding Taqueria La Cumbre and El Farolito.',
                  },
                  {
                    type: 'summary_text',
                    text: "**Investigating burrito origins**\n\nThere's a fascinating debate about who created the Mission burrito.",
                  },
                ],
              },
              {
                id: 'msg_67c97c02656c81908e080dfdf4a03cd1',
                type: 'message',
                status: 'completed',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text: 'answer text',
                    annotations: [],
                  },
                ],
              },
            ],
            parallel_tool_calls: true,
            previous_response_id: null,
            reasoning: {
              effort: 'low',
              summary: 'auto',
            },
            store: true,
            temperature: 1,
            text: {
              format: {
                type: 'text',
              },
            },
            tool_choice: 'auto',
            tools: [],
            top_p: 1,
            truncation: 'disabled',
            usage: {
              input_tokens: 34,
              input_tokens_details: {
                cached_tokens: 0,
              },
              output_tokens: 538,
              output_tokens_details: {
                reasoning_tokens: 320,
              },
              total_tokens: 572,
            },
            user: null,
            metadata: {},
          },
        };

        const result = await createModel('o3-mini').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              reasoningEffort: 'low',
              reasoningSummary: 'auto',
              include: ['reasoning.encrypted_content'],
            },
          },
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  "reasoningEncryptedContent": "encrypted_reasoning_data_abc123",
                },
              },
              "text": "**Exploring burrito origins**

          The user is curious about the debate regarding Taqueria La Cumbre and El Farolito.",
              "type": "reasoning",
            },
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  "reasoningEncryptedContent": "encrypted_reasoning_data_abc123",
                },
              },
              "text": "**Investigating burrito origins**

          There's a fascinating debate about who created the Mission burrito.",
              "type": "reasoning",
            },
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                },
              },
              "text": "answer text",
              "type": "text",
            },
          ]
        `);

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          model: 'o3-mini',
          reasoning: {
            effort: 'low',
            summary: 'auto',
          },
          include: ['reasoning.encrypted_content'],
        });
      });

      it('should handle encrypted content with empty summary', async () => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'json-value',
          body: {
            id: 'resp_67c97c0203188190a025beb4a75242bc',
            object: 'response',
            created_at: 1741257730,
            status: 'completed',
            error: null,
            incomplete_details: null,
            input: [],
            instructions: null,
            max_output_tokens: null,
            model: 'o3-mini-2025-01-31',
            output: [
              {
                id: 'rs_6808709f6fcc8191ad2e2fdd784017b3',
                type: 'reasoning',
                encrypted_content: 'encrypted_reasoning_data_abc123',
                summary: [],
              },
              {
                id: 'msg_67c97c02656c81908e080dfdf4a03cd1',
                type: 'message',
                status: 'completed',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text: 'answer text',
                    annotations: [],
                  },
                ],
              },
            ],
            parallel_tool_calls: true,
            previous_response_id: null,
            reasoning: {
              effort: 'low',
              summary: 'auto',
            },
            store: true,
            temperature: 1,
            text: {
              format: {
                type: 'text',
              },
            },
            tool_choice: 'auto',
            tools: [],
            top_p: 1,
            truncation: 'disabled',
            usage: {
              input_tokens: 34,
              input_tokens_details: {
                cached_tokens: 0,
              },
              output_tokens: 538,
              output_tokens_details: {
                reasoning_tokens: 320,
              },
              total_tokens: 572,
            },
            user: null,
            metadata: {},
          },
        };

        const result = await createModel('o3-mini').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              reasoningEffort: 'low',
              reasoningSummary: null,
              include: ['reasoning.encrypted_content'],
            },
          },
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  "reasoningEncryptedContent": "encrypted_reasoning_data_abc123",
                },
              },
              "text": "",
              "type": "reasoning",
            },
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                },
              },
              "text": "answer text",
              "type": "text",
            },
          ]
        `);

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          model: 'o3-mini',
          reasoning: {
            effort: 'low',
          },
          include: ['reasoning.encrypted_content'],
        });
      });

      it('should handle multiple reasoning blocks', async () => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'json-value',
          body: {
            id: 'resp_67c97c0203188190a025beb4a75242bc',
            object: 'response',
            created_at: 1741257730,
            status: 'completed',
            error: null,
            incomplete_details: null,
            input: [],
            instructions: null,
            max_output_tokens: null,
            model: 'o3-mini-2025-01-31',
            output: [
              {
                id: 'rs_first_6808709f6fcc8191ad2e2fdd784017b3',
                type: 'reasoning',
                summary: [
                  {
                    type: 'summary_text',
                    text: '**Initial analysis**\n\nFirst reasoning block: analyzing the problem structure.',
                  },
                  {
                    type: 'summary_text',
                    text: '**Deeper consideration**\n\nLet me think about the various approaches available.',
                  },
                ],
              },
              {
                id: 'msg_67c97c02656c81908e080dfdf4a03cd1',
                type: 'message',
                status: 'completed',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text: 'Let me think about this step by step.',
                    annotations: [],
                  },
                ],
              },
              {
                id: 'rs_second_7908809g7gcc9291be3e3fee895028c4',
                type: 'reasoning',
                summary: [
                  {
                    type: 'summary_text',
                    text: 'Second reasoning block: considering alternative approaches.',
                  },
                ],
              },
              {
                id: 'msg_final_78d08d03767d92908f25523f5ge51e77',
                type: 'message',
                status: 'completed',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text: 'Based on my analysis, here is the solution.',
                    annotations: [],
                  },
                ],
              },
            ],
            parallel_tool_calls: true,
            previous_response_id: null,
            reasoning: {
              effort: 'medium',
              summary: 'auto',
            },
            store: true,
            temperature: null,
            text: {
              format: {
                type: 'text',
              },
            },
            tool_choice: 'auto',
            tools: [],
            top_p: null,
            truncation: 'disabled',
            usage: {
              input_tokens: 45,
              input_tokens_details: {
                cached_tokens: 0,
              },
              output_tokens: 628,
              output_tokens_details: {
                reasoning_tokens: 420,
              },
              total_tokens: 673,
            },
            user: null,
            metadata: {},
          },
        };

        const result = await createModel('o3-mini').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              reasoningEffort: 'medium',
              reasoningSummary: 'auto',
            },
          },
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "rs_first_6808709f6fcc8191ad2e2fdd784017b3",
                  "reasoningEncryptedContent": null,
                },
              },
              "text": "**Initial analysis**

          First reasoning block: analyzing the problem structure.",
              "type": "reasoning",
            },
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "rs_first_6808709f6fcc8191ad2e2fdd784017b3",
                  "reasoningEncryptedContent": null,
                },
              },
              "text": "**Deeper consideration**

          Let me think about the various approaches available.",
              "type": "reasoning",
            },
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                },
              },
              "text": "Let me think about this step by step.",
              "type": "text",
            },
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "rs_second_7908809g7gcc9291be3e3fee895028c4",
                  "reasoningEncryptedContent": null,
                },
              },
              "text": "Second reasoning block: considering alternative approaches.",
              "type": "reasoning",
            },
            {
              "providerMetadata": {
                "openai": {
                  "itemId": "msg_final_78d08d03767d92908f25523f5ge51e77",
                },
              },
              "text": "Based on my analysis, here is the solution.",
              "type": "text",
            },
          ]
        `);

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          model: 'o3-mini',
          reasoning: {
            effort: 'medium',
            summary: 'auto',
          },
        });
      });
    });

    describe('tool calls', () => {
      beforeEach(() => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'json-value',
          body: {
            id: 'resp_67c97c0203188190a025beb4a75242bc',
            object: 'response',
            created_at: 1741257730,
            status: 'completed',
            error: null,
            incomplete_details: null,
            input: [],
            instructions: null,
            max_output_tokens: null,
            model: 'gpt-4o-2024-07-18',
            output: [
              {
                type: 'function_call',
                id: 'fc_67caf7f4c1ec8190b27edfb5580cfd31',
                call_id: 'call_0NdsJqOS8N3J9l2p0p4WpYU9',
                name: 'weather',
                arguments: '{"location":"San Francisco"}',
                status: 'completed',
              },
              {
                type: 'function_call',
                id: 'fc_67caf7f5071c81908209c2909c77af05',
                call_id: 'call_gexo0HtjUfmAIW4gjNOgyrcr',
                name: 'cityAttractions',
                arguments: '{"city":"San Francisco"}',
                status: 'completed',
              },
            ],
            parallel_tool_calls: true,
            previous_response_id: null,
            reasoning: {
              effort: null,
              summary: null,
            },
            store: true,
            temperature: 1,
            text: {
              format: {
                type: 'text',
              },
            },
            tool_choice: 'auto',
            tools: [
              {
                type: 'function',
                description: 'Get the weather in a location',
                name: 'weather',
                parameters: {
                  type: 'object',
                  properties: {
                    location: {
                      type: 'string',
                      description: 'The location to get the weather for',
                    },
                  },
                  required: ['location'],
                  additionalProperties: false,
                },
                strict: true,
              },
              {
                type: 'function',
                description: null,
                name: 'cityAttractions',
                parameters: {
                  type: 'object',
                  properties: {
                    city: {
                      type: 'string',
                    },
                  },
                  required: ['city'],
                  additionalProperties: false,
                },
                strict: true,
              },
            ],
            top_p: 1,
            truncation: 'disabled',
            usage: {
              input_tokens: 34,
              output_tokens: 538,
              output_tokens_details: {
                reasoning_tokens: 0,
              },
              total_tokens: 572,
            },
            user: null,
            metadata: {},
          },
        };
      });

      it('should generate tool calls', async () => {
        const result = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          tools: TEST_TOOLS,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "input": "{"location":"San Francisco"}",
              "providerMetadata": {
                "openai": {
                  "itemId": "fc_67caf7f4c1ec8190b27edfb5580cfd31",
                },
              },
              "toolCallId": "call_0NdsJqOS8N3J9l2p0p4WpYU9",
              "toolName": "weather",
              "type": "tool-call",
            },
            {
              "input": "{"city":"San Francisco"}",
              "providerMetadata": {
                "openai": {
                  "itemId": "fc_67caf7f5071c81908209c2909c77af05",
                },
              },
              "toolCallId": "call_gexo0HtjUfmAIW4gjNOgyrcr",
              "toolName": "cityAttractions",
              "type": "tool-call",
            },
          ]
        `);
      });

      it('should have tool-calls finish reason', async () => {
        const result = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          tools: TEST_TOOLS,
        });

        expect(result.finishReason).toStrictEqual('tool-calls');
      });
    });

    describe('code interpreter tool', () => {
      let result: Awaited<ReturnType<LanguageModelV3['doGenerate']>>;

      beforeEach(async () => {
        prepareJsonFixtureResponse('openai-code-interpreter-tool.1');

        result = await createModel('gpt-5-nano').doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.code_interpreter',
              name: 'codeExecution',
              args: {},
            },
          ],
        });
      });

      it('should send request body with include and tool', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "include": [
              "code_interpreter_call.outputs",
            ],
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-5-nano",
            "tools": [
              {
                "container": {
                  "type": "auto",
                },
                "type": "code_interpreter",
              },
            ],
          }
        `);
      });

      it('should include code interpreter tool call, result, and annotations in content', async () => {
        expect(result.content).toMatchSnapshot();

        const sources = result.content.filter(
          (part): part is Extract<LanguageModelV3Content, { type: 'source' }> =>
            part.type === 'source',
        );

        expect(sources).toHaveLength(1);
        expect(sources).toEqual([
          expect.objectContaining({
            type: 'source',
            sourceType: 'document',
            id: 'id-0',
            filename: 'two_dice_sums_10000.txt',
            mediaType: 'text/plain',
            providerMetadata: {
              openai: expect.objectContaining({
                fileId: 'cfile_6903bf45e3288191af3d56e6d23c3a4d',
                containerId:
                  'cntr_6903bf2c0470819090b2b1e63e0b66800c139a5d654a42ec',
              }),
            },
          }),
        ]);
      });
    });

    describe('image generation tool', () => {
      let result: Awaited<ReturnType<LanguageModelV3['doGenerate']>>;

      beforeEach(async () => {
        prepareJsonFixtureResponse('openai-image-generation-tool.1');

        result = await createModel('gpt-5-nano').doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.image_generation',
              name: 'generateImage',
              args: {
                outputFormat: 'webp',
                quality: 'low',
                size: '1024x1024',
                partialImages: 2,
              },
            },
          ],
        });
      });

      it('should send request body with include and tool', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-5-nano",
            "tools": [
              {
                "output_format": "webp",
                "partial_images": 2,
                "quality": "low",
                "size": "1024x1024",
                "type": "image_generation",
              },
            ],
          }
        `);
      });

      it('should include generate image tool call and result in content', async () => {
        expect(result.content).toMatchSnapshot();
      });
    });

    describe('local shell tool', () => {
      let result: Awaited<ReturnType<LanguageModelV3['doGenerate']>>;

      beforeEach(async () => {
        prepareJsonFixtureResponse('openai-local-shell-tool.1');

        result = await createModel('gpt-5-codex').doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.local_shell',
              name: 'shell',
              args: {},
            },
          ],
        });
      });

      it('should send request body with include and tool', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-5-codex",
            "tools": [
              {
                "type": "local_shell",
              },
            ],
          }
        `);
      });

      it('should include generate image tool call and result in content', async () => {
        expect(result.content).toMatchSnapshot();
      });
    });

    describe('web search tool', () => {
      let result: Awaited<ReturnType<LanguageModelV3['doGenerate']>>;

      beforeEach(async () => {
        prepareJsonFixtureResponse('openai-web-search-tool.1');

        result = await createModel('gpt-5-nano').doGenerate({
          tools: [
            {
              type: 'provider',
              id: 'openai.web_search',
              name: 'webSearch',
              args: {},
            },
          ],
          prompt: TEST_PROMPT,
        });
      });

      it('should send request body with include and tool', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "include": [
              "web_search_call.action.sources",
            ],
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-5-nano",
            "tools": [
              {
                "type": "web_search",
              },
            ],
          }
        `);
      });

      it('should include web search tool call and result in content', async () => {
        expect(result.content).toMatchSnapshot();
      });
    });

    describe('web search sources schema resilience', () => {
      it('should accept api-type sources without throwing', async () => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'json-value',
          body: {
            id: 'resp_api_sources',
            object: 'response',
            created_at: 1741631111,
            status: 'completed',
            error: null,
            incomplete_details: null,
            instructions: null,
            max_output_tokens: null,
            model: 'gpt-4o',
            output: [
              {
                type: 'web_search_call',
                id: 'ws_api_sources',
                status: 'completed',
                action: {
                  type: 'search',
                  query: 'current price of BTC',
                  sources: [
                    {
                      type: 'url',
                      url: 'https://example.com?a=1&utm_source=openai',
                    },
                    { type: 'api', name: 'oai-finance' },
                  ],
                },
              },
              {
                type: 'message',
                id: 'msg_done',
                status: 'completed',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text: 'BTC is trading at ...',
                    annotations: [],
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              total_tokens: 15,
            },
            previous_response_id: null,
            parallel_tool_calls: true,
            reasoning: { effort: null, summary: null },
            store: true,
            temperature: 0,
            text: { format: { type: 'text' } },
            tool_choice: 'auto',
            tools: [{ type: 'web_search', search_context_size: 'medium' }],
            top_p: 1,
            truncation: 'disabled',
            user: null,
            metadata: {},
          },
        };

        const result = await createModel('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.web_search',
              name: 'webSearch',
              args: {},
            },
          ],
        });

        expect(result.content).toMatchSnapshot();
      });
    });

    describe('mcp tool', () => {
      let result: Awaited<ReturnType<LanguageModelV3['doGenerate']>>;

      beforeEach(async () => {
        prepareJsonFixtureResponse('openai-mcp-tool.1');

        result = await createModel('gpt-5-mini').doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.mcp',
              name: 'MCP',
              args: {
                serverLabel: 'dmcp',
                serverUrl: 'https://mcp.exa.ai/mcp',
                serverDescription: 'A web-search API for AI agents',
              },
            },
          ],
        });
      });

      it('should send request body with tool', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-5-mini",
            "tools": [
              {
                "require_approval": "never",
                "server_description": "A web-search API for AI agents",
                "server_label": "dmcp",
                "server_url": "https://mcp.exa.ai/mcp",
                "type": "mcp",
              },
            ],
          }
        `);
      });

      it('should include mcp tool call and result in content', async () => {
        expect(result.content).toMatchSnapshot();
      });
    });

    describe('file search tool', () => {
      let result: Awaited<ReturnType<LanguageModelV3['doGenerate']>>;

      describe('without results include', () => {
        beforeEach(async () => {
          prepareJsonFixtureResponse('openai-file-search-tool.1');

          result = await createModel('gpt-5-nano').doGenerate({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider',
                id: 'openai.file_search',
                name: 'fileSearch',
                args: {
                  vectorStoreIds: ['vs_68caad8bd5d88191ab766cf043d89a18'],
                  maxNumResults: 5,
                  filters: {
                    key: 'author',
                    type: 'eq',
                    value: 'Jane Smith',
                  },
                  ranking: {
                    ranker: 'auto',
                    scoreThreshold: 0.5,
                  },
                },
              },
            ],
          });
        });

        it('should send request body with tool', async () => {
          expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "gpt-5-nano",
            "tools": [
              {
                "filters": {
                  "key": "author",
                  "type": "eq",
                  "value": "Jane Smith",
                },
                "max_num_results": 5,
                "ranking_options": {
                  "ranker": "auto",
                  "score_threshold": 0.5,
                },
                "type": "file_search",
                "vector_store_ids": [
                  "vs_68caad8bd5d88191ab766cf043d89a18",
                ],
              },
            ],
          }
        `);
        });

        it('should include file search tool call and result in content', async () => {
          expect(result.content).toMatchSnapshot();
        });
      });

      describe('with results include', () => {
        beforeEach(async () => {
          prepareJsonFixtureResponse('openai-file-search-tool.2');

          result = await createModel('gpt-5-nano').doGenerate({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider',
                id: 'openai.file_search',
                name: 'fileSearch',
                args: {
                  vectorStoreIds: ['vs_68caad8bd5d88191ab766cf043d89a18'],
                  maxNumResults: 5,
                  filters: {
                    key: 'author',
                    type: 'eq',
                    value: 'Jane Smith',
                  },
                  ranking: {
                    ranker: 'auto',
                    scoreThreshold: 0.5,
                  },
                },
              },
            ],
            providerOptions: {
              openai: {
                include: ['file_search_call.results'],
              },
            },
          });
        });

        it('should send request body with tool', async () => {
          expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
            {
              "include": [
                "file_search_call.results",
              ],
              "input": [
                {
                  "content": [
                    {
                      "text": "Hello",
                      "type": "input_text",
                    },
                  ],
                  "role": "user",
                },
              ],
              "model": "gpt-5-nano",
              "tools": [
                {
                  "filters": {
                    "key": "author",
                    "type": "eq",
                    "value": "Jane Smith",
                  },
                  "max_num_results": 5,
                  "ranking_options": {
                    "ranker": "auto",
                    "score_threshold": 0.5,
                  },
                  "type": "file_search",
                  "vector_store_ids": [
                    "vs_68caad8bd5d88191ab766cf043d89a18",
                  ],
                },
              ],
            }
          `);
        });

        it('should include file search tool call and result in content', async () => {
          expect(result.content).toMatchSnapshot();
        });
      });
    });

    describe('apply_patch tool', () => {
      let result: Awaited<ReturnType<LanguageModelV3['doGenerate']>>;

      describe('create_file operation', () => {
        beforeEach(async () => {
          prepareJsonFixtureResponse('openai-apply-patch-tool.1');

          result = await createModel('gpt-5.1-2025-11-13').doGenerate({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider',
                id: 'openai.apply_patch',
                name: 'apply_patch',
                args: {},
              },
            ],
          });
        });

        it('should send request body with tool', async () => {
          expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
            {
              "input": [
                {
                  "content": [
                    {
                      "text": "Hello",
                      "type": "input_text",
                    },
                  ],
                  "role": "user",
                },
              ],
              "model": "gpt-5.1-2025-11-13",
              "tools": [
                {
                  "type": "apply_patch",
                },
              ],
            }
          `);
        });

        it('should include apply_patch tool call and result in content', async () => {
          expect(result.content).toMatchSnapshot();
        });
      });
    });

    it('should handle computer use tool calls', async () => {
      function prepareJsonResponse(body: any) {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'json-value',
          body,
        };
      }
      prepareJsonResponse({
        id: 'resp_computer_test',
        object: 'response',
        created_at: 1741630255,
        status: 'completed',
        error: null,
        incomplete_details: null,
        instructions: null,
        max_output_tokens: null,
        model: 'gpt-4o-mini',
        output: [
          {
            type: 'computer_call',
            id: 'computer_67cf2b3051e88190b006770db6fdb13d',
            status: 'completed',
          },
          {
            type: 'message',
            id: 'msg_computer_test',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: "I've completed the computer task.",
                annotations: [],
              },
            ],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const result = await createModel('gpt-4o-mini').doGenerate({
        prompt: [
          {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: 'Use the computer to complete a task.',
              },
            ],
          },
        ],
        tools: [
          {
            type: 'provider',
            id: 'openai.computer_use',
            name: 'computerUse',
            args: {},
          },
        ],
      });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "input": "",
            "providerExecuted": true,
            "toolCallId": "computer_67cf2b3051e88190b006770db6fdb13d",
            "toolName": "computer_use",
            "type": "tool-call",
          },
          {
            "result": {
              "status": "completed",
              "type": "computer_use_tool_result",
            },
            "toolCallId": "computer_67cf2b3051e88190b006770db6fdb13d",
            "toolName": "computer_use",
            "type": "tool-result",
          },
          {
            "providerMetadata": {
              "openai": {
                "itemId": "msg_computer_test",
              },
            },
            "text": "I've completed the computer task.",
            "type": "text",
          },
        ]
      `);
    });

    it('should handle mixed url_citation and file_citation annotations', async () => {
      prepareJsonResponse({
        id: 'resp_123',
        object: 'response',
        created_at: 1234567890,
        status: 'completed',
        error: null,
        incomplete_details: null,
        input: [],
        instructions: null,
        max_output_tokens: null,
        model: 'gpt-4o',
        output: [
          {
            id: 'msg_123',
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Based on web search and file content.',
                annotations: [
                  {
                    type: 'url_citation',
                    start_index: 0,
                    end_index: 10,
                    url: 'https://example.com',
                    title: 'Example URL',
                  },
                  {
                    type: 'file_citation',
                    start_index: 20,
                    end_index: 30,
                    file_id: 'file-abc123',
                    quote: 'This is a quote from the file',
                  },
                ],
              },
            ],
          },
        ],
        parallel_tool_calls: true,
        previous_response_id: null,
        reasoning: { effort: null, summary: null },
        store: true,
        temperature: 0,
        text: { format: { type: 'text' } },
        tool_choice: 'auto',
        tools: [],
        top_p: 1,
        truncation: 'disabled',
        usage: {
          input_tokens: 100,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 50,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 150,
        },
        user: null,
        metadata: {},
      });

      const result = await createModel('gpt-4o').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "providerMetadata": {
              "openai": {
                "annotations": [
                  {
                    "end_index": 10,
                    "start_index": 0,
                    "title": "Example URL",
                    "type": "url_citation",
                    "url": "https://example.com",
                  },
                  {
                    "end_index": 30,
                    "file_id": "file-abc123",
                    "quote": "This is a quote from the file",
                    "start_index": 20,
                    "type": "file_citation",
                  },
                ],
                "itemId": "msg_123",
              },
            },
            "text": "Based on web search and file content.",
            "type": "text",
          },
          {
            "id": "id-0",
            "sourceType": "url",
            "title": "Example URL",
            "type": "source",
            "url": "https://example.com",
          },
          {
            "filename": "file-abc123",
            "id": "id-1",
            "mediaType": "text/plain",
            "providerMetadata": {
              "openai": {
                "fileId": "file-abc123",
              },
            },
            "sourceType": "document",
            "title": "This is a quote from the file",
            "type": "source",
          },
        ]
      `);
    });

    it('should handle file_citation annotations only', async () => {
      prepareJsonResponse({
        id: 'resp_456',
        object: 'response',
        created_at: 1234567890,
        status: 'completed',
        error: null,
        incomplete_details: null,
        input: [],
        instructions: null,
        max_output_tokens: null,
        model: 'gpt-4o',
        output: [
          {
            id: 'msg_456',
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Based on the file content.',
                annotations: [
                  {
                    type: 'file_citation',
                    start_index: 0,
                    end_index: 20,
                    file_id: 'file-xyz789',
                    quote: 'Important information from document',
                  },
                ],
              },
            ],
          },
        ],
        parallel_tool_calls: true,
        previous_response_id: null,
        reasoning: { effort: null, summary: null },
        store: true,
        temperature: 0,
        text: { format: { type: 'text' } },
        tool_choice: 'auto',
        tools: [],
        top_p: 1,
        truncation: 'disabled',
        usage: {
          input_tokens: 50,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 25,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 75,
        },
        user: null,
        metadata: {},
      });

      const result = await createModel('gpt-4o').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "providerMetadata": {
              "openai": {
                "annotations": [
                  {
                    "end_index": 20,
                    "file_id": "file-xyz789",
                    "quote": "Important information from document",
                    "start_index": 0,
                    "type": "file_citation",
                  },
                ],
                "itemId": "msg_456",
              },
            },
            "text": "Based on the file content.",
            "type": "text",
          },
          {
            "filename": "file-xyz789",
            "id": "id-0",
            "mediaType": "text/plain",
            "providerMetadata": {
              "openai": {
                "fileId": "file-xyz789",
              },
            },
            "sourceType": "document",
            "title": "Important information from document",
            "type": "source",
          },
        ]
      `);
    });

    it('should handle file_citation annotations without optional fields', async () => {
      prepareJsonResponse({
        id: 'resp_789',
        object: 'response',
        created_at: 1234567890,
        status: 'completed',
        error: null,
        incomplete_details: null,
        input: [],
        instructions: null,
        max_output_tokens: null,
        model: 'gpt-5',
        output: [
          {
            id: 'msg_789',
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Answer for the specified years....',
                annotations: [
                  {
                    type: 'file_citation',
                    file_id: 'file-YRcoCqn3Fo2K4JgraG',
                    filename: 'resource1.json',
                    index: 145,
                  },
                  {
                    type: 'file_citation',
                    file_id: 'file-YRcoCqn3Fo2K4JgraG',
                    filename: 'resource1.json',
                    index: 192,
                  },
                ],
              },
            ],
          },
        ],
        parallel_tool_calls: true,
        previous_response_id: null,
        reasoning: { effort: null, summary: null },
        store: true,
        temperature: 0,
        text: { format: { type: 'text' } },
        tool_choice: 'auto',
        tools: [],
        top_p: 1,
        truncation: 'disabled',
        usage: {
          input_tokens: 50,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 25,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 75,
        },
        user: null,
        metadata: {},
      });

      const result = await createModel('gpt-5').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "providerMetadata": {
              "openai": {
                "annotations": [
                  {
                    "file_id": "file-YRcoCqn3Fo2K4JgraG",
                    "filename": "resource1.json",
                    "index": 145,
                    "type": "file_citation",
                  },
                  {
                    "file_id": "file-YRcoCqn3Fo2K4JgraG",
                    "filename": "resource1.json",
                    "index": 192,
                    "type": "file_citation",
                  },
                ],
                "itemId": "msg_789",
              },
            },
            "text": "Answer for the specified years....",
            "type": "text",
          },
          {
            "filename": "resource1.json",
            "id": "id-0",
            "mediaType": "text/plain",
            "providerMetadata": {
              "openai": {
                "fileId": "file-YRcoCqn3Fo2K4JgraG",
              },
            },
            "sourceType": "document",
            "title": "resource1.json",
            "type": "source",
          },
          {
            "filename": "resource1.json",
            "id": "id-1",
            "mediaType": "text/plain",
            "providerMetadata": {
              "openai": {
                "fileId": "file-YRcoCqn3Fo2K4JgraG",
              },
            },
            "sourceType": "document",
            "title": "resource1.json",
            "type": "source",
          },
        ]
      `);
    });

    it('should handle container_file_citation annotations', async () => {
      prepareJsonResponse({
        id: 'resp_container',
        object: 'response',
        created_at: 1234567890,
        status: 'completed',
        error: null,
        incomplete_details: null,
        input: [],
        instructions: null,
        max_output_tokens: null,
        model: 'gpt-5',
        output: [
          {
            id: 'msg_container',
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Generated with container file.',
                annotations: [
                  {
                    type: 'container_file_citation',
                    container_id: 'cntr_test',
                    file_id: 'file-container',
                    filename: 'data.csv',
                    start_index: 0,
                    end_index: 10,
                    index: 2,
                  },
                ],
              },
            ],
          },
        ],
        parallel_tool_calls: true,
        previous_response_id: null,
        reasoning: { effort: null, summary: null },
        store: true,
        temperature: 0,
        text: { format: { type: 'text' } },
        tool_choice: 'auto',
        tools: [],
        top_p: 1,
        truncation: 'disabled',
        usage: {
          input_tokens: 10,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 5,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 15,
        },
        user: null,
        metadata: {},
      });

      const result = await createModel('gpt-5').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "providerMetadata": {
              "openai": {
                "annotations": [
                  {
                    "container_id": "cntr_test",
                    "end_index": 10,
                    "file_id": "file-container",
                    "filename": "data.csv",
                    "index": 2,
                    "start_index": 0,
                    "type": "container_file_citation",
                  },
                ],
                "itemId": "msg_container",
              },
            },
            "text": "Generated with container file.",
            "type": "text",
          },
          {
            "filename": "data.csv",
            "id": "id-0",
            "mediaType": "text/plain",
            "providerMetadata": {
              "openai": {
                "containerId": "cntr_test",
                "fileId": "file-container",
                "index": 2,
              },
            },
            "sourceType": "document",
            "title": "data.csv",
            "type": "source",
          },
        ]
      `);
    });

    it('should handle file_path annotations', async () => {
      prepareJsonResponse({
        id: 'resp_file_path',
        object: 'response',
        created_at: 1234567890,
        status: 'completed',
        error: null,
        incomplete_details: null,
        input: [],
        instructions: null,
        max_output_tokens: null,
        model: 'gpt-4o',
        output: [
          {
            id: 'msg_file_path',
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Output written to file.',
                annotations: [
                  {
                    type: 'file_path',
                    file_id: 'file-path-123',
                    index: 0,
                  },
                ],
              },
            ],
          },
        ],
        parallel_tool_calls: true,
        previous_response_id: null,
        reasoning: { effort: null, summary: null },
        store: true,
        temperature: 0,
        text: { format: { type: 'text' } },
        tool_choice: 'auto',
        tools: [],
        top_p: 1,
        truncation: 'disabled',
        usage: {
          input_tokens: 10,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 5,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 15,
        },
        user: null,
        metadata: {},
      });

      const result = await createModel('gpt-4o').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "providerMetadata": {
              "openai": {
                "annotations": [
                  {
                    "file_id": "file-path-123",
                    "index": 0,
                    "type": "file_path",
                  },
                ],
                "itemId": "msg_file_path",
              },
            },
            "text": "Output written to file.",
            "type": "text",
          },
          {
            "filename": "file-path-123",
            "id": "id-0",
            "mediaType": "application/octet-stream",
            "providerMetadata": {
              "openai": {
                "fileId": "file-path-123",
                "index": 0,
              },
            },
            "sourceType": "document",
            "title": "file-path-123",
            "type": "source",
          },
        ]
      `);
    });
  });

  describe('doStream', () => {
    it('should stream text deltas', async () => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.created","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0.3,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.in_progress","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0.3,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.output_item.added","output_index":0,"item":{"id":"msg_67c9a81dea8c8190b79651a2b3adf91e","type":"message","status":"in_progress","role":"assistant","content":[]}}\n\n`,
          `data:{"type":"response.content_part.added","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":0,"content_index":0,"part":{"type":"output_text","text":"","annotations":[],"logprobs": []}}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":0,"content_index":0,"delta":"Hello,","logprobs": []}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":0,"content_index":0,"delta":" World!","logprobs": []}\n\n`,
          `data:{"type":"response.output_text.done","item_id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","output_index":0,"content_index":0,"text":"Hello, World!"}\n\n`,
          `data:{"type":"response.content_part.done","item_id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","output_index":0,"content_index":0,"part":{"type":"output_text","text":"Hello, World!","annotations":[],"logprobs": []}}\n\n`,
          `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Hello, World!","annotations":[],"logprobs": []}]}}\n\n`,
          `data:{"type":"response.completed","response":{"id":"resp_67c9a878139c8190aa2e3105411b408b","object":"response","created_at":1741269112,"status":"completed","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[{"id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Hello, World!","annotations":[]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0.3,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":{"input_tokens":543,"input_tokens_details":{"cached_tokens":234},"output_tokens":478,"output_tokens_details":{"reasoning_tokens":123},"total_tokens":512},"user":null,"metadata":{}}}\n\n`,
        ],
      };

      const { stream } = await createModel('gpt-4o').doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "resp_67c9a81b6a048190a9ee441c5755a4e8",
            "modelId": "gpt-4o-2024-07-18",
            "timestamp": 2025-03-06T13:50:19.000Z,
            "type": "response-metadata",
          },
          {
            "id": "msg_67c9a81dea8c8190b79651a2b3adf91e",
            "providerMetadata": {
              "openai": {
                "itemId": "msg_67c9a81dea8c8190b79651a2b3adf91e",
              },
            },
            "type": "text-start",
          },
          {
            "delta": "Hello,",
            "id": "msg_67c9a81dea8c8190b79651a2b3adf91e",
            "type": "text-delta",
          },
          {
            "delta": " World!",
            "id": "msg_67c9a81dea8c8190b79651a2b3adf91e",
            "type": "text-delta",
          },
          {
            "id": "msg_67c9a8787f4c8190b49c858d4c1cf20c",
            "providerMetadata": {
              "openai": {
                "itemId": "msg_67c9a8787f4c8190b49c858d4c1cf20c",
              },
            },
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "openai": {
                "responseId": "resp_67c9a81b6a048190a9ee441c5755a4e8",
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 234,
              "inputTokens": 543,
              "outputTokens": 478,
              "reasoningTokens": 123,
              "totalTokens": 1021,
            },
          },
        ]
      `);
    });

    it('should send finish reason for incomplete response', async () => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.created","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0.3,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.in_progress","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0.3,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.output_item.added","output_index":0,"item":{"id":"msg_67c9a81dea8c8190b79651a2b3adf91e","type":"message","status":"in_progress","role":"assistant","content":[]}}\n\n`,
          `data:{"type":"response.content_part.added","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":0,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_67c9a81dea8c8190b79651a2b3adf91e","output_index":0,"content_index":0,"delta":"Hello,"}\n\n`,
          `data:{"type":"response.output_text.done","item_id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","output_index":0,"content_index":0,"text":"Hello,!"}\n\n`,
          `data:{"type":"response.content_part.done","item_id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","output_index":0,"content_index":0,"part":{"type":"output_text","text":"Hello,","annotations":[]}}\n\n`,
          `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"msg_67c9a8787f4c8190b49c858d4c1cf20c","type":"message","status":"incomplete","role":"assistant","content":[{"type":"output_text","text":"Hello,","annotations":[]}]}}\n\n`,
          `data:{"type":"response.incomplete","response":{"id":"resp_67cadb40a0708190ac2763c0b6960f6f","object":"response","created_at":1741347648,"status":"incomplete","error":null,"incomplete_details":{"reason":"max_output_tokens"},"instructions":null,"max_output_tokens":100,"model":"gpt-4o-2024-07-18","output":[{"type":"message","id":"msg_67cadb410ccc81909fe1d8f427b9cf02","status":"incomplete","role":"assistant","content":[{"type":"output_text","text":"Hello,","annotations":[]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":{"input_tokens":0,"input_tokens_details":{"cached_tokens":0},"output_tokens":0,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":0},"user":null,"metadata":{}}}\n\n`,
        ],
      };

      const { stream } = await createModel('gpt-4o').doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "resp_67c9a81b6a048190a9ee441c5755a4e8",
            "modelId": "gpt-4o-2024-07-18",
            "timestamp": 2025-03-06T13:50:19.000Z,
            "type": "response-metadata",
          },
          {
            "id": "msg_67c9a81dea8c8190b79651a2b3adf91e",
            "providerMetadata": {
              "openai": {
                "itemId": "msg_67c9a81dea8c8190b79651a2b3adf91e",
              },
            },
            "type": "text-start",
          },
          {
            "delta": "Hello,",
            "id": "msg_67c9a81dea8c8190b79651a2b3adf91e",
            "type": "text-delta",
          },
          {
            "id": "msg_67c9a8787f4c8190b49c858d4c1cf20c",
            "providerMetadata": {
              "openai": {
                "itemId": "msg_67c9a8787f4c8190b49c858d4c1cf20c",
              },
            },
            "type": "text-end",
          },
          {
            "finishReason": "length",
            "providerMetadata": {
              "openai": {
                "responseId": "resp_67c9a81b6a048190a9ee441c5755a4e8",
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 0,
              "inputTokens": 0,
              "outputTokens": 0,
              "reasoningTokens": 0,
              "totalTokens": 0,
            },
          },
        ]
      `);
    });

    it('should send streaming tool calls', async () => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.created","response":{"id":"resp_67cb13a755c08190acbe3839a49632fc","object":"response","created_at":1741362087,"status":"in_progress","error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[{"type":"function","description":"Get the current location.","name":"currentLocation","parameters":{"type":"object","properties":{},"additionalProperties":false},"strict":true},{"type":"function","description":"Get the weather in a location","name":"weather","parameters":{"type":"object","properties":{"location":{"type":"string","description":"The location to get the weather for"}},"required":["location"],"additionalProperties":false},"strict":true}],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.in_progress","response":{"id":"resp_67cb13a755c08190acbe3839a49632fc","object":"response","created_at":1741362087,"status":"in_progress","error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[{"type":"function","description":"Get the current location.","name":"currentLocation","parameters":{"type":"object","properties":{},"additionalProperties":false},"strict":true},{"type":"function","description":"Get the weather in a location","name":"weather","parameters":{"type":"object","properties":{"location":{"type":"string","description":"The location to get the weather for"}},"required":["location"],"additionalProperties":false},"strict":true}],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
          `data:{"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_67cb13a838088190be08eb3927c87501","call_id":"call_6KxSghkb4MVnunFH2TxPErLP","name":"currentLocation","arguments":"","status":"completed"}}\n\n`,
          `data:{"type":"response.function_call_arguments.delta","item_id":"fc_67cb13a838088190be08eb3927c87501","output_index":0,"delta":"{}"}\n\n`,
          `data:{"type":"response.function_call_arguments.done","item_id":"fc_67cb13a838088190be08eb3927c87501","output_index":0,"arguments":"{}"}\n\n`,
          `data:{"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","id":"fc_67cb13a838088190be08eb3927c87501","call_id":"call_pgjcAI4ZegMkP6bsAV7sfrJA","name":"currentLocation","arguments":"{}","status":"completed"}}\n\n`,
          `data:{"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","id":"fc_67cb13a858f081908a600343fa040f47","call_id":"call_Dg6WUmFHNeR5JxX1s53s1G4b","name":"weather","arguments":"","status":"in_progress"}}\n\n`,
          `data:{"type":"response.function_call_arguments.delta","item_id":"fc_67cb13a858f081908a600343fa040f47","output_index":1,"delta":"{"}\n\n`,
          `data:{"type":"response.function_call_arguments.delta","item_id":"fc_67cb13a858f081908a600343fa040f47","output_index":1,"delta":"\\"location"}\n\n`,
          `data:{"type":"response.function_call_arguments.delta","item_id":"fc_67cb13a858f081908a600343fa040f47","output_index":1,"delta":"\\":"}\n\n`,
          `data:{"type":"response.function_call_arguments.delta","item_id":"fc_67cb13a858f081908a600343fa040f47","output_index":1,"delta":"\\"Rome"}\n\n`,
          `data:{"type":"response.function_call_arguments.delta","item_id":"fc_67cb13a858f081908a600343fa040f47","output_index":1,"delta":"\\"}"}\n\n`,
          `data:{"type":"response.function_call_arguments.done","item_id":"fc_67cb13a858f081908a600343fa040f47","output_index":1,"arguments":"{\\"location\\":\\"Rome\\"}"}\n\n`,
          `data:{"type":"response.output_item.done","output_index":1,"item":{"type":"function_call","id":"fc_67cb13a858f081908a600343fa040f47","call_id":"call_X2PAkDJInno9VVnNkDrfhboW","name":"weather","arguments":"{\\"location\\":\\"Rome\\"}","status":"completed"}}\n\n`,
          `data:{"type":"response.completed","response":{"id":"resp_67cb13a755c08190acbe3839a49632fc","object":"response","created_at":1741362087,"status":"completed","error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"model":"gpt-4o-2024-07-18","output":[{"type":"function_call","id":"fc_67cb13a838088190be08eb3927c87501","call_id":"call_KsVqaVAf3alAtCCkQe4itE7W","name":"currentLocation","arguments":"{}","status":"completed"},{"type":"function_call","id":"fc_67cb13a858f081908a600343fa040f47","call_id":"call_X2PAkDJInno9VVnNkDrfhboW","name":"weather","arguments":"{\\"location\\":\\"Rome\\"}","status":"completed"}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[{"type":"function","description":"Get the current location.","name":"currentLocation","parameters":{"type":"object","properties":{},"additionalProperties":false},"strict":true},{"type":"function","description":"Get the weather in a location","name":"weather","parameters":{"type":"object","properties":{"location":{"type":"string","description":"The location to get the weather for"}},"required":["location"],"additionalProperties":false},"strict":true}],"top_p":1,"truncation":"disabled","usage":{"input_tokens":0,"input_tokens_details":{"cached_tokens":0},"output_tokens":0,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":0},"user":null,"metadata":{}}}\n\n`,
        ],
      };

      const { stream } = await createModel('gpt-4o').doStream({
        tools: TEST_TOOLS,
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "resp_67cb13a755c08190acbe3839a49632fc",
            "modelId": "gpt-4o-2024-07-18",
            "timestamp": 2025-03-07T15:41:27.000Z,
            "type": "response-metadata",
          },
          {
            "id": "call_6KxSghkb4MVnunFH2TxPErLP",
            "toolName": "currentLocation",
            "type": "tool-input-start",
          },
          {
            "delta": "{}",
            "id": "call_6KxSghkb4MVnunFH2TxPErLP",
            "type": "tool-input-delta",
          },
          {
            "id": "call_pgjcAI4ZegMkP6bsAV7sfrJA",
            "type": "tool-input-end",
          },
          {
            "input": "{}",
            "providerMetadata": {
              "openai": {
                "itemId": "fc_67cb13a838088190be08eb3927c87501",
              },
            },
            "toolCallId": "call_pgjcAI4ZegMkP6bsAV7sfrJA",
            "toolName": "currentLocation",
            "type": "tool-call",
          },
          {
            "id": "call_Dg6WUmFHNeR5JxX1s53s1G4b",
            "toolName": "weather",
            "type": "tool-input-start",
          },
          {
            "delta": "{",
            "id": "call_Dg6WUmFHNeR5JxX1s53s1G4b",
            "type": "tool-input-delta",
          },
          {
            "delta": ""location",
            "id": "call_Dg6WUmFHNeR5JxX1s53s1G4b",
            "type": "tool-input-delta",
          },
          {
            "delta": "":",
            "id": "call_Dg6WUmFHNeR5JxX1s53s1G4b",
            "type": "tool-input-delta",
          },
          {
            "delta": ""Rome",
            "id": "call_Dg6WUmFHNeR5JxX1s53s1G4b",
            "type": "tool-input-delta",
          },
          {
            "delta": ""}",
            "id": "call_Dg6WUmFHNeR5JxX1s53s1G4b",
            "type": "tool-input-delta",
          },
          {
            "id": "call_X2PAkDJInno9VVnNkDrfhboW",
            "type": "tool-input-end",
          },
          {
            "input": "{"location":"Rome"}",
            "providerMetadata": {
              "openai": {
                "itemId": "fc_67cb13a858f081908a600343fa040f47",
              },
            },
            "toolCallId": "call_X2PAkDJInno9VVnNkDrfhboW",
            "toolName": "weather",
            "type": "tool-call",
          },
          {
            "finishReason": "tool-calls",
            "providerMetadata": {
              "openai": {
                "responseId": "resp_67cb13a755c08190acbe3839a49632fc",
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 0,
              "inputTokens": 0,
              "outputTokens": 0,
              "reasoningTokens": 0,
              "totalTokens": 0,
            },
          },
        ]
      `);
    });

    it('Should handle service tier', async () => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          'data:{"type":"response.created","sequence_number":0,"response":{"id":"resp_68b08bfa71908196889e9ae5668b2ae40cd677a623b867d5","object":"response","created_at":1756400634,"status":"in_progress","background":false,"error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"max_tool_calls":null,"model":"gpt-5-nano-2025-08-07","output":[],"parallel_tool_calls":true,"previous_response_id":null,"prompt_cache_key":null,"reasoning":{"effort":"medium","summary":null},"safety_identifier":null,"service_tier":"flex","store":true,"temperature":1,"text":{"format":{"type":"text"},"verbosity":"medium"},"tool_choice":"auto","tools":[],"top_logprobs":0,"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n',
          'data:{"type":"response.in_progress","sequence_number":1,"response":{"id":"resp_68b08bfa71908196889e9ae5668b2ae40cd677a623b867d5","object":"response","created_at":1756400634,"status":"in_progress","background":false,"error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"max_tool_calls":null,"model":"gpt-5-nano-2025-08-07","output":[],"parallel_tool_calls":true,"previous_response_id":null,"prompt_cache_key":null,"reasoning":{"effort":"medium","summary":null},"safety_identifier":null,"service_tier":"flex","store":true,"temperature":1,"text":{"format":{"type":"text"},"verbosity":"medium"},"tool_choice":"auto","tools":[],"top_logprobs":0,"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n',
          'data:{"type":"response.output_item.added","sequence_number":2,"output_index":0,"item":{"id":"rs_68b08bfb9f3c819682c5cff6edee6e4d0cd677a623b867d5","type":"reasoning","summary":[]}}\n\n',
          'data:{"type":"response.output_item.done","sequence_number":3,"output_index":0,"item":{"id":"rs_68b08bfb9f3c819682c5cff6edee6e4d0cd677a623b867d5","type":"reasoning","summary":[]}}\n\n',
          'data:{"type":"response.output_item.added","sequence_number":4,"output_index":1,"item":{"id":"msg_68b08bfc9a548196b15465b6020b04e40cd677a623b867d5","type":"message","status":"in_progress","content":[],"role":"assistant"}}\n\n',
          'data:{"type":"response.content_part.added","sequence_number":5,"item_id":"msg_68b08bfc9a548196b15465b6020b04e40cd677a623b867d5","output_index":1,"content_index":0,"part":{"type":"output_text","annotations":[],"logprobs":[],"text":""}}\n\n',
          'data:{"type":"response.output_text.delta","sequence_number":6,"item_id":"msg_68b08bfc9a548196b15465b6020b04e40cd677a623b867d5","output_index":1,"content_index":0,"delta":"blue","logprobs":[],"obfuscation":"A3q16QVxivdK"}\n\n',
          'data:{"type":"response.output_text.done","sequence_number":7,"item_id":"msg_68b08bfc9a548196b15465b6020b04e40cd677a623b867d5","output_index":1,"content_index":0,"text":"blue","logprobs":[]}\n\n',
          'data:{"type":"response.content_part.done","sequence_number":8,"item_id":"msg_68b08bfc9a548196b15465b6020b04e40cd677a623b867d5","output_index":1,"content_index":0,"part":{"type":"output_text","annotations":[],"logprobs":[],"text":"blue"}}\n\n',
          'data:{"type":"response.output_item.done","sequence_number":9,"output_index":1,"item":{"id":"msg_68b08bfc9a548196b15465b6020b04e40cd677a623b867d5","type":"message","status":"completed","content":[{"type":"output_text","annotations":[],"logprobs":[],"text":"blue"}],"role":"assistant"}}\n\n',
          'data:{"type":"response.completed","sequence_number":10,"response":{"id":"resp_68b08bfa71908196889e9ae5668b2ae40cd677a623b867d5","object":"response","created_at":1756400634,"status":"completed","background":false,"error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"max_tool_calls":null,"model":"gpt-5-nano-2025-08-07","output":[{"id":"rs_68b08bfb9f3c819682c5cff6edee6e4d0cd677a623b867d5","type":"reasoning","summary":[]},{"id":"msg_68b08bfc9a548196b15465b6020b04e40cd677a623b867d5","type":"message","status":"completed","content":[{"type":"output_text","annotations":[],"logprobs":[],"text":"blue"}],"role":"assistant"}],"parallel_tool_calls":true,"previous_response_id":null,"prompt_cache_key":null,"reasoning":{"effort":"medium","summary":null},"safety_identifier":null,"service_tier":"flex","store":true,"temperature":1,"text":{"format":{"type":"text"},"verbosity":"medium"},"tool_choice":"auto","tools":[],"top_logprobs":0,"top_p":1,"truncation":"disabled","usage":{"input_tokens":15,"input_tokens_details":{"cached_tokens":0},"output_tokens":263,"output_tokens_details":{"reasoning_tokens":256},"total_tokens":278},"user":null,"metadata":{}}}\n\n',
        ],
      };

      const { stream } = await createModel('gpt-5-nano').doStream({
        prompt: TEST_PROMPT,
        providerOptions: {
          openai: {
            serviceTier: 'flex',
          },
        },
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "resp_68b08bfa71908196889e9ae5668b2ae40cd677a623b867d5",
            "modelId": "gpt-5-nano-2025-08-07",
            "timestamp": 2025-08-28T17:03:54.000Z,
            "type": "response-metadata",
          },
          {
            "id": "rs_68b08bfb9f3c819682c5cff6edee6e4d0cd677a623b867d5:0",
            "providerMetadata": {
              "openai": {
                "itemId": "rs_68b08bfb9f3c819682c5cff6edee6e4d0cd677a623b867d5",
                "reasoningEncryptedContent": null,
              },
            },
            "type": "reasoning-start",
          },
          {
            "id": "rs_68b08bfb9f3c819682c5cff6edee6e4d0cd677a623b867d5:0",
            "providerMetadata": {
              "openai": {
                "itemId": "rs_68b08bfb9f3c819682c5cff6edee6e4d0cd677a623b867d5",
                "reasoningEncryptedContent": null,
              },
            },
            "type": "reasoning-end",
          },
          {
            "id": "msg_68b08bfc9a548196b15465b6020b04e40cd677a623b867d5",
            "providerMetadata": {
              "openai": {
                "itemId": "msg_68b08bfc9a548196b15465b6020b04e40cd677a623b867d5",
              },
            },
            "type": "text-start",
          },
          {
            "delta": "blue",
            "id": "msg_68b08bfc9a548196b15465b6020b04e40cd677a623b867d5",
            "type": "text-delta",
          },
          {
            "id": "msg_68b08bfc9a548196b15465b6020b04e40cd677a623b867d5",
            "providerMetadata": {
              "openai": {
                "itemId": "msg_68b08bfc9a548196b15465b6020b04e40cd677a623b867d5",
              },
            },
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "openai": {
                "responseId": "resp_68b08bfa71908196889e9ae5668b2ae40cd677a623b867d5",
                "serviceTier": "flex",
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 0,
              "inputTokens": 15,
              "outputTokens": 263,
              "reasoningTokens": 256,
              "totalTokens": 278,
            },
          },
        ]
      `);
    });

    it('should handle logprobs', async () => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          'data:{"type":"response.created","sequence_number":0,"response":{"id":"resp_689cec4cf608819583c56813ccb0f5040f92af1765dd5aad","object":"response","created_at":1755114572,"status":"in_progress","background":false,"error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":1024,"max_tool_calls":null,"model":"gpt-4.1-nano-2025-04-14","output":[],"parallel_tool_calls":true,"previous_response_id":null,"prompt_cache_key":null,"reasoning":{"effort":null,"summary":null},"safety_identifier":null,"service_tier":"auto","store":true,"temperature":1,"text":{"format":{"type":"text"},"verbosity":"medium"},"tool_choice":"auto","tools":[],"top_logprobs":5,"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n',
          'data:{"type":"response.in_progress","sequence_number":1,"response":{"id":"resp_689cec4cf608819583c56813ccb0f5040f92af1765dd5aad","object":"response","created_at":1755114572,"status":"in_progress","background":false,"error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":1024,"max_tool_calls":null,"model":"gpt-4.1-nano-2025-04-14","output":[],"parallel_tool_calls":true,"previous_response_id":null,"prompt_cache_key":null,"reasoning":{"effort":null,"summary":null},"safety_identifier":null,"service_tier":"auto","store":true,"temperature":1,"text":{"format":{"type":"text"},"verbosity":"medium"},"tool_choice":"auto","tools":[],"top_logprobs":5,"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n',
          'data:{"type":"response.output_item.added","sequence_number":2,"output_index":0,"item":{"id":"msg_689cec4d46448195905a27fb9e12ff670f92af1765dd5aad","type":"message","status":"in_progress","content":[],"role":"assistant"}}\n\n',
          'data:{"type":"response.content_part.added","sequence_number":3,"item_id":"msg_689cec4d46448195905a27fb9e12ff670f92af1765dd5aad","output_index":0,"content_index":0,"part":{"type":"output_text","annotations":[],"logprobs":[],"text":""}}\n\n',
          'data:{"type":"response.output_text.delta","sequence_number":4,"item_id":"msg_689cec4d46448195905a27fb9e12ff670f92af1765dd5aad","output_index":0,"content_index":0,"delta":"N","logprobs":[{"bytes":[78],"logprob":-2.9266366958618164,"token":"N","top_logprobs":[{"bytes":[80,108,101,97,115,101],"logprob":-0.5516367554664612,"token":"Please"},{"bytes":[89],"logprob":-1.0516366958618164,"token":"Y"},{"bytes":[78],"logprob":-2.9266366958618164,"token":"N"},{"bytes":[83,117,114,101],"logprob":-4.551636695861816,"token":"Sure"},{"bytes":[67,111,117,108,100],"logprob":-5.176636695861816,"token":"Could"}]}],"obfuscation":"t9egcKewVOXiQ6N"}\n\n',
          'data:{"type":"response.output_text.done","sequence_number":5,"item_id":"msg_689cec4d46448195905a27fb9e12ff670f92af1765dd5aad","output_index":0,"content_index":0,"text":"N","logprobs":[{"bytes":[78],"logprob":-2.9266366958618164,"token":"N","top_logprobs":[{"bytes":[80,108,101,97,115,101],"logprob":-0.5516367554664612,"token":"Please"},{"bytes":[89],"logprob":-1.0516366958618164,"token":"Y"},{"bytes":[78],"logprob":-2.9266366958618164,"token":"N"},{"bytes":[83,117,114,101],"logprob":-4.551636695861816,"token":"Sure"},{"bytes":[67,111,117,108,100],"logprob":-5.176636695861816,"token":"Could"}]}]}\n\n',
          'data:{"type":"response.content_part.done","sequence_number":6,"item_id":"msg_689cec4d46448195905a27fb9e12ff670f92af1765dd5aad","output_index":0,"content_index":0,"part":{"type":"output_text","annotations":[],"logprobs":[],"text":"N"}}\n\n',
          'data:{"type":"response.output_item.done","sequence_number":7,"output_index":0,"item":{"id":"msg_689cec4d46448195905a27fb9e12ff670f92af1765dd5aad","type":"message","status":"completed","content":[{"type":"output_text","annotations":[],"logprobs":[{"bytes":[78],"logprob":-2.926637,"token":"N","top_logprobs":[{"bytes":[80,108,101,97,115,101],"logprob":-0.551637,"token":"Please"},{"bytes":[89],"logprob":-1.051637,"token":"Y"},{"bytes":[78],"logprob":-2.926637,"token":"N"},{"bytes":[83,117,114,101],"logprob":-4.551637,"token":"Sure"},{"bytes":[67,111,117,108,100],"logprob":-5.176637,"token":"Could"}]}],"text":"N"}],"role":"assistant"}}\n\n',
          'data:{"type":"response.completed","sequence_number":8,"response":{"id":"resp_689cec4cf608819583c56813ccb0f5040f92af1765dd5aad","object":"response","created_at":1755114572,"status":"completed","background":false,"error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":1024,"max_tool_calls":null,"model":"gpt-4.1-nano-2025-04-14","output":[{"id":"msg_689cec4d46448195905a27fb9e12ff670f92af1765dd5aad","type":"message","status":"completed","content":[{"type":"output_text","annotations":[],"logprobs":[{"bytes":[78],"logprob":-2.926637,"token":"N","top_logprobs":[{"bytes":[80,108,101,97,115,101],"logprob":-0.551637,"token":"Please"},{"bytes":[89],"logprob":-1.051637,"token":"Y"},{"bytes":[78],"logprob":-2.926637,"token":"N"},{"bytes":[83,117,114,101],"logprob":-4.551637,"token":"Sure"},{"bytes":[67,111,117,108,100],"logprob":-5.176637,"token":"Could"}]}],"text":"N"}],"role":"assistant"}],"parallel_tool_calls":true,"previous_response_id":null,"prompt_cache_key":null,"reasoning":{"effort":null,"summary":null},"safety_identifier":null,"service_tier":"default","store":true,"temperature":1,"text":{"format":{"type":"text"},"verbosity":"medium"},"tool_choice":"auto","tools":[],"top_logprobs":5,"top_p":1,"truncation":"disabled","usage":{"input_tokens":12,"input_tokens_details":{"cached_tokens":0},"output_tokens":2,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":14},"user":null,"metadata":{}}}\n\n',
        ],
      };

      const { stream } = await createModel('gpt-4o').doStream({
        prompt: TEST_PROMPT,
        providerOptions: {
          openai: {
            logprobs: 1,
          },
        },
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "resp_689cec4cf608819583c56813ccb0f5040f92af1765dd5aad",
            "modelId": "gpt-4.1-nano-2025-04-14",
            "timestamp": 2025-08-13T19:49:32.000Z,
            "type": "response-metadata",
          },
          {
            "id": "msg_689cec4d46448195905a27fb9e12ff670f92af1765dd5aad",
            "providerMetadata": {
              "openai": {
                "itemId": "msg_689cec4d46448195905a27fb9e12ff670f92af1765dd5aad",
              },
            },
            "type": "text-start",
          },
          {
            "delta": "N",
            "id": "msg_689cec4d46448195905a27fb9e12ff670f92af1765dd5aad",
            "type": "text-delta",
          },
          {
            "id": "msg_689cec4d46448195905a27fb9e12ff670f92af1765dd5aad",
            "providerMetadata": {
              "openai": {
                "itemId": "msg_689cec4d46448195905a27fb9e12ff670f92af1765dd5aad",
              },
            },
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "openai": {
                "logprobs": [
                  [
                    {
                      "logprob": -2.9266366958618164,
                      "token": "N",
                      "top_logprobs": [
                        {
                          "logprob": -0.5516367554664612,
                          "token": "Please",
                        },
                        {
                          "logprob": -1.0516366958618164,
                          "token": "Y",
                        },
                        {
                          "logprob": -2.9266366958618164,
                          "token": "N",
                        },
                        {
                          "logprob": -4.551636695861816,
                          "token": "Sure",
                        },
                        {
                          "logprob": -5.176636695861816,
                          "token": "Could",
                        },
                      ],
                    },
                  ],
                ],
                "responseId": "resp_689cec4cf608819583c56813ccb0f5040f92af1765dd5aad",
                "serviceTier": "default",
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 0,
              "inputTokens": 12,
              "outputTokens": 2,
              "reasoningTokens": 0,
              "totalTokens": 14,
            },
          },
        ]
      `);
    });

    describe('web search tool', () => {
      it('should stream web search results (sources, tool calls, tool results)', async () => {
        prepareChunksFixtureResponse('openai-web-search-tool.1');

        const { stream } = await createModel('gpt-5-nano').doStream({
          tools: [
            {
              type: 'provider',
              id: 'openai.web_search',
              name: 'webSearch',
              args: {},
            },
          ],
          prompt: TEST_PROMPT,
        });

        expect(await convertReadableStreamToArray(stream)).toMatchSnapshot();
      });

      it('should handle streaming web search with action query field', async () => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'stream-chunks',
          chunks: [
            `data:{"type":"response.created","response":{"id":"resp_test","object":"response","created_at":1741630255,"status":"in_progress","error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"model":"o3-2025-04-16","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":"medium","summary":"auto"},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[{"type":"web_search","search_context_size":"medium"}],"top_p":1,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
            `data:{"type":"response.output_item.added","output_index":0,"item":{"type":"web_search_call","id":"ws_test","status":"in_progress","action":{"type":"search","query":"Vercel AI SDK next version features"}}}\n\n`,
            `data:{"type":"response.web_search_call.in_progress","output_index":0,"item_id":"ws_test"}\n\n`,
            `data:{"type":"response.web_search_call.searching","output_index":0,"item_id":"ws_test"}\n\n`,
            `data:{"type":"response.web_search_call.completed","output_index":0,"item_id":"ws_test"}\n\n`,
            `data:{"type":"response.output_item.done","output_index":0,"item":{"type":"web_search_call","id":"ws_test","status":"completed","action":{"type":"search","query":"Vercel AI SDK next version features"}}}\n\n`,
            `data:{"type":"response.output_item.added","output_index":1,"item":{"type":"message","id":"msg_test","status":"in_progress","role":"assistant","content":[]}}\n\n`,
            `data:{"type":"response.content_part.added","item_id":"msg_test","output_index":1,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}}\n\n`,
            `data:{"type":"response.output_text.delta","item_id":"msg_test","output_index":1,"content_index":0,"delta":"Based on the search results, here are the upcoming features."}\n\n`,
            `data:{"type":"response.output_text.done","item_id":"msg_test","output_index":1,"content_index":0,"text":"Based on the search results, here are the upcoming features."}\n\n`,
            `data:{"type":"response.content_part.done","item_id":"msg_test","output_index":1,"content_index":0,"part":{"type":"output_text","text":"Based on the search results, here are the upcoming features.","annotations":[]}}\n\n`,
            `data:{"type":"response.output_item.done","output_index":1,"item":{"type":"message","id":"msg_test","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Based on the search results, here are the upcoming features.","annotations":[]}]}}\n\n`,
            `data:{"type":"response.completed","response":{"id":"resp_test","object":"response","created_at":1741630255,"status":"completed","error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"model":"o3-2025-04-16","output":[{"type":"web_search_call","id":"ws_test","status":"completed","action":{"type":"search","query":"Vercel AI SDK next version features"}},{"type":"message","id":"msg_test","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Based on the search results, here are the upcoming features.","annotations":[]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":"medium","summary":"auto"},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[{"type":"web_search","search_context_size":"medium"}],"top_p":1,"truncation":"disabled","usage":{"input_tokens":50,"input_tokens_details":{"cached_tokens":0},"output_tokens":25,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":75},"user":null,"metadata":{}}}\n\n`,
            'data: [DONE]\n\n',
          ],
        };

        const { stream } = await createModel('gpt-5-nano').doStream({
          tools: [
            {
              type: 'provider',
              id: 'openai.web_search',
              name: 'webSearch',
              args: {},
            },
          ],
          prompt: TEST_PROMPT,
        });

        expect(await convertReadableStreamToArray(stream)).toMatchSnapshot();
      });
    });

    describe('file search tool', () => {
      it('should stream file search results without results include', async () => {
        prepareChunksFixtureResponse('openai-file-search-tool.1');

        const result = await createModel('gpt-5-nano').doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.file_search',
              name: 'fileSearch',
              args: {
                vectorStoreIds: ['vs_68caad8bd5d88191ab766cf043d89a18'],
              },
            },
          ],
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });

      it('should stream file search results with results include', async () => {
        prepareChunksFixtureResponse('openai-file-search-tool.2');

        const result = await createModel('gpt-5-nano').doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.file_search',
              name: 'fileSearch',
              args: {
                vectorStoreIds: ['vs_68caad8bd5d88191ab766cf043d89a18'],
              },
            },
          ],
          providerOptions: {
            openai: {
              include: ['file_search_call.results'],
            },
          },
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });

    describe('code interpreter tool', () => {
      it('should stream code interpreter results with annotations', async () => {
        prepareChunksFixtureResponse('openai-code-interpreter-tool.1');

        const streamResult = await createModel('gpt-5-nano').doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.code_interpreter',
              name: 'codeExecution',
              args: {},
            },
          ],
        });

        const streamParts = await convertReadableStreamToArray(
          streamResult.stream,
        );

        expect(streamParts).toMatchSnapshot();

        const sourceParts = streamParts.filter(
          (
            part,
          ): part is Extract<LanguageModelV3StreamPart, { type: 'source' }> =>
            part.type === 'source',
        );

        expect(sourceParts).toHaveLength(1);
        expect(sourceParts).toEqual([
          expect.objectContaining({
            type: 'source',
            sourceType: 'document',
            filename: 'roll2dice_sums_10000.csv',
            mediaType: 'text/plain',
            providerMetadata: {
              openai: expect.objectContaining({
                fileId: 'cfile_68c2e7084ab48191a67824aa1f4c90f1',
                containerId:
                  'cntr_68c2e6f380d881908a57a82d394434ff02f484f5344062e9',
              }),
            },
          }),
        ]);
      });
    });

    describe('image generation tool', () => {
      it('should stream code image generation results', async () => {
        prepareChunksFixtureResponse('openai-image-generation-tool.1');

        const result = await createModel('gpt-5-nano').doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.image_generation',
              name: 'generateImage',
              args: {},
            },
          ],
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });

    describe('local shell tool', () => {
      it('should stream code local shell results', async () => {
        prepareChunksFixtureResponse('openai-local-shell-tool.1');

        const result = await createModel('gpt-5-codex').doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.local_shell',
              name: 'shell',
              args: {},
            },
          ],
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });

    describe('mcp tool', () => {
      it('should stream mcp tool results (list tools, tool calls, tool results)', async () => {
        prepareChunksFixtureResponse('openai-mcp-tool.1');

        const { stream } = await createModel('gpt-5-mini').doStream({
          tools: [
            {
              type: 'provider',
              id: 'openai.mcp',
              name: 'MCP',
              args: {
                serverLabel: 'dmcp',
                serverUrl: 'https://mcp.exa.ai/mcp',
                serverDescription: 'A web-search API for AI agents',
              },
            },
          ],
          prompt: TEST_PROMPT,
        });

        expect(await convertReadableStreamToArray(stream)).toMatchSnapshot();
      });
    });

    describe('errors', () => {
      it('should stream error parts', async () => {
        prepareChunksFixtureResponse('openai-error.1');

        const { stream } = await createModel('gpt-4o-mini').doStream({
          prompt: TEST_PROMPT,
          includeRawChunks: false,
        });

        expect(await convertReadableStreamToArray(stream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "stream-start",
                "warnings": [],
              },
              {
                "id": "resp_05500b38c2cd9bfc00691c7c9d222481a3b595421266dab424",
                "modelId": "gpt-5-nano-2025-08-07",
                "timestamp": 2025-11-18T14:03:09.000Z,
                "type": "response-metadata",
              },
              {
                "error": {
                  "error": {
                    "code": "insufficient_quota",
                    "message": "You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.",
                    "param": null,
                    "type": "insufficient_quota",
                  },
                  "sequence_number": 2,
                  "type": "error",
                },
                "type": "error",
              },
              {
                "finishReason": "unknown",
                "providerMetadata": {
                  "openai": {
                    "responseId": "resp_05500b38c2cd9bfc00691c7c9d222481a3b595421266dab424",
                  },
                },
                "type": "finish",
                "usage": {
                  "inputTokens": undefined,
                  "outputTokens": undefined,
                  "totalTokens": undefined,
                },
              },
            ]
          `);
      });
    });

    describe('reasoning', () => {
      it('should handle reasoning with summary', async () => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'stream-chunks',
          chunks: [
            `data:{"type":"response.created","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"o3-mini-2025-01-31","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":"low","summary":"auto"},"store":true,"temperature":null,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":null,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
            `data:{"type":"response.output_item.added","output_index":0,"item":{"id":"rs_6808709f6fcc8191ad2e2fdd784017b3","type":"reasoning"}}\n\n`,
            `data:{"type":"response.reasoning_summary_part.added","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":0}\n\n`,
            `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":0,"delta":"**Exploring burrito origins**\\n\\nThe user is"}\n\n`,
            `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":0,"delta":" curious about the debate regarding Taqueria La Cumbre and El Farolito."}\n\n`,
            `data:{"type":"response.reasoning_summary_part.done","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":0}\n\n`,
            `data:{"type":"response.reasoning_summary_part.added","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":1}\n\n`,
            `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":1,"delta":"**Investigating burrito origins**\\n\\nThere's a fascinating debate"}\n\n`,
            `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":1,"delta":" about who created the Mission burrito."}\n\n`,
            `data:{"type":"response.reasoning_summary_part.done","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":1}\n\n`,
            `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"rs_6808709f6fcc8191ad2e2fdd784017b3","type":"reasoning"}}\n\n`,
            `data:{"type":"response.output_item.added","output_index":1,"item":{"id":"msg_67c97c02656c81908e080dfdf4a03cd1","type":"message"}}\n\n`,
            `data:{"type":"response.output_text.delta","item_id":"msg_67c97c02656c81908e080dfdf4a03cd1","delta":"answer"}\n\n`,
            `data:{"type":"response.output_text.delta","item_id":"msg_67c97c02656c81908e080dfdf4a03cd1","delta":" text"}\n\n`,
            `data:{"type":"response.output_item.done","output_index":1,"item":{"id":"msg_67c97c02656c81908e080dfdf4a03cd1","type":"message"}}\n\n`,
            `data:{"type":"response.completed","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"completed","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"o3-mini-2025-01-31","output":[{"id":"rs_6808709f6fcc8191ad2e2fdd784017b3","type":"reasoning","summary":[{"type":"summary_text","text":"**Exploring burrito origins**\\n\\nThe user is curious about the debate regarding Taqueria La Cumbre and El Farolito."},{"type":"summary_text","text":"**Investigating burrito origins**\\n\\nThere's a fascinating debate about who created the Mission burrito."}]},{"id":"msg_67c97c02656c81908e080dfdf4a03cd1","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"answer text","annotations":[]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":"low","summary":"auto"},"store":true,"temperature":null,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":null,"truncation":"disabled","usage":{"input_tokens":34,"input_tokens_details":{"cached_tokens":0},"output_tokens":538,"output_tokens_details":{"reasoning_tokens":320},"total_tokens":572},"user":null,"metadata":{}}}\n\n`,
          ],
        };

        const { stream } = await createModel('o3-mini').doStream({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              reasoningEffort: 'low',
              reasoningSummary: 'auto',
            },
          },
          includeRawChunks: false,
        });

        expect(await convertReadableStreamToArray(stream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "stream-start",
                "warnings": [],
              },
              {
                "id": "resp_67c9a81b6a048190a9ee441c5755a4e8",
                "modelId": "o3-mini-2025-01-31",
                "timestamp": 2025-03-06T13:50:19.000Z,
                "type": "response-metadata",
              },
              {
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                    "reasoningEncryptedContent": null,
                  },
                },
                "type": "reasoning-start",
              },
              {
                "delta": "**Exploring burrito origins**

            The user is",
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  },
                },
                "type": "reasoning-delta",
              },
              {
                "delta": " curious about the debate regarding Taqueria La Cumbre and El Farolito.",
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  },
                },
                "type": "reasoning-delta",
              },
              {
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  },
                },
                "type": "reasoning-end",
              },
              {
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                    "reasoningEncryptedContent": null,
                  },
                },
                "type": "reasoning-start",
              },
              {
                "delta": "**Investigating burrito origins**

            There's a fascinating debate",
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  },
                },
                "type": "reasoning-delta",
              },
              {
                "delta": " about who created the Mission burrito.",
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  },
                },
                "type": "reasoning-delta",
              },
              {
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                    "reasoningEncryptedContent": null,
                  },
                },
                "type": "reasoning-end",
              },
              {
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                  },
                },
                "type": "text-start",
              },
              {
                "delta": "answer",
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "type": "text-delta",
              },
              {
                "delta": " text",
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "type": "text-delta",
              },
              {
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                  },
                },
                "type": "text-end",
              },
              {
                "finishReason": "stop",
                "providerMetadata": {
                  "openai": {
                    "responseId": "resp_67c9a81b6a048190a9ee441c5755a4e8",
                  },
                },
                "type": "finish",
                "usage": {
                  "cachedInputTokens": 0,
                  "inputTokens": 34,
                  "outputTokens": 538,
                  "reasoningTokens": 320,
                  "totalTokens": 572,
                },
              },
            ]
          `);

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          model: 'o3-mini',
          reasoning: {
            effort: 'low',
            summary: 'auto',
          },
          stream: true,
        });
      });

      it('should handle reasoning with empty summary', async () => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'stream-chunks',
          chunks: [
            `data:{"type":"response.created","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"o3-mini-2025-01-31","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":"low","summary":"auto"},"store":true,"temperature":null,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":null,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
            `data:{"type":"response.output_item.added","output_index":0,"item":{"id":"rs_6808709f6fcc8191ad2e2fdd784017b3","type":"reasoning"}}\n\n`,
            `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"rs_6808709f6fcc8191ad2e2fdd784017b3","type":"reasoning"}}\n\n`,
            `data:{"type":"response.output_item.added","output_index":1,"item":{"id":"msg_67c97c02656c81908e080dfdf4a03cd1","type":"message"}}\n\n`,
            `data:{"type":"response.output_text.delta","item_id":"msg_67c97c02656c81908e080dfdf4a03cd1","delta":"answer"}\n\n`,
            `data:{"type":"response.output_text.delta","item_id":"msg_67c97c02656c81908e080dfdf4a03cd1","delta":" text"}\n\n`,
            `data:{"type":"response.output_item.done","output_index":1,"item":{"id":"msg_67c97c02656c81908e080dfdf4a03cd1","type":"message"}}\n\n`,
            `data:{"type":"response.completed","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"completed","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"o3-mini-2025-01-31","output":[{"id":"rs_6808709f6fcc8191ad2e2fdd784017b3","type":"reasoning","summary":[]},{"id":"msg_67c97c02656c81908e080dfdf4a03cd1","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"answer text","annotations":[]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":"low","summary":"auto"},"store":true,"temperature":null,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":null,"truncation":"disabled","usage":{"input_tokens":34,"input_tokens_details":{"cached_tokens":0},"output_tokens":538,"output_tokens_details":{"reasoning_tokens":320},"total_tokens":572},"user":null,"metadata":{}}}\n\n`,
          ],
        };

        const { stream } = await createModel('o3-mini').doStream({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              reasoningEffort: 'low',
              reasoningSummary: null,
            },
          },
          includeRawChunks: false,
        });

        expect(await convertReadableStreamToArray(stream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "stream-start",
                "warnings": [],
              },
              {
                "id": "resp_67c9a81b6a048190a9ee441c5755a4e8",
                "modelId": "o3-mini-2025-01-31",
                "timestamp": 2025-03-06T13:50:19.000Z,
                "type": "response-metadata",
              },
              {
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                    "reasoningEncryptedContent": null,
                  },
                },
                "type": "reasoning-start",
              },
              {
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                    "reasoningEncryptedContent": null,
                  },
                },
                "type": "reasoning-end",
              },
              {
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                  },
                },
                "type": "text-start",
              },
              {
                "delta": "answer",
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "type": "text-delta",
              },
              {
                "delta": " text",
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "type": "text-delta",
              },
              {
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                  },
                },
                "type": "text-end",
              },
              {
                "finishReason": "stop",
                "providerMetadata": {
                  "openai": {
                    "responseId": "resp_67c9a81b6a048190a9ee441c5755a4e8",
                  },
                },
                "type": "finish",
                "usage": {
                  "cachedInputTokens": 0,
                  "inputTokens": 34,
                  "outputTokens": 538,
                  "reasoningTokens": 320,
                  "totalTokens": 572,
                },
              },
            ]
          `);

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          model: 'o3-mini',
          reasoning: {
            effort: 'low',
          },
          stream: true,
        });
      });

      it('should handle encrypted content with summary', async () => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'stream-chunks',
          chunks: [
            `data:{"type":"response.created","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"o3-mini-2025-01-31","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":"low","summary":"auto"},"store":true,"temperature":null,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":null,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
            `data:{"type":"response.output_item.added","output_index":0,"item":{"id":"rs_6808709f6fcc8191ad2e2fdd784017b3","type":"reasoning","encrypted_content":"encrypted_reasoning_data_abc123"}}\n\n`,
            `data:{"type":"response.reasoning_summary_part.added","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":0}\n\n`,
            `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":0,"delta":"**Exploring burrito origins**\\n\\nThe user is"}\n\n`,
            `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":0,"delta":" curious about the debate regarding Taqueria La Cumbre and El Farolito."}\n\n`,
            `data:{"type":"response.reasoning_summary_part.done","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":0}\n\n`,
            `data:{"type":"response.reasoning_summary_part.added","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":1}\n\n`,
            `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":1,"delta":"**Investigating burrito origins**\\n\\nThere's a fascinating debate"}\n\n`,
            `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":1,"delta":" about who created the Mission burrito."}\n\n`,
            `data:{"type":"response.reasoning_summary_part.done","item_id":"rs_6808709f6fcc8191ad2e2fdd784017b3","summary_index":1}\n\n`,
            `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"rs_6808709f6fcc8191ad2e2fdd784017b3","type":"reasoning","encrypted_content":"encrypted_reasoning_data_final_def456"}}\n\n`,
            `data:{"type":"response.output_item.added","output_index":1,"item":{"id":"msg_67c97c02656c81908e080dfdf4a03cd1","type":"message"}}\n\n`,
            `data:{"type":"response.output_text.delta","item_id":"msg_67c97c02656c81908e080dfdf4a03cd1","delta":"answer"}\n\n`,
            `data:{"type":"response.output_text.delta","item_id":"msg_67c97c02656c81908e080dfdf4a03cd1","delta":" text"}\n\n`,
            `data:{"type":"response.output_item.done","output_index":1,"item":{"id":"msg_67c97c02656c81908e080dfdf4a03cd1","type":"message"}}\n\n`,
            `data:{"type":"response.completed","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"completed","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"o3-mini-2025-01-31","output":[{"id":"rs_6808709f6fcc8191ad2e2fdd784017b3","type":"reasoning","encrypted_content":"encrypted_reasoning_data_final_def456","summary":[{"type":"summary_text","text":"**Exploring burrito origins**\\n\\nThe user is curious about the debate regarding Taqueria La Cumbre and El Farolito."},{"type":"summary_text","text":"**Investigating burrito origins**\\n\\nThere's a fascinating debate about who created the Mission burrito."}]},{"id":"msg_67c97c02656c81908e080dfdf4a03cd1","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"answer text","annotations":[]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":"low","summary":"auto"},"store":true,"temperature":null,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":null,"truncation":"disabled","usage":{"input_tokens":34,"input_tokens_details":{"cached_tokens":0},"output_tokens":538,"output_tokens_details":{"reasoning_tokens":320},"total_tokens":572},"user":null,"metadata":{}}}\n\n`,
          ],
        };

        const { stream } = await createModel('o3-mini').doStream({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              reasoningEffort: 'low',
              reasoningSummary: 'auto',
              include: ['reasoning.encrypted_content'],
            },
          },
          includeRawChunks: false,
        });

        expect(await convertReadableStreamToArray(stream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "stream-start",
                "warnings": [],
              },
              {
                "id": "resp_67c9a81b6a048190a9ee441c5755a4e8",
                "modelId": "o3-mini-2025-01-31",
                "timestamp": 2025-03-06T13:50:19.000Z,
                "type": "response-metadata",
              },
              {
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                    "reasoningEncryptedContent": "encrypted_reasoning_data_abc123",
                  },
                },
                "type": "reasoning-start",
              },
              {
                "delta": "**Exploring burrito origins**

            The user is",
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  },
                },
                "type": "reasoning-delta",
              },
              {
                "delta": " curious about the debate regarding Taqueria La Cumbre and El Farolito.",
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  },
                },
                "type": "reasoning-delta",
              },
              {
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  },
                },
                "type": "reasoning-end",
              },
              {
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                    "reasoningEncryptedContent": "encrypted_reasoning_data_abc123",
                  },
                },
                "type": "reasoning-start",
              },
              {
                "delta": "**Investigating burrito origins**

            There's a fascinating debate",
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  },
                },
                "type": "reasoning-delta",
              },
              {
                "delta": " about who created the Mission burrito.",
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                  },
                },
                "type": "reasoning-delta",
              },
              {
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                    "reasoningEncryptedContent": "encrypted_reasoning_data_final_def456",
                  },
                },
                "type": "reasoning-end",
              },
              {
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                  },
                },
                "type": "text-start",
              },
              {
                "delta": "answer",
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "type": "text-delta",
              },
              {
                "delta": " text",
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "type": "text-delta",
              },
              {
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                  },
                },
                "type": "text-end",
              },
              {
                "finishReason": "stop",
                "providerMetadata": {
                  "openai": {
                    "responseId": "resp_67c9a81b6a048190a9ee441c5755a4e8",
                  },
                },
                "type": "finish",
                "usage": {
                  "cachedInputTokens": 0,
                  "inputTokens": 34,
                  "outputTokens": 538,
                  "reasoningTokens": 320,
                  "totalTokens": 572,
                },
              },
            ]
          `);

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          model: 'o3-mini',
          reasoning: {
            effort: 'low',
            summary: 'auto',
          },
          include: ['reasoning.encrypted_content'],
          stream: true,
        });
      });

      it('should handle encrypted content with empty summary', async () => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'stream-chunks',
          chunks: [
            `data:{"type":"response.created","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"o3-mini-2025-01-31","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":"low","summary":"auto"},"store":true,"temperature":null,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":null,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
            `data:{"type":"response.output_item.added","output_index":0,"item":{"id":"rs_6808709f6fcc8191ad2e2fdd784017b3","type":"reasoning","encrypted_content":"encrypted_reasoning_data_abc123"}}\n\n`,
            `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"rs_6808709f6fcc8191ad2e2fdd784017b3","type":"reasoning","encrypted_content":"encrypted_reasoning_data_final_def456"}}\n\n`,
            `data:{"type":"response.output_item.added","output_index":1,"item":{"id":"msg_67c97c02656c81908e080dfdf4a03cd1","type":"message"}}\n\n`,
            `data:{"type":"response.output_text.delta","item_id":"msg_67c97c02656c81908e080dfdf4a03cd1","delta":"answer"}\n\n`,
            `data:{"type":"response.output_text.delta","item_id":"msg_67c97c02656c81908e080dfdf4a03cd1","delta":" text"}\n\n`,
            `data:{"type":"response.output_item.done","output_index":1,"item":{"id":"msg_67c97c02656c81908e080dfdf4a03cd1","type":"message"}}\n\n`,
            `data:{"type":"response.completed","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"completed","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"o3-mini-2025-01-31","output":[{"id":"rs_6808709f6fcc8191ad2e2fdd784017b3","type":"reasoning","encrypted_content":"encrypted_reasoning_data_final_def456","summary":[]},{"id":"msg_67c97c02656c81908e080dfdf4a03cd1","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"answer text","annotations":[]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":"low","summary":"auto"},"store":true,"temperature":null,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":null,"truncation":"disabled","usage":{"input_tokens":34,"input_tokens_details":{"cached_tokens":0},"output_tokens":538,"output_tokens_details":{"reasoning_tokens":320},"total_tokens":572},"user":null,"metadata":{}}}\n\n`,
          ],
        };

        const { stream } = await createModel('o3-mini').doStream({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              reasoningEffort: 'low',
              reasoningSummary: null,
              include: ['reasoning.encrypted_content'],
            },
          },
          includeRawChunks: false,
        });

        expect(await convertReadableStreamToArray(stream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "stream-start",
                "warnings": [],
              },
              {
                "id": "resp_67c9a81b6a048190a9ee441c5755a4e8",
                "modelId": "o3-mini-2025-01-31",
                "timestamp": 2025-03-06T13:50:19.000Z,
                "type": "response-metadata",
              },
              {
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                    "reasoningEncryptedContent": "encrypted_reasoning_data_abc123",
                  },
                },
                "type": "reasoning-start",
              },
              {
                "id": "rs_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_6808709f6fcc8191ad2e2fdd784017b3",
                    "reasoningEncryptedContent": "encrypted_reasoning_data_final_def456",
                  },
                },
                "type": "reasoning-end",
              },
              {
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                  },
                },
                "type": "text-start",
              },
              {
                "delta": "answer",
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "type": "text-delta",
              },
              {
                "delta": " text",
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "type": "text-delta",
              },
              {
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                  },
                },
                "type": "text-end",
              },
              {
                "finishReason": "stop",
                "providerMetadata": {
                  "openai": {
                    "responseId": "resp_67c9a81b6a048190a9ee441c5755a4e8",
                  },
                },
                "type": "finish",
                "usage": {
                  "cachedInputTokens": 0,
                  "inputTokens": 34,
                  "outputTokens": 538,
                  "reasoningTokens": 320,
                  "totalTokens": 572,
                },
              },
            ]
          `);

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          model: 'o3-mini',
          reasoning: {
            effort: 'low',
          },
          include: ['reasoning.encrypted_content'],
          stream: true,
        });
      });

      it('should handle multiple reasoning blocks', async () => {
        server.urls['https://api.openai.com/v1/responses'].response = {
          type: 'stream-chunks',
          chunks: [
            `data:{"type":"response.created","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"in_progress","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"o3-mini-2025-01-31","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":"medium","summary":"auto"},"store":true,"temperature":null,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":null,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}\n\n`,
            // First reasoning block (with multiple summary parts)
            `data:{"type":"response.output_item.added","output_index":0,"item":{"id":"rs_first_6808709f6fcc8191ad2e2fdd784017b3","type":"reasoning"}}\n\n`,
            `data:{"type":"response.reasoning_summary_part.added","item_id":"rs_first_6808709f6fcc8191ad2e2fdd784017b3","summary_index":0}\n\n`,
            `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_first_6808709f6fcc8191ad2e2fdd784017b3","summary_index":0,"delta":"**Initial analysis**\\n\\nFirst reasoning block:"}\n\n`,
            `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_first_6808709f6fcc8191ad2e2fdd784017b3","summary_index":0,"delta":" analyzing the problem structure."}\n\n`,
            `data:{"type":"response.reasoning_summary_part.done","item_id":"rs_first_6808709f6fcc8191ad2e2fdd784017b3","summary_index":0}\n\n`,
            `data:{"type":"response.reasoning_summary_part.added","item_id":"rs_first_6808709f6fcc8191ad2e2fdd784017b3","summary_index":1}\n\n`,
            `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_first_6808709f6fcc8191ad2e2fdd784017b3","summary_index":1,"delta":"**Deeper consideration**\\n\\nLet me think about"}\n\n`,
            `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_first_6808709f6fcc8191ad2e2fdd784017b3","summary_index":1,"delta":" the various approaches available."}\n\n`,
            `data:{"type":"response.reasoning_summary_part.done","item_id":"rs_first_6808709f6fcc8191ad2e2fdd784017b3","summary_index":1}\n\n`,
            `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"rs_first_6808709f6fcc8191ad2e2fdd784017b3","type":"reasoning"}}\n\n`,
            // First message
            `data:{"type":"response.output_item.added","output_index":1,"item":{"id":"msg_67c97c02656c81908e080dfdf4a03cd1","type":"message"}}\n\n`,
            `data:{"type":"response.output_text.delta","item_id":"msg_67c97c02656c81908e080dfdf4a03cd1","delta":"Let me think about"}\n\n`,
            `data:{"type":"response.output_text.delta","item_id":"msg_67c97c02656c81908e080dfdf4a03cd1","delta":" this step by step."}\n\n`,
            `data:{"type":"response.output_item.done","output_index":1,"item":{"id":"msg_67c97c02656c81908e080dfdf4a03cd1","type":"message"}}\n\n`,
            // Second reasoning block
            `data:{"type":"response.output_item.added","output_index":2,"item":{"id":"rs_second_7908809g7gcc9291be3e3fee895028c4","type":"reasoning"}}\n\n`,
            `data:{"type":"response.reasoning_summary_part.added","item_id":"rs_second_7908809g7gcc9291be3e3fee895028c4","summary_index":0}\n\n`,
            `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_second_7908809g7gcc9291be3e3fee895028c4","summary_index":0,"delta":"Second reasoning block:"}\n\n`,
            `data:{"type":"response.reasoning_summary_text.delta","item_id":"rs_second_7908809g7gcc9291be3e3fee895028c4","summary_index":0,"delta":" considering alternative approaches."}\n\n`,
            `data:{"type":"response.reasoning_summary_part.done","item_id":"rs_second_7908809g7gcc9291be3e3fee895028c4","summary_index":0}\n\n`,
            `data:{"type":"response.output_item.done","output_index":2,"item":{"id":"rs_second_7908809g7gcc9291be3e3fee895028c4","type":"reasoning"}}\n\n`,
            // Final message
            `data:{"type":"response.output_item.added","output_index":3,"item":{"id":"msg_final_78d08d03767d92908f25523f5ge51e77","type":"message"}}\n\n`,
            `data:{"type":"response.output_text.delta","item_id":"msg_final_78d08d03767d92908f25523f5ge51e77","delta":"Based on my analysis,"}\n\n`,
            `data:{"type":"response.output_text.delta","item_id":"msg_final_78d08d03767d92908f25523f5ge51e77","delta":" here is the solution."}\n\n`,
            `data:{"type":"response.output_item.done","output_index":3,"item":{"id":"msg_final_78d08d03767d92908f25523f5ge51e77","type":"message"}}\n\n`,
            `data:{"type":"response.completed","response":{"id":"resp_67c9a81b6a048190a9ee441c5755a4e8","object":"response","created_at":1741269019,"status":"completed","error":null,"incomplete_details":null,"input":[],"instructions":null,"max_output_tokens":null,"model":"o3-mini-2025-01-31","output":[{"id":"rs_first_6808709f6fcc8191ad2e2fdd784017b3","type":"reasoning","summary":[{"type":"summary_text","text":"**Initial analysis**\\n\\nFirst reasoning block: analyzing the problem structure."},{"type":"summary_text","text":"**Deeper consideration**\\n\\nLet me think about the various approaches available."}]},{"id":"msg_67c97c02656c81908e080dfdf4a03cd1","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Let me think about this step by step.","annotations":[]}]},{"id":"rs_second_7908809g7gcc9291be3e3fee895028c4","type":"reasoning","summary":[{"type":"summary_text","text":"Second reasoning block: considering alternative approaches."}]},{"id":"msg_final_78d08d03767d92908f25523f5ge51e77","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Based on my analysis, here is the solution.","annotations":[]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":"medium","summary":"auto"},"store":true,"temperature":null,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":null,"truncation":"disabled","usage":{"input_tokens":45,"input_tokens_details":{"cached_tokens":0},"output_tokens":628,"output_tokens_details":{"reasoning_tokens":420},"total_tokens":673},"user":null,"metadata":{}}}\n\n`,
          ],
        };

        const { stream } = await createModel('o3-mini').doStream({
          prompt: TEST_PROMPT,
          providerOptions: {
            openai: {
              reasoningEffort: 'medium',
              reasoningSummary: 'auto',
            },
          },
          includeRawChunks: false,
        });

        expect(await convertReadableStreamToArray(stream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "stream-start",
                "warnings": [],
              },
              {
                "id": "resp_67c9a81b6a048190a9ee441c5755a4e8",
                "modelId": "o3-mini-2025-01-31",
                "timestamp": 2025-03-06T13:50:19.000Z,
                "type": "response-metadata",
              },
              {
                "id": "rs_first_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_first_6808709f6fcc8191ad2e2fdd784017b3",
                    "reasoningEncryptedContent": null,
                  },
                },
                "type": "reasoning-start",
              },
              {
                "delta": "**Initial analysis**

            First reasoning block:",
                "id": "rs_first_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_first_6808709f6fcc8191ad2e2fdd784017b3",
                  },
                },
                "type": "reasoning-delta",
              },
              {
                "delta": " analyzing the problem structure.",
                "id": "rs_first_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_first_6808709f6fcc8191ad2e2fdd784017b3",
                  },
                },
                "type": "reasoning-delta",
              },
              {
                "id": "rs_first_6808709f6fcc8191ad2e2fdd784017b3:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_first_6808709f6fcc8191ad2e2fdd784017b3",
                  },
                },
                "type": "reasoning-end",
              },
              {
                "id": "rs_first_6808709f6fcc8191ad2e2fdd784017b3:1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_first_6808709f6fcc8191ad2e2fdd784017b3",
                    "reasoningEncryptedContent": null,
                  },
                },
                "type": "reasoning-start",
              },
              {
                "delta": "**Deeper consideration**

            Let me think about",
                "id": "rs_first_6808709f6fcc8191ad2e2fdd784017b3:1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_first_6808709f6fcc8191ad2e2fdd784017b3",
                  },
                },
                "type": "reasoning-delta",
              },
              {
                "delta": " the various approaches available.",
                "id": "rs_first_6808709f6fcc8191ad2e2fdd784017b3:1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_first_6808709f6fcc8191ad2e2fdd784017b3",
                  },
                },
                "type": "reasoning-delta",
              },
              {
                "id": "rs_first_6808709f6fcc8191ad2e2fdd784017b3:1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_first_6808709f6fcc8191ad2e2fdd784017b3",
                    "reasoningEncryptedContent": null,
                  },
                },
                "type": "reasoning-end",
              },
              {
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                  },
                },
                "type": "text-start",
              },
              {
                "delta": "Let me think about",
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "type": "text-delta",
              },
              {
                "delta": " this step by step.",
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "type": "text-delta",
              },
              {
                "id": "msg_67c97c02656c81908e080dfdf4a03cd1",
                "providerMetadata": {
                  "openai": {
                    "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                  },
                },
                "type": "text-end",
              },
              {
                "id": "rs_second_7908809g7gcc9291be3e3fee895028c4:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_second_7908809g7gcc9291be3e3fee895028c4",
                    "reasoningEncryptedContent": null,
                  },
                },
                "type": "reasoning-start",
              },
              {
                "delta": "Second reasoning block:",
                "id": "rs_second_7908809g7gcc9291be3e3fee895028c4:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_second_7908809g7gcc9291be3e3fee895028c4",
                  },
                },
                "type": "reasoning-delta",
              },
              {
                "delta": " considering alternative approaches.",
                "id": "rs_second_7908809g7gcc9291be3e3fee895028c4:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_second_7908809g7gcc9291be3e3fee895028c4",
                  },
                },
                "type": "reasoning-delta",
              },
              {
                "id": "rs_second_7908809g7gcc9291be3e3fee895028c4:0",
                "providerMetadata": {
                  "openai": {
                    "itemId": "rs_second_7908809g7gcc9291be3e3fee895028c4",
                    "reasoningEncryptedContent": null,
                  },
                },
                "type": "reasoning-end",
              },
              {
                "id": "msg_final_78d08d03767d92908f25523f5ge51e77",
                "providerMetadata": {
                  "openai": {
                    "itemId": "msg_final_78d08d03767d92908f25523f5ge51e77",
                  },
                },
                "type": "text-start",
              },
              {
                "delta": "Based on my analysis,",
                "id": "msg_final_78d08d03767d92908f25523f5ge51e77",
                "type": "text-delta",
              },
              {
                "delta": " here is the solution.",
                "id": "msg_final_78d08d03767d92908f25523f5ge51e77",
                "type": "text-delta",
              },
              {
                "id": "msg_final_78d08d03767d92908f25523f5ge51e77",
                "providerMetadata": {
                  "openai": {
                    "itemId": "msg_final_78d08d03767d92908f25523f5ge51e77",
                  },
                },
                "type": "text-end",
              },
              {
                "finishReason": "stop",
                "providerMetadata": {
                  "openai": {
                    "responseId": "resp_67c9a81b6a048190a9ee441c5755a4e8",
                  },
                },
                "type": "finish",
                "usage": {
                  "cachedInputTokens": 0,
                  "inputTokens": 45,
                  "outputTokens": 628,
                  "reasoningTokens": 420,
                  "totalTokens": 673,
                },
              },
            ]
          `);

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          model: 'o3-mini',
          reasoning: {
            effort: 'medium',
            summary: 'auto',
          },
          stream: true,
        });
      });
    });

    describe('apply_patch tool streaming', () => {
      it('should handle apply_patch tool calls in streaming mode', async () => {
        prepareChunksFixtureResponse('openai-apply-patch-tool.1');

        const { stream } = await createModel('gpt-5.1-2025-11-13').doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'openai.apply_patch',
              name: 'apply_patch',
              args: {},
            },
          ],
        });

        expect(await convertReadableStreamToArray(stream)).toMatchSnapshot();
      });
    });
  });

  describe('fileIdPrefixes configuration', () => {
    const TEST_PROMPT_WITH_FILE: LanguageModelV3Prompt = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this image' },
          {
            type: 'file',
            mediaType: 'image/jpeg',
            data: 'file-abc123',
          },
        ],
      },
    ];

    beforeEach(() => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'json-value',
        body: {
          id: 'resp_test',
          object: 'response',
          created_at: 1741257730,
          status: 'completed',
          model: 'gpt-4o',
          output: [
            {
              id: 'msg_test',
              type: 'message',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'I can see the image.',
                  annotations: [],
                },
              ],
            },
          ],
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
          },
          incomplete_details: null,
        },
      };
    });

    it('should pass fileIdPrefixes to convertToOpenAIResponsesMessages', async () => {
      const model = createModel('gpt-4o', ['file-']);

      await model.doGenerate({
        prompt: TEST_PROMPT_WITH_FILE,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input).toEqual([
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Analyze this image' },
            { type: 'input_image', file_id: 'file-abc123' },
          ],
        },
      ]);
    });

    it('should handle multiple file ID prefixes', async () => {
      const model = createModel('gpt-4o', ['file-', 'custom-']);

      await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Compare these images' },
              {
                type: 'file',
                mediaType: 'image/jpeg',
                data: 'file-abc123',
              },
              {
                type: 'file',
                mediaType: 'image/jpeg',
                data: 'custom-xyz789',
              },
            ],
          },
        ],
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input).toEqual([
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Compare these images' },
            { type: 'input_image', file_id: 'file-abc123' },
            { type: 'input_image', file_id: 'custom-xyz789' },
          ],
        },
      ]);
    });

    it('should fall back to base64 when fileIdPrefixes is undefined', async () => {
      const model = createModel('gpt-4o'); // no fileIdPrefixes

      await model.doGenerate({
        prompt: TEST_PROMPT_WITH_FILE,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input).toEqual([
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Analyze this image' },
            {
              type: 'input_image',
              image_url: 'data:image/jpeg;base64,file-abc123',
            },
          ],
        },
      ]);
    });

    it('should fall back to base64 when prefix does not match', async () => {
      const model = createModel('gpt-4o', ['other-']);

      await model.doGenerate({
        prompt: TEST_PROMPT_WITH_FILE,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input).toEqual([
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Analyze this image' },
            {
              type: 'input_image',
              image_url: 'data:image/jpeg;base64,file-abc123',
            },
          ],
        },
      ]);
    });
  });

  describe('mixed citation types', () => {
    it('should handle both url_citation and file_citation annotations', async () => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.content_part.added","item_id":"msg_123","output_index":0,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}}\n\n`,
          `data:{"type":"response.output_text.annotation.added","item_id":"msg_123","output_index":0,"content_index":0,"annotation_index":0,"annotation":{"type":"url_citation","url":"https://example.com","title":"Example URL","start_index":123,"end_index":234}}\n\n`,
          `data:{"type":"response.output_text.annotation.added","item_id":"msg_123","output_index":0,"content_index":0,"annotation_index":1,"annotation":{"type":"file_citation","file_id":"file-abc123","quote":"This is a quote from the file"}}\n\n`,
          `data:{"type":"response.content_part.done","item_id":"msg_123","output_index":0,"content_index":0,"part":{"type":"output_text","text":"Based on web search and file content.","annotations":[{"type":"url_citation","start_index":0,"end_index":10,"url":"https://example.com","title":"Example URL"},{"type":"file_citation","start_index":20,"end_index":30,"file_id":"file-abc123","quote":"This is a quote from the file"}]}}\n\n`,
          `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"msg_123","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Based on web search and file content.","annotations":[{"type":"url_citation","start_index":0,"end_index":10,"url":"https://example.com","title":"Example URL"},{"type":"file_citation","start_index":20,"end_index":30,"file_id":"file-abc123","quote":"This is a quote from the file"}]}]}}\n\n`,
          `data:{"type":"response.completed","response":{"id":"resp_123","object":"response","created_at":1234567890,"status":"completed","error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"model":"gpt-4o","output":[{"id":"msg_123","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Based on web search and file content.","annotations":[{"type":"url_citation","start_index":0,"end_index":10,"url":"https://example.com","title":"Example URL"},{"type":"file_citation","start_index":20,"end_index":30,"file_id":"file-abc123","quote":"This is a quote from the file"}]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":{"input_tokens":100,"input_tokens_details":{"cached_tokens":0},"output_tokens":50,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":150},"user":null,"metadata":{}}}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await createModel('gpt-4o').doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      const result = await convertReadableStreamToArray(stream);

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "id-0",
            "sourceType": "url",
            "title": "Example URL",
            "type": "source",
            "url": "https://example.com",
          },
          {
            "filename": "file-abc123",
            "id": "id-1",
            "mediaType": "text/plain",
            "providerMetadata": {
              "openai": {
                "fileId": "file-abc123",
              },
            },
            "sourceType": "document",
            "title": "This is a quote from the file",
            "type": "source",
          },
          {
            "id": "msg_123",
            "providerMetadata": {
              "openai": {
                "annotations": [
                  {
                    "end_index": 234,
                    "start_index": 123,
                    "title": "Example URL",
                    "type": "url_citation",
                    "url": "https://example.com",
                  },
                  {
                    "file_id": "file-abc123",
                    "quote": "This is a quote from the file",
                    "type": "file_citation",
                  },
                ],
                "itemId": "msg_123",
              },
            },
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "openai": {
                "responseId": null,
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 0,
              "inputTokens": 100,
              "outputTokens": 50,
              "reasoningTokens": 0,
              "totalTokens": 150,
            },
          },
        ]
      `);
    });

    it('should handle file_citation annotations without optional fields in streaming', async () => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.content_part.added","item_id":"msg_456","output_index":0,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}}\n\n`,
          `data:{"type":"response.output_text.annotation.added","item_id":"msg_456","output_index":0,"content_index":0,"annotation_index":0,"annotation":{"type":"file_citation","file_id":"file-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":145}}\n\n`,
          `data:{"type":"response.output_text.annotation.added","item_id":"msg_456","output_index":0,"content_index":0,"annotation_index":1,"annotation":{"type":"file_citation","file_id":"file-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":192}}\n\n`,
          `data:{"type":"response.content_part.done","item_id":"msg_456","output_index":0,"content_index":0,"part":{"type":"output_text","text":"Answer for the specified years....","annotations":[{"type":"file_citation","file_id":"file-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":145},{"type":"file_citation","file_id":"file-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":192}]}}\n\n`,
          `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"msg_456","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Answer for the specified years....","annotations":[{"type":"file_citation","file_id":"file-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":145},{"type":"file_citation","file_id":"file-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":192}]}]}}\n\n`,
          `data:{"type":"response.completed","response":{"id":"resp_456","object":"response","created_at":1234567890,"status":"completed","error":null,"incomplete_details":null,"instructions":null,"max_output_tokens":null,"model":"gpt-5","output":[{"id":"msg_456","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Answer for the specified years....","annotations":[{"type":"file_citation","file_id":"file-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":145},{"type":"file_citation","file_id":"file-YRcoCqn3Fo2K4JgraG","filename":"resource1.json","index":192}]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1,"truncation":"disabled","usage":{"input_tokens":50,"input_tokens_details":{"cached_tokens":0},"output_tokens":25,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":75},"user":null,"metadata":{}}}\n\n`,
          'data: [DONE]\n\n',
        ],
      };
      const { stream } = await createModel('gpt-5').doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });
      const result = await convertReadableStreamToArray(stream);
      expect(result).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "filename": "resource1.json",
            "id": "id-0",
            "mediaType": "text/plain",
            "providerMetadata": {
              "openai": {
                "fileId": "file-YRcoCqn3Fo2K4JgraG",
              },
            },
            "sourceType": "document",
            "title": "resource1.json",
            "type": "source",
          },
          {
            "filename": "resource1.json",
            "id": "id-1",
            "mediaType": "text/plain",
            "providerMetadata": {
              "openai": {
                "fileId": "file-YRcoCqn3Fo2K4JgraG",
              },
            },
            "sourceType": "document",
            "title": "resource1.json",
            "type": "source",
          },
          {
            "id": "msg_456",
            "providerMetadata": {
              "openai": {
                "annotations": [
                  {
                    "file_id": "file-YRcoCqn3Fo2K4JgraG",
                    "filename": "resource1.json",
                    "index": 145,
                    "type": "file_citation",
                  },
                  {
                    "file_id": "file-YRcoCqn3Fo2K4JgraG",
                    "filename": "resource1.json",
                    "index": 192,
                    "type": "file_citation",
                  },
                ],
                "itemId": "msg_456",
              },
            },
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "openai": {
                "responseId": null,
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 0,
              "inputTokens": 50,
              "outputTokens": 25,
              "reasoningTokens": 0,
              "totalTokens": 75,
            },
          },
        ]
      `);
    });
    it('should handle container_file_citation annotations in streaming', async () => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:${JSON.stringify({ type: 'response.content_part.added', item_id: 'msg_68c2e7054ae481938354ab3e4e77abad02d3a5742c7ddae9', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })}\n\n`,
          `data:${JSON.stringify({ type: 'response.output_text.annotation.added', item_id: 'msg_68c2e7054ae481938354ab3e4e77abad02d3a5742c7ddae9', output_index: 0, content_index: 0, annotation_index: 0, annotation: { type: 'container_file_citation', container_id: 'cntr_68c2e6f380d881908a57a82d394434ff02f484f5344062e9', end_index: 465, file_id: 'cfile_68c2e7084ab48191a67824aa1f4c90f1', filename: 'roll2dice_sums_10000.csv', start_index: 423 } })}\n\n`,
          `data:${JSON.stringify({ type: 'response.content_part.done', item_id: 'msg_68c2e7054ae481938354ab3e4e77abad02d3a5742c7ddae9', output_index: 0, content_index: 0, part: { type: 'output_text', annotations: [{ type: 'container_file_citation', container_id: 'cntr_68c2e6f380d881908a57a82d394434ff02f484f5344062e9', end_index: 465, file_id: 'cfile_68c2e7084ab48191a67824aa1f4c90f1', filename: 'roll2dice_sums_10000.csv', start_index: 423 }], logprobs: [], text: "Heres a simulation of rolling two fair six-sided dice 10,000 times. Each trial sums the two dice.\n\nResults\n- Total sum of all 10,000 trials: 69,868\n- Average sum per trial: 6.9868\n- Minimum sum observed: 2\n- Maximum sum observed: 12\n- Sample of the first 20 trial sums: 6, 7, 2, 5, 5, 11, 4, 8, 10, 7, 5, 8, 8, 7, 10, 8, 9, 5, 4, 7\n\nFull data\n- You can download all 10,000 sums as a CSV file here: [Download the sums CSV](sandbox:/mnt/data/roll2dice_sums_10000.csv)\n\nIf you'd like, I can also provide a frequency distribution, histogram, or export the data in another format (JSON, Excel, etc.)." } })}\n\n`,
          `data:${JSON.stringify({ type: 'response.output_item.done', output_index: 0, item: { id: 'msg_68c2e7054ae481938354ab3e4e77abad02d3a5742c7ddae9', type: 'message', status: 'completed', content: [{ type: 'output_text', annotations: [{ type: 'container_file_citation', container_id: 'cntr_68c2e6f380d881908a57a82d394434ff02f484f5344062e9', end_index: 465, file_id: 'cfile_68c2e7084ab48191a67824aa1f4c90f1', filename: 'roll2dice_sums_10000.csv', start_index: 423 }], logprobs: [], text: "Heres a simulation of rolling two fair six-sided dice 10,000 times. Each trial sums the two dice.\n\nResults\n- Total sum of all 10,000 trials: 69,868\n- Average sum per trial: 6.9868\n- Minimum sum observed: 2\n- Maximum sum observed: 12\n- Sample of the first 20 trial sums: 6, 7, 2, 5, 5, 11, 4, 8, 10, 7, 5, 8, 8, 7, 10, 8, 9, 5, 4, 7\n\nFull data\n- You can download all 10,000 sums as a CSV file here: [Download the sums CSV](sandbox:/mnt/data/roll2dice_sums_10000.csv)\n\nIf you'd like, I can also provide a frequency distribution, histogram, or export the data in another format (JSON, Excel, etc.)." }], role: 'assistant' } })}\n\n`,
          `data:${JSON.stringify({
            type: 'response.completed',
            response: {
              id: 'resp_68c2e6efa238819383d5f52a2c2a3baa02d3a5742c7ddae9',
              object: 'response',
              created_at: 1757603567,
              status: 'completed',
              error: null,
              incomplete_details: null,
              instructions: null,
              max_output_tokens: null,
              model: 'gpt-5-nano-2025-08-07',
              output: [
                {
                  id: 'rs_68c2e6f40ba48193a1c27abf31130e7e02d3a5742c7ddae9',
                  type: 'reasoning',
                  summary: [],
                },
                {
                  id: 'ci_68c2e6f7b72c8193ba1f552552c8dc9202d3a5742c7ddae9',
                  type: 'code_interpreter_call',
                  status: 'completed',
                  code: 'import random, math\nN=10000\nsums=[]\ns=0\nfor _ in range(N):\n    a=random.randint(1,6)\n    b=random.randint(1,6)\n    sm=a+b\n    sums.append(sm)\n    s+=sm\nmin(sums), max(sums), sum(sums), sum(sums)/N\n',
                  container_id:
                    'cntr_68c2e6f380d881908a57a82d394434ff02f484f5344062e9',
                  outputs: [{ type: 'logs', logs: '(2, 12, 69868, 6.9868)' }],
                },
                {
                  id: 'rs_68c2e6fcb52881938f21c45741216ac002d3a5742c7ddae9',
                  type: 'reasoning',
                  summary: [],
                },
                {
                  id: 'ci_68c2e6fd57948193aa93df6bdb00a86d02d3a5742c7ddae9',
                  type: 'code_interpreter_call',
                  status: 'completed',
                  code: "import csv, pathlib\npath = pathlib.Path('/mnt/data/roll2dice_sums_10000.csv')\nwith open(path, 'w', newline='') as f:\n    writer = csv.writer(f)\n    writer.writerow(['sum'])\n    for val in sums:\n        writer.writerow([val])\npath, path.exists(), len(sums)\n",
                  container_id:
                    'cntr_68c2e6f380d881908a57a82d394434ff02f484f5344062e9',
                  outputs: [
                    {
                      type: 'logs',
                      logs: "(PosixPath('/mnt/data/roll2dice_sums_10000.csv'), True, 10000)",
                    },
                  ],
                },
                {
                  id: 'rs_68c2e6fff1808193a78d43410a1feb4802d3a5742c7ddae9',
                  type: 'reasoning',
                  summary: [],
                },
                {
                  id: 'ci_68c2e701a23081939c93b6fb5bb952d302d3a5742c7ddae9',
                  type: 'code_interpreter_call',
                  status: 'completed',
                  code: 'sums[:20]\n',
                  container_id:
                    'cntr_68c2e6f380d881908a57a82d394434ff02f484f5344062e9',
                  outputs: [
                    {
                      type: 'logs',
                      logs: '[6, 7, 2, 5, 5, 11, 4, 8, 10, 7, 5, 8, 8, 7, 10, 8, 9, 5, 4, 7]',
                    },
                  ],
                },
                {
                  id: 'rs_68c2e703d114819383c5da260649c7ce02d3a5742c7ddae9',
                  type: 'reasoning',
                  summary: [],
                },
                {
                  id: 'msg_68c2e7054ae481938354ab3e4e77abad02d3a5742c7ddae9',
                  type: 'message',
                  status: 'completed',
                  content: [
                    {
                      type: 'output_text',
                      annotations: [
                        {
                          type: 'container_file_citation',
                          container_id:
                            'cntr_68c2e6f380d881908a57a82d394434ff02f484f5344062e9',
                          end_index: 465,
                          file_id: 'cfile_68c2e7084ab48191a67824aa1f4c90f1',
                          filename: 'roll2dice_sums_10000.csv',
                          start_index: 423,
                        },
                      ],
                      logprobs: [],
                      text: "Here's a simulation of rolling two fair six-sided dice 10,000 times. Each trial sums the two dice.\n\nResults\n- Total sum of all 10,000 trials: 69,868\n- Average sum per trial: 6.9868\n- Minimum sum observed: 2\n- Maximum sum observed: 12\n- Sample of the first 20 trial sums: 6, 7, 2, 5, 5, 11, 4, 8, 10, 7, 5, 8, 8, 7, 10, 8, 9, 5, 4, 7\n\nFull data\n- You can download all 10,000 sums as a CSV file here: [Download the sums CSV](sandbox:/mnt/data/roll2dice_sums_10000.csv)\n\nIf you'd like, I can also provide a frequency distribution, histogram, or export the data in another format (JSON, Excel, etc.).",
                    },
                  ],
                  role: 'assistant',
                },
              ],
              parallel_tool_calls: true,
              previous_response_id: null,
              prompt_cache_key: null,
              reasoning: { effort: 'medium', summary: null },
              safety_identifier: null,
              store: true,
              temperature: 1,
              text: { format: { type: 'text' }, verbosity: 'medium' },
              tool_choice: 'auto',
              tools: [
                { type: 'code_interpreter', container: { type: 'auto' } },
              ],
              top_logprobs: 0,
              top_p: 1,
              truncation: 'disabled',
              usage: {
                input_tokens: 6047,
                input_tokens_details: { cached_tokens: 2944 },
                output_tokens: 1623,
                output_tokens_details: { reasoning_tokens: 1408 },
                total_tokens: 7670,
              },
              user: null,
              metadata: {},
            },
          })}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await createModel('gpt-5').doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      const result = await convertReadableStreamToArray(stream);
      expect(result).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "filename": "roll2dice_sums_10000.csv",
            "id": "id-0",
            "mediaType": "text/plain",
            "providerMetadata": {
              "openai": {
                "containerId": "cntr_68c2e6f380d881908a57a82d394434ff02f484f5344062e9",
                "fileId": "cfile_68c2e7084ab48191a67824aa1f4c90f1",
              },
            },
            "sourceType": "document",
            "title": "roll2dice_sums_10000.csv",
            "type": "source",
          },
          {
            "id": "msg_68c2e7054ae481938354ab3e4e77abad02d3a5742c7ddae9",
            "providerMetadata": {
              "openai": {
                "annotations": [
                  {
                    "container_id": "cntr_68c2e6f380d881908a57a82d394434ff02f484f5344062e9",
                    "end_index": 465,
                    "file_id": "cfile_68c2e7084ab48191a67824aa1f4c90f1",
                    "filename": "roll2dice_sums_10000.csv",
                    "start_index": 423,
                    "type": "container_file_citation",
                  },
                ],
                "itemId": "msg_68c2e7054ae481938354ab3e4e77abad02d3a5742c7ddae9",
              },
            },
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "openai": {
                "responseId": null,
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 2944,
              "inputTokens": 6047,
              "outputTokens": 1623,
              "reasoningTokens": 1408,
              "totalTokens": 7670,
            },
          },
        ]
      `);
    });

    it('should handle file_path annotations in streaming', async () => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:${JSON.stringify({ type: 'response.content_part.added', item_id: 'msg_68c2e7054ae481938354ab3e4e77abad02d3a5742c7ddae9', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })}\n\n`,
          `data:${JSON.stringify({ type: 'response.output_text.annotation.added', item_id: 'msg_68c2e7054ae481938354ab3e4e77abad02d3a5742c7ddae9', output_index: 0, content_index: 0, annotation_index: 0, annotation: { type: 'file_path', file_id: 'cfile_68c2e7084ab48191a67824aa1f4c90f1' } })}\n\n`,
          `data:${JSON.stringify({ type: 'response.content_part.done', item_id: 'msg_68c2e7054ae481938354ab3e4e77abad02d3a5742c7ddae9', output_index: 0, content_index: 0, part: { type: 'output_text', annotations: [{ type: 'file_path', file_id: 'cfile_68c2e7084ab48191a67824aa1f4c90f1' }], logprobs: [], text: "Heres a simulation of rolling two fair six-sided dice 10,000 times. Each trial sums the two dice.\n\nResults\n- Total sum of all 10,000 trials: 69,868\n- Average sum per trial: 6.9868\n- Minimum sum observed: 2\n- Maximum sum observed: 12\n- Sample of the first 20 trial sums: 6, 7, 2, 5, 5, 11, 4, 8, 10, 7, 5, 8, 8, 7, 10, 8, 9, 5, 4, 7\n\nFull data\n- You can download all 10,000 sums as a CSV file here: [Download the sums CSV](sandbox:/mnt/data/roll2dice_sums_10000.csv)\n\nIf you'd like, I can also provide a frequency distribution, histogram, or export the data in another format (JSON, Excel, etc.)." } })}\n\n`,
          `data:${JSON.stringify({ type: 'response.output_item.done', output_index: 0, item: { id: 'msg_68c2e7054ae481938354ab3e4e77abad02d3a5742c7ddae9', type: 'message', status: 'completed', content: [{ type: 'output_text', annotations: [{ type: 'file_path', file_id: 'cfile_68c2e7084ab48191a67824aa1f4c90f1' }], logprobs: [], text: "Heres a simulation of rolling two fair six-sided dice 10,000 times. Each trial sums the two dice.\n\nResults\n- Total sum of all 10,000 trials: 69,868\n- Average sum per trial: 6.9868\n- Minimum sum observed: 2\n- Maximum sum observed: 12\n- Sample of the first 20 trial sums: 6, 7, 2, 5, 5, 11, 4, 8, 10, 7, 5, 8, 8, 7, 10, 8, 9, 5, 4, 7\n\nFull data\n- You can download all 10,000 sums as a CSV file here: [Download the sums CSV](sandbox:/mnt/data/roll2dice_sums_10000.csv)\n\nIf you'd like, I can also provide a frequency distribution, histogram, or export the data in another format (JSON, Excel, etc.)." }], role: 'assistant' } })}\n\n`,
          `data:${JSON.stringify({
            type: 'response.completed',
            response: {
              id: 'resp_68c2e6efa238819383d5f52a2c2a3baa02d3a5742c7ddae9',
              object: 'response',
              created_at: 1757603567,
              status: 'completed',
              error: null,
              incomplete_details: null,
              instructions: null,
              max_output_tokens: null,
              model: 'gpt-5-nano-2025-08-07',
              output: [
                {
                  id: 'rs_68c2e6f40ba48193a1c27abf31130e7e02d3a5742c7ddae9',
                  type: 'reasoning',
                  summary: [],
                },
                {
                  id: 'ci_68c2e6f7b72c8193ba1f552552c8dc9202d3a5742c7ddae9',
                  type: 'code_interpreter_call',
                  status: 'completed',
                  code: 'import random, math\nN=10000\nsums=[]\ns=0\nfor _ in range(N):\n    a=random.randint(1,6)\n    b=random.randint(1,6)\n    sm=a+b\n    sums.append(sm)\n    s+=sm\nmin(sums), max(sums), sum(sums), sum(sums)/N\n',
                  container_id:
                    'cntr_68c2e6f380d881908a57a82d394434ff02f484f5344062e9',
                  outputs: [{ type: 'logs', logs: '(2, 12, 69868, 6.9868)' }],
                },
                {
                  id: 'rs_68c2e6fcb52881938f21c45741216ac002d3a5742c7ddae9',
                  type: 'reasoning',
                  summary: [],
                },
                {
                  id: 'ci_68c2e6fd57948193aa93df6bdb00a86d02d3a5742c7ddae9',
                  type: 'code_interpreter_call',
                  status: 'completed',
                  code: "import csv, pathlib\npath = pathlib.Path('/mnt/data/roll2dice_sums_10000.csv')\nwith open(path, 'w', newline='') as f:\n    writer = csv.writer(f)\n    writer.writerow(['sum'])\n    for val in sums:\n        writer.writerow([val])\npath, path.exists(), len(sums)\n",
                  container_id:
                    'cntr_68c2e6f380d881908a57a82d394434ff02f484f5344062e9',
                  outputs: [
                    {
                      type: 'logs',
                      logs: "(PosixPath('/mnt/data/roll2dice_sums_10000.csv'), True, 10000)",
                    },
                  ],
                },
                {
                  id: 'rs_68c2e6fff1808193a78d43410a1feb4802d3a5742c7ddae9',
                  type: 'reasoning',
                  summary: [],
                },
                {
                  id: 'ci_68c2e701a23081939c93b6fb5bb952d302d3a5742c7ddae9',
                  type: 'code_interpreter_call',
                  status: 'completed',
                  code: 'sums[:20]\n',
                  container_id:
                    'cntr_68c2e6f380d881908a57a82d394434ff02f484f5344062e9',
                  outputs: [
                    {
                      type: 'logs',
                      logs: '[6, 7, 2, 5, 5, 11, 4, 8, 10, 7, 5, 8, 8, 7, 10, 8, 9, 5, 4, 7]',
                    },
                  ],
                },
                {
                  id: 'rs_68c2e703d114819383c5da260649c7ce02d3a5742c7ddae9',
                  type: 'reasoning',
                  summary: [],
                },
                {
                  id: 'msg_68c2e7054ae481938354ab3e4e77abad02d3a5742c7ddae9',
                  type: 'message',
                  status: 'completed',
                  content: [
                    {
                      type: 'output_text',
                      annotations: [
                        {
                          type: 'file_path',
                          file_id: 'cfile_68c2e7084ab48191a67824aa1f4c90f1',
                        },
                      ],
                      logprobs: [],
                      text: "Here's a simulation of rolling two fair six-sided dice 10,000 times. Each trial sums the two dice.\n\nResults\n- Total sum of all 10,000 trials: 69,868\n- Average sum per trial: 6.9868\n- Minimum sum observed: 2\n- Maximum sum observed: 12\n- Sample of the first 20 trial sums: 6, 7, 2, 5, 5, 11, 4, 8, 10, 7, 5, 8, 8, 7, 10, 8, 9, 5, 4, 7\n\nFull data\n- You can download all 10,000 sums as a CSV file here: [Download the sums CSV](sandbox:/mnt/data/roll2dice_sums_10000.csv)\n\nIf you'd like, I can also provide a frequency distribution, histogram, or export the data in another format (JSON, Excel, etc.).",
                    },
                  ],
                  role: 'assistant',
                },
              ],
              parallel_tool_calls: true,
              previous_response_id: null,
              prompt_cache_key: null,
              reasoning: { effort: 'medium', summary: null },
              safety_identifier: null,
              store: true,
              temperature: 1,
              text: { format: { type: 'text' }, verbosity: 'medium' },
              tool_choice: 'auto',
              tools: [
                { type: 'code_interpreter', container: { type: 'auto' } },
              ],
              top_logprobs: 0,
              top_p: 1,
              truncation: 'disabled',
              usage: {
                input_tokens: 6047,
                input_tokens_details: { cached_tokens: 2944 },
                output_tokens: 1623,
                output_tokens_details: { reasoning_tokens: 1408 },
                total_tokens: 7670,
              },
              user: null,
              metadata: {},
            },
          })}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await createModel('gpt-4o').doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      const result = await convertReadableStreamToArray(stream);
      expect(result).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "filename": "cfile_68c2e7084ab48191a67824aa1f4c90f1",
            "id": "id-0",
            "mediaType": "application/octet-stream",
            "providerMetadata": {
              "openai": {
                "fileId": "cfile_68c2e7084ab48191a67824aa1f4c90f1",
              },
            },
            "sourceType": "document",
            "title": "cfile_68c2e7084ab48191a67824aa1f4c90f1",
            "type": "source",
          },
          {
            "id": "msg_68c2e7054ae481938354ab3e4e77abad02d3a5742c7ddae9",
            "providerMetadata": {
              "openai": {
                "annotations": [
                  {
                    "file_id": "cfile_68c2e7084ab48191a67824aa1f4c90f1",
                    "type": "file_path",
                  },
                ],
                "itemId": "msg_68c2e7054ae481938354ab3e4e77abad02d3a5742c7ddae9",
              },
            },
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "openai": {
                "responseId": null,
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 2944,
              "inputTokens": 6047,
              "outputTokens": 1623,
              "reasoningTokens": 1408,
              "totalTokens": 7670,
            },
          },
        ]
      `);
    });
  });
});
