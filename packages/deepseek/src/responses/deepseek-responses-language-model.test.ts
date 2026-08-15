import type {
  LanguageModelV4FunctionTool,
  LanguageModelV4Prompt,
  LanguageModelV4ProviderTool,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDeepSeek } from '../deepseek-provider';
import type { DeepSeekLanguageModelResponsesOptions } from './deepseek-responses-language-model-options';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const WEATHER_TOOL: LanguageModelV4FunctionTool = {
  type: 'function',
  name: 'weather',
  inputSchema: {
    type: 'object',
    properties: { location: { type: 'string' } },
    required: ['location'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

const WEB_SEARCH_TOOL: LanguageModelV4ProviderTool = {
  type: 'provider',
  id: 'deepseek.web_search',
  name: 'web_search',
  args: {},
};

const provider = createDeepSeek({ apiKey: 'test-api-key' });
const model = provider.responses('deepseek-v4-flash');

const URL = 'https://api.deepseek.com/responses';
const server = createTestServer({ [URL]: {} });

function prepareJsonFixtureResponse(filename: string) {
  server.urls[URL].response = {
    type: 'json-value',
    body: JSON.parse(
      fs.readFileSync(`src/responses/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

function prepareChunksFixtureResponse(filename: string) {
  // The Responses API sends semantic SSE events and has no [DONE] sentinel.
  server.urls[URL].response = {
    type: 'stream-chunks',
    chunks: fs
      .readFileSync(`src/responses/__fixtures__/${filename}.chunks.txt`, 'utf8')
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => `event: ${JSON.parse(line).type}\ndata: ${line}\n\n`),
  };
}

describe('DeepSeekResponsesLanguageModel', () => {
  describe('doGenerate', () => {
    describe('text', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('deepseek-text');
      });

      it('should send correct request body', async () => {
        await model.doGenerate({
          prompt: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
          temperature: 0.5,
          topP: 0.3,
          maxOutputTokens: 128,
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
                "type": "message",
              },
            ],
            "instructions": "You are a helpful assistant.",
            "max_output_tokens": 128,
            "model": "deepseek-v4-flash",
            "temperature": 0.5,
            "top_p": 0.3,
          }
        `);
      });

      it('should extract text content', async () => {
        expect(
          await model.doGenerate({ prompt: TEST_PROMPT }),
        ).toMatchSnapshot();
      });

      it('should warn about unsupported settings', async () => {
        const { warnings } = await model.doGenerate({
          prompt: TEST_PROMPT,
          topK: 1,
          seed: 42,
          presencePenalty: 0.5,
          frequencyPenalty: 0.5,
          stopSequences: ['stop'],
        });

        expect(warnings).toStrictEqual([
          { type: 'unsupported', feature: 'topK' },
          { type: 'unsupported', feature: 'seed' },
          { type: 'unsupported', feature: 'presencePenalty' },
          { type: 'unsupported', feature: 'frequencyPenalty' },
          { type: 'unsupported', feature: 'stopSequences' },
        ]);
      });
    });

    describe('reasoning', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('deepseek-reasoning');
      });

      it('should extract reasoning content with its item id', async () => {
        expect(
          await model.doGenerate({ prompt: TEST_PROMPT }),
        ).toMatchSnapshot();
      });
    });

    describe('tool call', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('deepseek-tool-call');
      });

      it('should send correct request body', async () => {
        await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [WEATHER_TOOL],
          toolChoice: { type: 'tool', toolName: 'weather' },
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
                "type": "message",
              },
            ],
            "model": "deepseek-v4-flash",
            "tool_choice": {
              "name": "weather",
              "type": "function",
            },
            "tools": [
              {
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
                "type": "function",
              },
            ],
          }
        `);
      });

      it('should extract tool call content', async () => {
        expect(
          await model.doGenerate({
            prompt: TEST_PROMPT,
            tools: [WEATHER_TOOL],
          }),
        ).toMatchSnapshot();
      });

      it('should warn about provider-defined tools', async () => {
        const { warnings } = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'deepseek.unsupported',
              name: 'unsupported',
              args: {},
            },
          ],
        });

        expect(warnings).toStrictEqual([
          {
            type: 'unsupported',
            feature: 'provider-defined tool deepseek.unsupported',
          },
        ]);
      });
    });

    describe('web search', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('deepseek-web-search');
      });

      it('should send the web search tool and tool choice', async () => {
        await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [WEB_SEARCH_TOOL],
          toolChoice: { type: 'tool', toolName: 'web_search' },
        });

        const body = await server.calls[0].requestBodyJson;
        expect(body.tools).toStrictEqual([{ type: 'web_search' }]);
        expect(body.tool_choice).toStrictEqual({ type: 'web_search' });
      });

      it('should emit the search as a provider-executed tool call and result', async () => {
        const { content } = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [WEB_SEARCH_TOOL],
        });

        expect(
          content.filter(part => part.type !== 'reasoning'),
        ).toMatchSnapshot();
      });

      it('should use the name the tool was registered under', async () => {
        const { content } = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [{ ...WEB_SEARCH_TOOL, name: 'search_the_web' }],
        });

        expect(
          content
            .filter(part => part.type === 'tool-call')
            .map(part => part.toolName),
        ).toStrictEqual(['search_the_web']);
      });

      it('should send prior searches back as web_search_call items', async () => {
        await model.doGenerate({
          prompt: [
            { role: 'user', content: [{ type: 'text', text: 'Who won?' }] },
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call_00_abc',
                  toolName: 'web_search',
                  input: {},
                  providerExecuted: true,
                  providerOptions: {
                    deepseek: {
                      action: { type: 'search', queries: ['who won'] },
                    },
                  },
                },
                {
                  type: 'tool-result',
                  toolCallId: 'call_00_abc',
                  toolName: 'web_search',
                  output: {
                    type: 'json',
                    value: { action: { type: 'search', queries: ['who won'] } },
                  },
                },
                { type: 'text', text: 'Spain won.' },
              ],
            },
            {
              role: 'user',
              content: [{ type: 'text', text: 'Who was the runner up?' }],
            },
          ],
          tools: [WEB_SEARCH_TOOL],
        });

        expect((await server.calls[0].requestBodyJson).input)
          .toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "Who won?",
                  "type": "input_text",
                },
              ],
              "role": "user",
              "type": "message",
            },
            {
              "action": {
                "queries": [
                  "who won",
                ],
                "type": "search",
              },
              "id": "call_00_abc",
              "type": "web_search_call",
            },
            {
              "content": [
                {
                  "text": "Spain won.",
                  "type": "output_text",
                },
              ],
              "role": "assistant",
              "type": "message",
            },
            {
              "content": [
                {
                  "text": "Who was the runner up?",
                  "type": "input_text",
                },
              ],
              "role": "user",
              "type": "message",
            },
          ]
        `);
      });

      it('should drop searches that carry no replayable action', async () => {
        await model.doGenerate({
          prompt: [
            { role: 'user', content: [{ type: 'text', text: 'Who won?' }] },
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call_00_abc',
                  toolName: 'web_search',
                  input: {},
                  providerExecuted: true,
                },
                { type: 'text', text: 'Spain won.' },
              ],
            },
          ],
          tools: [WEB_SEARCH_TOOL],
        });

        expect(
          (await server.calls[0].requestBodyJson).input.map(
            (item: { type: string }) => item.type,
          ),
        ).toStrictEqual(['message', 'message']);
      });
    });

    describe('json response format', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('deepseek-json');
      });

      it('should send json_object without a schema', async () => {
        await model.doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: { type: 'json' },
        });

        expect((await server.calls[0].requestBodyJson).text).toStrictEqual({
          format: { type: 'json_object' },
        });
      });

      it('should send json_schema with a schema', async () => {
        await model.doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
            name: 'weather',
            schema: {
              type: 'object',
              properties: { location: { type: 'string' } },
              required: ['location'],
              additionalProperties: false,
            },
          },
        });

        expect((await server.calls[0].requestBodyJson).text)
          .toMatchInlineSnapshot(`
          {
            "format": {
              "name": "weather",
              "schema": {
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
              "strict": true,
              "type": "json_schema",
            },
          }
        `);
      });

      it('should honor the strictJsonSchema provider option', async () => {
        await model.doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: { type: 'json', schema: { type: 'object' } },
          providerOptions: {
            deepseek: {
              strictJsonSchema: false,
            } satisfies DeepSeekLanguageModelResponsesOptions,
          },
        });

        expect((await server.calls[0].requestBodyJson).text.format.strict).toBe(
          false,
        );
      });
    });

    describe('thinking mode', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('deepseek-text');
      });

      it('should not send reasoning when it is not specified', async () => {
        await model.doGenerate({ prompt: TEST_PROMPT });

        expect(
          (await server.calls[0].requestBodyJson).reasoning,
        ).toBeUndefined();
      });

      it('should map top-level reasoning none to effort none', async () => {
        await model.doGenerate({ prompt: TEST_PROMPT, reasoning: 'none' });

        expect((await server.calls[0].requestBodyJson).reasoning).toStrictEqual(
          {
            effort: 'none',
          },
        );
      });

      it.each([
        ['low', 'low'],
        ['high', 'high'],
      ] as const)(
        'should map top-level reasoning %s to effort %s without a warning',
        async (reasoning, effort) => {
          const { warnings } = await model.doGenerate({
            prompt: TEST_PROMPT,
            reasoning,
          });

          expect((await server.calls[0].requestBodyJson).reasoning.effort).toBe(
            effort,
          );
          expect(warnings).toStrictEqual([]);
        },
      );

      it.each([
        ['minimal', 'low'],
        ['medium', 'high'],
        ['xhigh', 'max'],
      ] as const)(
        'should map top-level reasoning %s to effort %s with a compatibility warning',
        async (reasoning, effort) => {
          const { warnings } = await model.doGenerate({
            prompt: TEST_PROMPT,
            reasoning,
          });

          expect((await server.calls[0].requestBodyJson).reasoning.effort).toBe(
            effort,
          );
          expect(warnings).toStrictEqual([
            {
              type: 'compatibility',
              feature: 'reasoning',
              details: `reasoning "${reasoning}" is not directly supported by this model. mapped to effort "${effort}".`,
            },
          ]);
        },
      );

      it('should prefer the reasoningEffort provider option over top-level reasoning', async () => {
        await model.doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'low',
          providerOptions: {
            deepseek: {
              reasoningEffort: 'max',
            } satisfies DeepSeekLanguageModelResponsesOptions,
          },
        });

        expect((await server.calls[0].requestBodyJson).reasoning).toStrictEqual(
          {
            effort: 'max',
          },
        );
      });
    });

    describe('multi-turn', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('deepseek-text');
      });

      it('should send prior reasoning, tool calls and tool results back', async () => {
        await model.doGenerate({
          prompt: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'What is the weather?' }],
            },
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: 'I should call the weather tool.',
                  providerOptions: { deepseek: { itemId: 'reasoning-1' } },
                },
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'weather',
                  input: { location: 'San Francisco' },
                  providerOptions: { deepseek: { itemId: 'item-1' } },
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call-1',
                  toolName: 'weather',
                  output: { type: 'json', value: { temperature: 18 } },
                },
              ],
            },
          ],
          tools: [WEATHER_TOOL],
        });

        expect((await server.calls[0].requestBodyJson).input)
          .toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "What is the weather?",
                  "type": "input_text",
                },
              ],
              "role": "user",
              "type": "message",
            },
            {
              "content": [
                {
                  "text": "I should call the weather tool.",
                  "type": "reasoning_text",
                },
              ],
              "id": "reasoning-1",
              "summary": [],
              "type": "reasoning",
            },
            {
              "arguments": "{"location":"San Francisco"}",
              "call_id": "call-1",
              "id": "item-1",
              "name": "weather",
              "type": "function_call",
            },
            {
              "call_id": "call-1",
              "output": "{"temperature":18}",
              "type": "function_call_output",
            },
          ]
        `);
      });
    });

    it('should send the user provider option', async () => {
      prepareJsonFixtureResponse('deepseek-text');

      await model.doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          deepseek: {
            user: 'user-1',
          } satisfies DeepSeekLanguageModelResponsesOptions,
        },
      });

      expect((await server.calls[0].requestBodyJson).user).toBe('user-1');
    });

    it('should throw an api call error for error responses', async () => {
      server.urls[URL].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          error: {
            message:
              'The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed no-such-model.',
            type: 'invalid_request_error',
            param: null,
            code: 'invalid_request_error',
          },
        }),
      };

      await expect(
        provider.responses('no-such-model').doGenerate({ prompt: TEST_PROMPT }),
      ).rejects.toThrow(
        'The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed no-such-model.',
      );
    });
  });

  describe('doStream', () => {
    it('should send correct request body', async () => {
      prepareChunksFixtureResponse('deepseek-text');

      await model.doStream({ prompt: TEST_PROMPT });

      expect((await server.calls[0].requestBodyJson).stream).toBe(true);
    });

    it('should stream text', async () => {
      prepareChunksFixtureResponse('deepseek-text');

      const result = await model.doStream({ prompt: TEST_PROMPT });

      expect(
        await convertReadableStreamToArray(result.stream),
      ).toMatchSnapshot();
    });

    it('should stream reasoning', async () => {
      prepareChunksFixtureResponse('deepseek-reasoning');

      const result = await model.doStream({ prompt: TEST_PROMPT });

      expect(
        await convertReadableStreamToArray(result.stream),
      ).toMatchSnapshot();
    });

    it('should stream tool calls', async () => {
      prepareChunksFixtureResponse('deepseek-tool-call');

      const result = await model.doStream({
        prompt: TEST_PROMPT,
        tools: [WEATHER_TOOL],
      });

      expect(
        await convertReadableStreamToArray(result.stream),
      ).toMatchSnapshot();
    });

    it('should stream web searches as provider-executed tool calls', async () => {
      prepareChunksFixtureResponse('deepseek-web-search');

      const result = await model.doStream({
        prompt: TEST_PROMPT,
        tools: [WEB_SEARCH_TOOL],
      });

      const parts = await convertReadableStreamToArray(result.stream);

      expect(
        parts.filter(
          part =>
            part.type === 'tool-input-start' ||
            part.type === 'tool-input-end' ||
            part.type === 'tool-call' ||
            part.type === 'tool-result',
        ),
      ).toMatchSnapshot();
    });

    it('should ignore unknown events', async () => {
      server.urls[URL].response = {
        type: 'stream-chunks',
        chunks: [
          `data: ${JSON.stringify({ type: 'response.a_future_event', foo: 1 })}\n\n`,
          `data: ${JSON.stringify({
            type: 'response.completed',
            response: {
              id: 'id-1',
              usage: { input_tokens: 1, output_tokens: 2 },
            },
          })}\n\n`,
        ],
      };

      const result = await model.doStream({ prompt: TEST_PROMPT });
      const parts = await convertReadableStreamToArray(result.stream);

      expect(parts.map(part => part.type)).toStrictEqual([
        'stream-start',
        'finish',
      ]);
    });

    it('should surface failed responses as an error part', async () => {
      server.urls[URL].response = {
        type: 'stream-chunks',
        chunks: [
          `data: ${JSON.stringify({
            type: 'response.failed',
            response: {
              id: 'id-1',
              status: 'failed',
              error: { code: 'server_error', message: 'boom' },
            },
          })}\n\n`,
        ],
      };

      const result = await model.doStream({ prompt: TEST_PROMPT });
      const parts = await convertReadableStreamToArray(result.stream);

      expect(parts).toContainEqual({ type: 'error', error: 'boom' });
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: { unified: 'error', raw: 'server_error' },
      });
    });
  });
});
