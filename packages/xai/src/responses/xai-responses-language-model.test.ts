import { LanguageModelV2Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { XaiResponsesLanguageModel } from './xai-responses-language-model';
import type { XaiResponsesProviderOptions } from './xai-responses-options';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'hello' }] },
];

function createModel(modelId = 'grok-4-fast') {
  return new XaiResponsesLanguageModel(modelId, {
    provider: 'xai.responses',
    baseURL: 'https://api.x.ai/v1',
    headers: () => ({ Authorization: 'Bearer test-key' }),
    generateId: mockId(),
  });
}

describe('XaiResponsesLanguageModel', () => {
  const server = createTestServer({
    'https://api.x.ai/v1/responses': {},
  });

  function prepareJsonFixtureResponse(filename: string) {
    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(`src/responses/__fixtures__/${filename}.json`, 'utf8'),
      ),
    };
  }

  function prepareChunksFixtureResponse(filename: string) {
    const chunks = fs
      .readFileSync(`src/responses/__fixtures__/${filename}.chunks.txt`, 'utf8')
      .split('\n')
      .map(line => `data: ${line}\n\n`);
    chunks.push('data: [DONE]\n\n');

    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'stream-chunks',
      chunks,
    };
  }

  function prepareJsonResponse(body: Record<string, unknown>) {
    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'json-value',
      body,
    };
  }

  function prepareStreamChunks(chunks: string[]) {
    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'stream-chunks',
      chunks: chunks
        .map(chunk => `data: ${chunk}\n\n`)
        .concat('data: [DONE]\n\n'),
    };
  }

  describe('doGenerate', () => {
    describe('basic text generation', () => {
      it('should generate text content', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          created_at: 1700000000,
          status: 'completed',
          model: 'grok-4-fast',
          output: [
            {
              type: 'message',
              id: 'msg_123',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'hello world',
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
        });

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "text": "hello world",
              "type": "text",
            },
          ]
        `);
      });

      it('should extract usage correctly', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'grok-4-fast',
          output: [],
          usage: {
            input_tokens: 345,
            input_tokens_details: {
              cached_tokens: 50,
            },
            output_tokens: 538,
            output_tokens_details: {
              reasoning_tokens: 123,
            },
            total_tokens: 883,
          },
        });

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.usage).toMatchInlineSnapshot(`
          {
            "cachedInputTokens": 50,
            "inputTokens": 345,
            "outputTokens": 538,
            "reasoningTokens": 123,
            "totalTokens": 883,
          }
        `);
      });

      it('should extract finish reason from status', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'grok-4-fast',
          output: [],
          usage: { input_tokens: 10, output_tokens: 5 },
        });

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.finishReason).toBe('stop');
      });
    });

    describe('reasoning content', () => {
      it('should extract reasoning with encrypted content when store=false', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'grok-4-fast',
          output: [
            {
              type: 'reasoning',
              id: 'rs_456',
              status: 'completed',
              summary: [
                {
                  type: 'summary_text',
                  text: 'First, analyze the question carefully.',
                },
              ],
              encrypted_content: 'abc123encryptedcontent',
            },
            {
              type: 'message',
              id: 'msg_123',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'The answer is 42.',
                  annotations: [],
                },
              ],
            },
          ],
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            output_tokens_details: {
              reasoning_tokens: 15,
            },
          },
        });

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": {
                "xai": {
                  "itemId": "rs_456",
                  "reasoningEncryptedContent": "abc123encryptedcontent",
                },
              },
              "text": "First, analyze the question carefully.",
              "type": "reasoning",
            },
            {
              "text": "The answer is 42.",
              "type": "text",
            },
          ]
        `);
      });

      it('should handle reasoning without encrypted content', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'grok-4-fast',
          output: [
            {
              type: 'reasoning',
              id: 'rs_456',
              status: 'completed',
              summary: [
                {
                  type: 'summary_text',
                  text: 'Thinking through the problem.',
                },
              ],
            },
            {
              type: 'message',
              id: 'msg_123',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'Solution found.',
                  annotations: [],
                },
              ],
            },
          ],
          usage: {
            input_tokens: 10,
            output_tokens: 15,
          },
        });

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": {
                "xai": {
                  "itemId": "rs_456",
                },
              },
              "text": "Thinking through the problem.",
              "type": "reasoning",
            },
            {
              "text": "Solution found.",
              "type": "text",
            },
          ]
        `);
      });
    });

    describe('settings and options', () => {
      it('should send model id and settings', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'grok-4-fast',
          output: [],
          usage: { input_tokens: 10, output_tokens: 5 },
        });

        await createModel('grok-4-fast').doGenerate({
          prompt: [
            { role: 'system', content: 'you are helpful' },
            { role: 'user', content: [{ type: 'text', text: 'hello' }] },
          ],
          temperature: 0.5,
          topP: 0.9,
          maxOutputTokens: 100,
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": "you are helpful",
                "role": "system",
              },
              {
                "content": [
                  {
                    "text": "hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "max_output_tokens": 100,
            "model": "grok-4-fast",
            "temperature": 0.5,
            "top_p": 0.9,
          }
        `);
      });

      describe('provider options', () => {
        it('reasoningEffort', async () => {
          prepareJsonResponse({
            id: 'resp_123',
            object: 'response',
            status: 'completed',
            model: 'grok-4-fast',
            output: [],
            usage: { input_tokens: 10, output_tokens: 5 },
          });

          await createModel().doGenerate({
            prompt: TEST_PROMPT,
            providerOptions: {
              xai: {
                reasoningEffort: 'high',
              } satisfies XaiResponsesProviderOptions,
            },
          });

          const requestBody = await server.calls[0].requestBodyJson;
          expect(requestBody.reasoning.effort).toBe('high');
        });

        it('store:true', async () => {
          prepareJsonResponse({
            id: 'resp_123',
            object: 'response',
            status: 'completed',
            model: 'grok-4-fast',
            output: [],
            usage: { input_tokens: 10, output_tokens: 5 },
          });

          await createModel().doGenerate({
            prompt: TEST_PROMPT,
            providerOptions: {
              xai: {
                store: true,
              } satisfies XaiResponsesProviderOptions,
            },
          });

          const requestBody = await server.calls[0].requestBodyJson;
          expect(requestBody.store).toBe(undefined);
          expect(requestBody.include).toBe(undefined);
        });

        it('store:false', async () => {
          prepareJsonResponse({
            id: 'resp_123',
            object: 'response',
            status: 'completed',
            model: 'grok-4-fast',
            output: [],
            usage: { input_tokens: 10, output_tokens: 5 },
          });

          await createModel().doGenerate({
            prompt: TEST_PROMPT,
            providerOptions: {
              xai: {
                store: false,
              } satisfies XaiResponsesProviderOptions,
            },
          });

          const requestBody = await server.calls[0].requestBodyJson;
          expect(requestBody.store).toBe(false);
          expect(requestBody.include).toStrictEqual([
            'reasoning.encrypted_content',
          ]);
        });

        it('previousResponseId', async () => {
          prepareJsonResponse({
            id: 'resp_123',
            object: 'response',
            status: 'completed',
            model: 'grok-4-fast',
            output: [],
            usage: { input_tokens: 10, output_tokens: 5 },
          });

          await createModel().doGenerate({
            prompt: TEST_PROMPT,
            providerOptions: {
              xai: {
                previousResponseId: 'resp_456',
              } satisfies XaiResponsesProviderOptions,
            },
          });

          const requestBody = await server.calls[0].requestBodyJson;
          expect(requestBody.previous_response_id).toBe('resp_456');
        });
      });

      it('should warn about unsupported stopSequences', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'grok-4-fast',
          output: [],
          usage: { input_tokens: 10, output_tokens: 5 },
        });

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          stopSequences: ['\n\n', 'STOP'],
        });

        expect(result.warnings).toMatchInlineSnapshot(`
          [
            {
              "setting": "stopSequences",
              "type": "unsupported-setting",
            },
          ]
        `);
      });

      describe('responseFormat', () => {
        it('should send response format json schema', async () => {
          prepareJsonResponse({
            id: 'resp_123',
            object: 'response',
            status: 'completed',
            model: 'grok-4-fast',
            output: [],
            usage: { input_tokens: 10, output_tokens: 5 },
          });

          await createModel().doGenerate({
            prompt: TEST_PROMPT,
            responseFormat: {
              type: 'json',
              name: 'recipe',
              description: 'A recipe object',
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  ingredients: { type: 'array', items: { type: 'string' } },
                },
                required: ['name', 'ingredients'],
                additionalProperties: false,
              },
            },
          });

          expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
            {
              "input": [
                {
                  "content": [
                    {
                      "text": "hello",
                      "type": "input_text",
                    },
                  ],
                  "role": "user",
                },
              ],
              "model": "grok-4-fast",
              "text": {
                "format": {
                  "description": "A recipe object",
                  "name": "recipe",
                  "schema": {
                    "additionalProperties": false,
                    "properties": {
                      "ingredients": {
                        "items": {
                          "type": "string",
                        },
                        "type": "array",
                      },
                      "name": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "name",
                      "ingredients",
                    ],
                    "type": "object",
                  },
                  "strict": true,
                  "type": "json_schema",
                },
              },
            }
          `);
        });

        it('should send response format json object when no schema provided', async () => {
          prepareJsonResponse({
            id: 'resp_123',
            object: 'response',
            status: 'completed',
            model: 'grok-4-fast',
            output: [],
            usage: { input_tokens: 10, output_tokens: 5 },
          });

          await createModel().doGenerate({
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
                      "text": "hello",
                      "type": "input_text",
                    },
                  ],
                  "role": "user",
                },
              ],
              "model": "grok-4-fast",
              "text": {
                "format": {
                  "type": "json_object",
                },
              },
            }
          `);
        });

        it('should use default name when responseFormat.name is not provided', async () => {
          prepareJsonResponse({
            id: 'resp_123',
            object: 'response',
            status: 'completed',
            model: 'grok-4-fast',
            output: [],
            usage: { input_tokens: 10, output_tokens: 5 },
          });

          await createModel().doGenerate({
            prompt: TEST_PROMPT,
            responseFormat: {
              type: 'json',
              schema: {
                type: 'object',
                properties: { value: { type: 'string' } },
              },
            },
          });

          const requestBody = await server.calls[0].requestBodyJson;
          expect(requestBody.text.format.name).toBe('response');
        });
      });
    });

    describe('web_search tool', () => {
      let result: Awaited<
        ReturnType<(typeof createModel)['prototype']['doGenerate']>
      >;

      beforeEach(async () => {
        prepareJsonFixtureResponse('xai-web-search-tool.1');

        result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.web_search',
              name: 'web_search',
              args: {},
            },
          ],
        });
      });

      it('should include web_search tool call with providerExecuted true', async () => {
        expect(result.content).toMatchSnapshot();
      });

      it('should send web_search tool with args in request', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'grok-4-fast',
          output: [],
          usage: { input_tokens: 10, output_tokens: 5 },
        });

        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.web_search',
              name: 'web_search',
              args: {
                allowedDomains: ['wikipedia.org'],
                enableImageUnderstanding: true,
              },
            },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "hello",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "grok-4-fast",
            "tools": [
              {
                "type": "web_search",
              },
            ],
          }
        `);
      });
    });

    describe('x_search tool', () => {
      it('should include x_search tool call with real response', async () => {
        prepareJsonFixtureResponse('xai-x-search-tool.1');

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.x_search',
              name: 'x_search',
              args: {},
            },
          ],
        });

        expect(result.content).toMatchSnapshot();
      });
    });

    describe('code_interpreter tool', () => {
      it('should include code_interpreter tool call with real response', async () => {
        prepareJsonFixtureResponse('xai-code-execution-tool.1');

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.code_execution',
              name: 'code_execution',
              args: {},
            },
          ],
        });

        expect(result.content).toMatchSnapshot();
      });
    });

    describe('function tools', () => {
      it('should include function tool calls without providerExecuted', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'grok-4-fast',
          output: [
            {
              type: 'function_call',
              id: 'fc_123',
              name: 'weather',
              arguments: '{"location":"sf"}',
              call_id: 'call_123',
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        });

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'weather',
              description: 'get weather',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
              },
            },
          ],
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "input": "{"location":"sf"}",
              "toolCallId": "call_123",
              "toolName": "weather",
              "type": "tool-call",
            },
          ]
        `);
      });
    });

    describe('citations', () => {
      it('should extract citations from annotations', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'grok-4-fast',
          output: [
            {
              type: 'message',
              id: 'msg_123',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'based on research',
                  annotations: [
                    {
                      type: 'url_citation',
                      url: 'https://example.com',
                      title: 'example title',
                    },
                    {
                      type: 'url_citation',
                      url: 'https://test.com',
                    },
                  ],
                },
              ],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        });

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "text": "based on research",
              "type": "text",
            },
            {
              "id": "id-0",
              "sourceType": "url",
              "title": "example title",
              "type": "source",
              "url": "https://example.com",
            },
            {
              "id": "id-1",
              "sourceType": "url",
              "title": "https://test.com",
              "type": "source",
              "url": "https://test.com",
            },
          ]
        `);
      });
    });

    describe('multiple tools', () => {
      it('should handle multiple server-side tools', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'grok-4-fast',
          output: [
            {
              type: 'web_search_call',
              id: 'ws_123',
              name: 'web_search',
              arguments: '{}',
              call_id: '',
              status: 'completed',
            },
            {
              type: 'code_interpreter_call',
              id: 'code_123',
              name: 'code_execution',
              arguments: '{}',
              call_id: '',
              status: 'completed',
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        });

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.web_search',
              name: 'web_search',
              args: {},
            },
            {
              type: 'provider-defined',
              id: 'xai.code_execution',
              name: 'code_execution',
              args: {},
            },
          ],
        });

        expect(result.content).toHaveLength(2);
        expect(result.content[0].type).toBe('tool-call');
        expect(result.content[1].type).toBe('tool-call');
      });
    });

    describe('tool name mapping by type', () => {
      it('should map web_search_call type to web_search tool name when name is empty', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'grok-4-fast',
          output: [
            {
              type: 'web_search_call',
              id: 'ws_123',
              name: '',
              arguments: '{"query":"test"}',
              call_id: '',
              status: 'completed',
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        });

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.web_search',
              name: 'web_search',
              args: {},
            },
          ],
        });

        expect(result.content).toEqual([
          {
            type: 'tool-call',
            toolCallId: 'ws_123',
            toolName: 'web_search',
            input: '{"query":"test"}',
            providerExecuted: true,
          },
        ]);
      });

      it('should map x_search_call type to x_search tool name when name is empty', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'grok-4-fast',
          output: [
            {
              type: 'x_search_call',
              id: 'xs_123',
              name: '',
              arguments: '{"query":"test"}',
              call_id: '',
              status: 'completed',
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        });

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.x_search',
              name: 'x_search',
              args: {},
            },
          ],
        });

        expect(result.content).toEqual([
          {
            type: 'tool-call',
            toolCallId: 'xs_123',
            toolName: 'x_search',
            input: '{"query":"test"}',
            providerExecuted: true,
          },
        ]);
      });

      it('should map code_interpreter_call type to code_execution tool name when name is empty', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'grok-4-fast',
          output: [
            {
              type: 'code_interpreter_call',
              id: 'ci_123',
              name: '',
              arguments: '{}',
              call_id: '',
              status: 'completed',
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        });

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.code_execution',
              name: 'code_execution',
              args: {},
            },
          ],
        });

        expect(result.content).toEqual([
          {
            type: 'tool-call',
            toolCallId: 'ci_123',
            toolName: 'code_execution',
            input: '{}',
            providerExecuted: true,
          },
        ]);
      });

      it('should map code_execution_call type to code_execution tool name when name is empty', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'grok-4-fast',
          output: [
            {
              type: 'code_execution_call',
              id: 'ce_123',
              name: '',
              arguments: '{}',
              call_id: '',
              status: 'completed',
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        });

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.code_execution',
              name: 'code_execution',
              args: {},
            },
          ],
        });

        expect(result.content).toEqual([
          {
            type: 'tool-call',
            toolCallId: 'ce_123',
            toolName: 'code_execution',
            input: '{}',
            providerExecuted: true,
          },
        ]);
      });

      it('should use custom tool name from provider tool when type matches', async () => {
        prepareJsonResponse({
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'grok-4-fast',
          output: [
            {
              type: 'web_search_call',
              id: 'ws_123',
              name: '',
              arguments: '{}',
              call_id: '',
              status: 'completed',
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        });

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.web_search',
              name: 'my_custom_search',
              args: {},
            },
          ],
        });

        expect(result.content).toEqual([
          {
            type: 'tool-call',
            toolCallId: 'ws_123',
            toolName: 'my_custom_search',
            input: '{}',
            providerExecuted: true,
          },
        ]);
      });
    });
  });

  describe('doStream', () => {
    describe('text streaming', () => {
      it('should stream web search with real response', async () => {
        prepareChunksFixtureResponse('xai-web-search-tool.1');

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.web_search',
              name: 'web_search',
              args: {},
            },
          ],
        });

        const parts = await convertReadableStreamToArray(stream);

        expect(parts).toMatchSnapshot();
      });

      it('should stream text deltas', async () => {
        prepareChunksFixtureResponse('xai-text-streaming.1');

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(stream);

        expect(parts).toMatchSnapshot();
      });

      it('should stream text deltas with reasoning', async () => {
        prepareChunksFixtureResponse('xai-text-with-reasoning-streaming.1');

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(stream);

        expect(parts).toMatchSnapshot();
      });

      it('should stream text deltas with encrypted reasoning', async () => {
        prepareChunksFixtureResponse(
          'xai-text-with-reasoning-streaming-store-false.1',
        );

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(stream);

        expect(parts).toMatchSnapshot();
      });

      it('should include encrypted content in reasoning-end providerMetadata', async () => {
        prepareStreamChunks([
          JSON.stringify({
            type: 'response.created',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-4-fast',
              output: [],
            },
          }),
          JSON.stringify({
            type: 'response.output_item.added',
            item: {
              type: 'reasoning',
              id: 'rs_456',
              status: 'in_progress',
              summary: [],
            },
            output_index: 0,
          }),
          JSON.stringify({
            type: 'response.reasoning_summary_part.added',
            item_id: 'rs_456',
            output_index: 0,
            summary_index: 0,
            part: { type: 'summary_text', text: '' },
          }),
          JSON.stringify({
            type: 'response.reasoning_summary_text.delta',
            item_id: 'rs_456',
            output_index: 0,
            summary_index: 0,
            delta: 'Analyzing...',
          }),
          JSON.stringify({
            type: 'response.reasoning_summary_text.done',
            item_id: 'rs_456',
            output_index: 0,
            summary_index: 0,
            text: 'Analyzing...',
          }),
          JSON.stringify({
            type: 'response.output_item.done',
            item: {
              type: 'reasoning',
              id: 'rs_456',
              status: 'completed',
              summary: [{ type: 'summary_text', text: 'Analyzing...' }],
              encrypted_content: 'encrypted_data_abc123',
            },
            output_index: 0,
          }),
          JSON.stringify({
            type: 'response.output_item.added',
            item: {
              type: 'message',
              id: 'msg_789',
              role: 'assistant',
              status: 'in_progress',
              content: [],
            },
            output_index: 1,
          }),
          JSON.stringify({
            type: 'response.output_text.delta',
            item_id: 'msg_789',
            output_index: 1,
            content_index: 0,
            delta: 'Result.',
          }),
          JSON.stringify({
            type: 'response.done',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-4-fast',
              status: 'completed',
              output: [],
              usage: { input_tokens: 10, output_tokens: 20 },
            },
          }),
        ]);

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(stream);

        const reasoningEnd = parts.find(part => part.type === 'reasoning-end');
        expect(reasoningEnd).toMatchInlineSnapshot(`
          {
            "id": "reasoning-rs_456",
            "providerMetadata": {
              "xai": {
                "itemId": "rs_456",
                "reasoningEncryptedContent": "encrypted_data_abc123",
              },
            },
            "type": "reasoning-end",
          }
        `);
      });

      it('should emit reasoning-start before reasoning-end when reasoning_summary_part.added is not sent', async () => {
        // This test covers the case where xAI sends encrypted reasoning without
        // streaming the reasoning summary text (no reasoning_summary_part.added events)
        prepareStreamChunks([
          JSON.stringify({
            type: 'response.created',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-4-fast',
              output: [],
            },
          }),
          JSON.stringify({
            type: 'response.output_item.added',
            item: {
              type: 'reasoning',
              id: 'rs_456',
              status: 'in_progress',
              summary: [],
            },
            output_index: 0,
          }),
          // Note: No response.reasoning_summary_part.added event
          // This happens with encrypted reasoning when store=false
          JSON.stringify({
            type: 'response.output_item.done',
            item: {
              type: 'reasoning',
              id: 'rs_456',
              status: 'completed',
              summary: [],
              encrypted_content: 'encrypted_reasoning_content_xyz',
            },
            output_index: 0,
          }),
          JSON.stringify({
            type: 'response.output_item.added',
            item: {
              type: 'message',
              id: 'msg_789',
              role: 'assistant',
              status: 'in_progress',
              content: [],
            },
            output_index: 1,
          }),
          JSON.stringify({
            type: 'response.output_text.delta',
            item_id: 'msg_789',
            output_index: 1,
            content_index: 0,
            delta: 'The answer is 42.',
          }),
          JSON.stringify({
            type: 'response.done',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-4-fast',
              status: 'completed',
              output: [],
              usage: { input_tokens: 10, output_tokens: 20 },
            },
          }),
        ]);

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(stream);

        // Verify reasoning-start is emitted before reasoning-end
        const reasoningStart = parts.find(
          part => part.type === 'reasoning-start',
        );
        const reasoningEnd = parts.find(part => part.type === 'reasoning-end');

        expect(reasoningStart).toMatchInlineSnapshot(`
          {
            "id": "reasoning-rs_456",
            "providerMetadata": {
              "xai": {
                "itemId": "rs_456",
              },
            },
            "type": "reasoning-start",
          }
        `);

        expect(reasoningEnd).toMatchInlineSnapshot(`
          {
            "id": "reasoning-rs_456",
            "providerMetadata": {
              "xai": {
                "itemId": "rs_456",
                "reasoningEncryptedContent": "encrypted_reasoning_content_xyz",
              },
            },
            "type": "reasoning-end",
          }
        `);

        // Verify reasoning-start comes before reasoning-end in the stream
        const reasoningStartIndex = parts.findIndex(
          part => part.type === 'reasoning-start',
        );
        const reasoningEndIndex = parts.findIndex(
          part => part.type === 'reasoning-end',
        );
        expect(reasoningStartIndex).toBeLessThan(reasoningEndIndex);
      });

      it('should stream reasoning text deltas (response.reasoning_text.delta)', async () => {
        prepareStreamChunks([
          JSON.stringify({
            type: 'response.created',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-code-fast-1',
              output: [],
            },
          }),
          JSON.stringify({
            type: 'response.output_item.added',
            item: {
              type: 'reasoning',
              id: 'rs_456',
              status: 'in_progress',
              summary: [],
            },
            output_index: 0,
          }),
          JSON.stringify({
            type: 'response.reasoning_text.delta',
            item_id: 'rs_456',
            output_index: 0,
            content_index: 0,
            delta: 'First',
          }),
          JSON.stringify({
            type: 'response.reasoning_text.delta',
            item_id: 'rs_456',
            output_index: 0,
            content_index: 0,
            delta: ', analyze the question.',
          }),
          JSON.stringify({
            type: 'response.reasoning_text.done',
            item_id: 'rs_456',
            output_index: 0,
            content_index: 0,
            text: 'First, analyze the question.',
          }),
          JSON.stringify({
            type: 'response.output_item.done',
            item: {
              type: 'reasoning',
              id: 'rs_456',
              status: 'completed',
              summary: [
                { type: 'summary_text', text: 'First, analyze the question.' },
              ],
            },
            output_index: 0,
          }),
          JSON.stringify({
            type: 'response.output_item.added',
            item: {
              type: 'message',
              id: 'msg_789',
              role: 'assistant',
              status: 'in_progress',
              content: [],
            },
            output_index: 1,
          }),
          JSON.stringify({
            type: 'response.output_text.delta',
            item_id: 'msg_789',
            output_index: 1,
            content_index: 0,
            delta: 'The answer.',
          }),
          JSON.stringify({
            type: 'response.done',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-code-fast-1',
              status: 'completed',
              output: [],
              usage: {
                input_tokens: 10,
                output_tokens: 20,
                output_tokens_details: { reasoning_tokens: 15 },
              },
            },
          }),
        ]);

        const { stream } = await createModel('grok-code-fast-1').doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(stream);

        const reasoningStart = parts.find(
          part => part.type === 'reasoning-start',
        );
        expect(reasoningStart).toMatchInlineSnapshot(`
          {
            "id": "reasoning-rs_456",
            "providerMetadata": {
              "xai": {
                "itemId": "rs_456",
              },
            },
            "type": "reasoning-start",
          }
        `);

        const reasoningDeltas = parts.filter(
          part => part.type === 'reasoning-delta',
        );
        expect(reasoningDeltas).toHaveLength(2);
        expect(reasoningDeltas[0].delta).toBe('First');
        expect(reasoningDeltas[1].delta).toBe(', analyze the question.');

        const reasoningEnd = parts.find(part => part.type === 'reasoning-end');
        expect(reasoningEnd).toMatchInlineSnapshot(`
          {
            "id": "reasoning-rs_456",
            "providerMetadata": {
              "xai": {
                "itemId": "rs_456",
              },
            },
            "type": "reasoning-end",
          }
        `);

        // Verify ordering: reasoning-start < reasoning-deltas < reasoning-end < text
        const startIdx = parts.findIndex(p => p.type === 'reasoning-start');
        const firstDeltaIdx = parts.findIndex(
          p => p.type === 'reasoning-delta',
        );
        const endIdx = parts.findIndex(p => p.type === 'reasoning-end');
        const textIdx = parts.findIndex(p => p.type === 'text-delta');
        expect(startIdx).toBeLessThan(firstDeltaIdx);
        expect(firstDeltaIdx).toBeLessThan(endIdx);
        expect(endIdx).toBeLessThan(textIdx);
      });

      it('should stream x_search tool call', async () => {
        prepareChunksFixtureResponse('xai-x-search-tool');

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.x_search',
              name: 'x_search',
              args: {},
            },
          ],
        });

        const parts = await convertReadableStreamToArray(stream);

        expect(parts).toMatchSnapshot();
      });

      it('should not emit duplicate text-delta from response.output_item.done after streaming', async () => {
        prepareStreamChunks([
          JSON.stringify({
            type: 'response.created',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-4-fast',
              created_at: 1700000000,
              status: 'in_progress',
              output: [],
            },
          }),
          // Message item added - should emit text-start
          JSON.stringify({
            type: 'response.output_item.added',
            item: {
              type: 'message',
              id: 'msg_123',
              status: 'in_progress',
              role: 'assistant',
              content: [],
            },
            output_index: 0,
          }),
          // Stream text deltas
          JSON.stringify({
            type: 'response.output_text.delta',
            item_id: 'msg_123',
            output_index: 0,
            content_index: 0,
            delta: 'Hello',
          }),
          JSON.stringify({
            type: 'response.output_text.delta',
            item_id: 'msg_123',
            output_index: 0,
            content_index: 0,
            delta: ' ',
          }),
          JSON.stringify({
            type: 'response.output_text.delta',
            item_id: 'msg_123',
            output_index: 0,
            content_index: 0,
            delta: 'world',
          }),
          // Message item done - should NOT emit text-delta with full text
          JSON.stringify({
            type: 'response.output_item.done',
            item: {
              type: 'message',
              id: 'msg_123',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'Hello world', // Full accumulated text
                  annotations: [],
                },
              ],
            },
            output_index: 0,
          }),
          JSON.stringify({
            type: 'response.done',
            response: {
              id: 'resp_123',
              object: 'response',
              status: 'completed',
              output: [],
              usage: { input_tokens: 10, output_tokens: 5 },
            },
          }),
        ]);

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(stream);

        // Count text-delta events
        const textDeltas = parts.filter(part => part.type === 'text-delta');

        // Should only have 3 text-deltas from streaming, NOT 4 (with duplicate full text)
        expect(textDeltas).toHaveLength(3);
        expect(textDeltas.map(d => d.delta)).toEqual(['Hello', ' ', 'world']);

        // Verify there's no text-delta with the full accumulated text
        const fullTextDelta = textDeltas.find(d => d.delta === 'Hello world');
        expect(fullTextDelta).toBeUndefined();
      });
    });

    describe('tool call streaming', () => {
      it('should stream web_search tool calls', async () => {
        prepareStreamChunks([
          JSON.stringify({
            type: 'response.created',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-4-fast',
              status: 'in_progress',
              output: [],
            },
          }),
          JSON.stringify({
            type: 'response.output_item.added',
            item: {
              type: 'web_search_call',
              id: 'ws_123',
              name: 'web_search',
              arguments: '{"query":"test"}',
              call_id: '',
              status: 'completed',
            },
            output_index: 0,
          }),
          JSON.stringify({
            type: 'response.done',
            response: {
              id: 'resp_123',
              object: 'response',
              status: 'completed',
              output: [],
              usage: { input_tokens: 10, output_tokens: 5 },
            },
          }),
        ]);

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.web_search',
              name: 'web_search',
              args: {},
            },
          ],
        });

        const parts = await convertReadableStreamToArray(stream);

        expect(parts).toContainEqual({
          type: 'tool-call',
          toolCallId: 'ws_123',
          toolName: 'web_search',
          input: '{"query":"test"}',
          providerExecuted: true,
        });
      });

      it('should stream function tool call arguments', async () => {
        prepareStreamChunks([
          JSON.stringify({
            type: 'response.created',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-4-fast',
              status: 'in_progress',
              output: [],
            },
          }),
          JSON.stringify({
            type: 'response.output_item.added',
            output_index: 0,
            item: {
              type: 'function_call',
              id: 'fc_123',
              call_id: 'call_123',
              name: 'weather',
              arguments: '',
              status: 'in_progress',
            },
          }),
          JSON.stringify({
            type: 'response.function_call_arguments.delta',
            item_id: 'fc_123',
            output_index: 0,
            delta: '{"location"',
          }),
          JSON.stringify({
            type: 'response.function_call_arguments.delta',
            item_id: 'fc_123',
            output_index: 0,
            delta: ':"sf"}',
          }),
          JSON.stringify({
            type: 'response.function_call_arguments.done',
            item_id: 'fc_123',
            output_index: 0,
            arguments: '{"location":"sf"}',
          }),
          JSON.stringify({
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'function_call',
              id: 'fc_123',
              call_id: 'call_123',
              name: 'weather',
              arguments: '{"location":"sf"}',
              status: 'completed',
            },
          }),
          JSON.stringify({
            type: 'response.done',
            response: {
              id: 'resp_123',
              object: 'response',
              status: 'completed',
              output: [],
              usage: { input_tokens: 10, output_tokens: 5 },
            },
          }),
        ]);

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'weather',
              description: 'get weather',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
              },
            },
          ],
        });

        const parts = await convertReadableStreamToArray(stream);

        expect(parts).toContainEqual({
          type: 'tool-input-start',
          id: 'call_123',
          toolName: 'weather',
        });
        expect(parts).toContainEqual({
          type: 'tool-input-delta',
          id: 'call_123',
          delta: '{"location"',
        });
        expect(parts).toContainEqual({
          type: 'tool-input-delta',
          id: 'call_123',
          delta: ':"sf"}',
        });
        expect(parts).toContainEqual({
          type: 'tool-input-end',
          id: 'call_123',
        });
        expect(parts).toContainEqual({
          type: 'tool-call',
          toolCallId: 'call_123',
          toolName: 'weather',
          input: '{"location":"sf"}',
        });
      });
    });

    describe('tool name mapping by type in streaming', () => {
      it('should map web_search_call type to web_search tool name when name is empty', async () => {
        prepareStreamChunks([
          JSON.stringify({
            type: 'response.created',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-4-fast',
              status: 'in_progress',
              output: [],
            },
          }),
          JSON.stringify({
            type: 'response.output_item.added',
            item: {
              type: 'web_search_call',
              id: 'ws_123',
              name: '',
              arguments: '{"query":"test"}',
              call_id: '',
              status: 'completed',
            },
            output_index: 0,
          }),
          JSON.stringify({
            type: 'response.done',
            response: {
              id: 'resp_123',
              object: 'response',
              status: 'completed',
              output: [],
              usage: { input_tokens: 10, output_tokens: 5 },
            },
          }),
        ]);

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.web_search',
              name: 'web_search',
              args: {},
            },
          ],
        });

        const parts = await convertReadableStreamToArray(stream);

        expect(parts).toContainEqual({
          type: 'tool-call',
          toolCallId: 'ws_123',
          toolName: 'web_search',
          input: '{"query":"test"}',
          providerExecuted: true,
        });
      });

      it('should map x_search_call type to x_search tool name when name is empty', async () => {
        prepareStreamChunks([
          JSON.stringify({
            type: 'response.created',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-4-fast',
              status: 'in_progress',
              output: [],
            },
          }),
          JSON.stringify({
            type: 'response.output_item.added',
            item: {
              type: 'x_search_call',
              id: 'xs_123',
              name: '',
              arguments: '{"query":"test"}',
              call_id: '',
              status: 'completed',
            },
            output_index: 0,
          }),
          JSON.stringify({
            type: 'response.done',
            response: {
              id: 'resp_123',
              object: 'response',
              status: 'completed',
              output: [],
              usage: { input_tokens: 10, output_tokens: 5 },
            },
          }),
        ]);

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.x_search',
              name: 'x_search',
              args: {},
            },
          ],
        });

        const parts = await convertReadableStreamToArray(stream);

        expect(parts).toContainEqual({
          type: 'tool-call',
          toolCallId: 'xs_123',
          toolName: 'x_search',
          input: '{"query":"test"}',
          providerExecuted: true,
        });
      });

      it('should map code_interpreter_call type to code_execution tool name when name is empty', async () => {
        prepareStreamChunks([
          JSON.stringify({
            type: 'response.created',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-4-fast',
              status: 'in_progress',
              output: [],
            },
          }),
          JSON.stringify({
            type: 'response.output_item.added',
            item: {
              type: 'code_interpreter_call',
              id: 'ci_123',
              name: '',
              arguments: '{}',
              call_id: '',
              status: 'completed',
            },
            output_index: 0,
          }),
          JSON.stringify({
            type: 'response.done',
            response: {
              id: 'resp_123',
              object: 'response',
              status: 'completed',
              output: [],
              usage: { input_tokens: 10, output_tokens: 5 },
            },
          }),
        ]);

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.code_execution',
              name: 'code_execution',
              args: {},
            },
          ],
        });

        const parts = await convertReadableStreamToArray(stream);

        expect(parts).toContainEqual({
          type: 'tool-call',
          toolCallId: 'ci_123',
          toolName: 'code_execution',
          input: '{}',
          providerExecuted: true,
        });
      });

      it('should map code_execution_call type to code_execution tool name when name is empty', async () => {
        prepareStreamChunks([
          JSON.stringify({
            type: 'response.created',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-4-fast',
              status: 'in_progress',
              output: [],
            },
          }),
          JSON.stringify({
            type: 'response.output_item.added',
            item: {
              type: 'code_execution_call',
              id: 'ce_123',
              name: '',
              arguments: '{}',
              call_id: '',
              status: 'completed',
            },
            output_index: 0,
          }),
          JSON.stringify({
            type: 'response.done',
            response: {
              id: 'resp_123',
              object: 'response',
              status: 'completed',
              output: [],
              usage: { input_tokens: 10, output_tokens: 5 },
            },
          }),
        ]);

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.code_execution',
              name: 'code_execution',
              args: {},
            },
          ],
        });

        const parts = await convertReadableStreamToArray(stream);

        expect(parts).toContainEqual({
          type: 'tool-call',
          toolCallId: 'ce_123',
          toolName: 'code_execution',
          input: '{}',
          providerExecuted: true,
        });
      });

      it('should use custom tool name from provider tool when type matches', async () => {
        prepareStreamChunks([
          JSON.stringify({
            type: 'response.created',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-4-fast',
              status: 'in_progress',
              output: [],
            },
          }),
          JSON.stringify({
            type: 'response.output_item.added',
            item: {
              type: 'web_search_call',
              id: 'ws_123',
              name: '',
              arguments: '{}',
              call_id: '',
              status: 'completed',
            },
            output_index: 0,
          }),
          JSON.stringify({
            type: 'response.done',
            response: {
              id: 'resp_123',
              object: 'response',
              status: 'completed',
              output: [],
              usage: { input_tokens: 10, output_tokens: 5 },
            },
          }),
        ]);

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider-defined',
              id: 'xai.web_search',
              name: 'my_custom_search',
              args: {},
            },
          ],
        });

        const parts = await convertReadableStreamToArray(stream);

        expect(parts).toContainEqual({
          type: 'tool-call',
          toolCallId: 'ws_123',
          toolName: 'my_custom_search',
          input: '{}',
          providerExecuted: true,
        });
      });
    });

    describe('citation streaming', () => {
      it('should stream citations as sources', async () => {
        prepareStreamChunks([
          JSON.stringify({
            type: 'response.created',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-4-fast',
              status: 'in_progress',
              output: [],
            },
          }),
          JSON.stringify({
            type: 'response.output_text.annotation.added',
            item_id: 'msg_123',
            output_index: 0,
            content_index: 0,
            annotation_index: 0,
            annotation: {
              type: 'url_citation',
              url: 'https://example.com',
              title: 'example',
            },
          }),
          JSON.stringify({
            type: 'response.done',
            response: {
              id: 'resp_123',
              object: 'response',
              status: 'completed',
              output: [],
              usage: { input_tokens: 10, output_tokens: 5 },
            },
          }),
        ]);

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(stream);

        expect(parts).toContainEqual({
          type: 'source',
          sourceType: 'url',
          id: 'id-0',
          url: 'https://example.com',
          title: 'example',
        });
      });
    });

    describe('usage streaming', () => {
      it('should extract usage with cached input tokens', async () => {
        prepareStreamChunks([
          JSON.stringify({
            type: 'response.created',
            response: {
              id: 'resp_123',
              object: 'response',
              model: 'grok-4-fast',
              status: 'in_progress',
              output: [],
            },
          }),
          JSON.stringify({
            type: 'response.done',
            response: {
              id: 'resp_123',
              object: 'response',
              status: 'completed',
              output: [],
              usage: {
                input_tokens: 345,
                input_tokens_details: {
                  cached_tokens: 50,
                },
                output_tokens: 538,
                output_tokens_details: {
                  reasoning_tokens: 123,
                },
                total_tokens: 883,
              },
            },
          }),
        ]);

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(stream);

        const finishPart = parts.find(part => part.type === 'finish');
        expect(finishPart).toMatchInlineSnapshot(`
          {
            "finishReason": "stop",
            "type": "finish",
            "usage": {
              "cachedInputTokens": 50,
              "inputTokens": 345,
              "outputTokens": 538,
              "reasoningTokens": 123,
              "totalTokens": 883,
            },
          }
        `);
      });
    });
  });

  describe('schema validation', () => {
    it('should accept response.created with usage: null', async () => {
      prepareStreamChunks([
        JSON.stringify({
          type: 'response.created',
          response: {
            id: 'resp_123',
            object: 'response',
            model: 'grok-4-fast',
            created_at: 1700000000,
            status: 'in_progress',
            output: [],
            usage: null,
          },
        }),
        JSON.stringify({
          type: 'response.output_item.added',
          item: {
            id: 'msg_001',
            type: 'message',
            role: 'assistant',
            content: [],
            status: 'in_progress',
          },
          output_index: 0,
        }),
        JSON.stringify({
          type: 'response.content_part.added',
          item_id: 'msg_001',
          output_index: 0,
          content_index: 0,
          part: { type: 'output_text', text: '' },
        }),
        JSON.stringify({
          type: 'response.output_text.delta',
          item_id: 'msg_001',
          output_index: 0,
          content_index: 0,
          delta: 'Hello',
        }),
        JSON.stringify({
          type: 'response.completed',
          response: {
            id: 'resp_123',
            object: 'response',
            model: 'grok-4-fast',
            created_at: 1700000000,
            status: 'completed',
            output: [
              {
                id: 'msg_001',
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Hello' }],
                status: 'completed',
              },
            ],
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              total_tokens: 15,
            },
          },
        }),
      ]);

      const { stream } = await createModel().doStream({
        prompt: TEST_PROMPT,
      });

      const parts = await convertReadableStreamToArray(stream);

      expect(parts).toContainEqual(
        expect.objectContaining({
          type: 'text-delta',
          delta: 'Hello',
        }),
      );

      expect(parts).toContainEqual(
        expect.objectContaining({
          type: 'finish',
        }),
      );
    });

    it('should accept response.in_progress with usage: null', async () => {
      prepareStreamChunks([
        JSON.stringify({
          type: 'response.created',
          response: {
            id: 'resp_123',
            object: 'response',
            model: 'grok-4-fast',
            created_at: 1700000000,
            status: 'in_progress',
            output: [],
            usage: null,
          },
        }),
        JSON.stringify({
          type: 'response.in_progress',
          response: {
            id: 'resp_123',
            object: 'response',
            model: 'grok-4-fast',
            created_at: 1700000000,
            status: 'in_progress',
            output: [],
            usage: null,
          },
        }),
        JSON.stringify({
          type: 'response.output_item.added',
          item: {
            id: 'msg_001',
            type: 'message',
            role: 'assistant',
            content: [],
            status: 'in_progress',
          },
          output_index: 0,
        }),
        JSON.stringify({
          type: 'response.content_part.added',
          item_id: 'msg_001',
          output_index: 0,
          content_index: 0,
          part: { type: 'output_text', text: '' },
        }),
        JSON.stringify({
          type: 'response.output_text.delta',
          item_id: 'msg_001',
          output_index: 0,
          content_index: 0,
          delta: 'Hi',
        }),
        JSON.stringify({
          type: 'response.completed',
          response: {
            id: 'resp_123',
            object: 'response',
            model: 'grok-4-fast',
            created_at: 1700000000,
            status: 'completed',
            output: [
              {
                id: 'msg_001',
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Hi' }],
                status: 'completed',
              },
            ],
            usage: {
              input_tokens: 5,
              output_tokens: 1,
              total_tokens: 6,
            },
          },
        }),
      ]);

      const { stream } = await createModel().doStream({
        prompt: TEST_PROMPT,
      });

      const parts = await convertReadableStreamToArray(stream);

      expect(parts).toContainEqual(
        expect.objectContaining({
          type: 'text-delta',
          delta: 'Hi',
        }),
      );
    });
  });
});
