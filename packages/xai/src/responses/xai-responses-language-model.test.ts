import { LanguageModelV3Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { XaiResponsesLanguageModel } from './xai-responses-language-model';
import { XaiResponsesProviderOptions } from './xai-responses-options';

const TEST_PROMPT: LanguageModelV3Prompt = [
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
            output_tokens: 538,
            total_tokens: 883,
            output_tokens_details: {
              reasoning_tokens: 123,
            },
          },
        });

        const result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.usage).toMatchInlineSnapshot(`
          {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": undefined,
              "noCache": 345,
              "total": 345,
            },
            "outputTokens": {
              "reasoning": 123,
              "text": 415,
              "total": 538,
            },
            "raw": {
              "input_tokens": 345,
              "output_tokens": 538,
              "output_tokens_details": {
                "reasoning_tokens": 123,
              },
              "total_tokens": 883,
            },
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

        expect(result.finishReason).toMatchInlineSnapshot(`
          {
            "raw": "completed",
            "unified": "stop",
          }
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
                "content": "hello",
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
              "feature": "stopSequences",
              "type": "unsupported",
            },
          ]
        `);
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
              type: 'provider',
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
              type: 'provider',
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
                "content": "hello",
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
              type: 'provider',
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
              type: 'provider',
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
              type: 'provider',
              id: 'xai.web_search',
              name: 'web_search',
              args: {},
            },
            {
              type: 'provider',
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
              type: 'provider',
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
              type: 'provider',
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
              type: 'provider',
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
              type: 'provider',
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
              type: 'provider',
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
              type: 'provider',
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

      it('should stream x_search tool call', async () => {
        prepareChunksFixtureResponse('xai-x-search-tool');

        const { stream } = await createModel().doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'xai.x_search',
              name: 'x_search',
              args: {},
            },
          ],
        });

        const parts = await convertReadableStreamToArray(stream);

        expect(parts).toMatchSnapshot();
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
              type: 'provider',
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
              type: 'provider',
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
              type: 'provider',
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
              type: 'provider',
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
              type: 'provider',
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
              type: 'provider',
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
  });
});
