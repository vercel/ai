import {
  APICallError,
  JSONObject,
  LanguageModelV3,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProviderOptions } from './anthropic-messages-options';
import { createAnthropic } from './anthropic-provider';
import { Citation } from './anthropic-messages-api';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createAnthropic({
  apiKey: 'test-api-key',
  generateId: mockId({ prefix: 'id' }),
});
const model = provider('claude-3-haiku-20240307');

describe('AnthropicMessagesLanguageModel', () => {
  const server = createTestServer({
    'https://api.anthropic.com/v1/messages': {},
  });

  function prepareJsonFixtureResponse(filename: string) {
    server.urls['https://api.anthropic.com/v1/messages'].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
      ),
    };
    return;
  }

  function prepareChunksFixtureResponse(filename: string) {
    const chunks = fs
      .readFileSync(`src/__fixtures__/${filename}.chunks.txt`, 'utf8')
      .split('\n')
      .map(line => `data: ${line}\n\n`);
    chunks.push('data: [DONE]\n\n');

    server.urls['https://api.anthropic.com/v1/messages'].response = {
      type: 'stream-chunks',
      chunks,
    };
  }

  describe('doGenerate', () => {
    function prepareJsonResponse({
      content = [{ type: 'text', text: '' }],
      usage = {
        input_tokens: 4,
        output_tokens: 30,
      },
      stopReason = 'end_turn',
      id = 'msg_017TfcQ4AgGxKyBduUpqYPZn',
      model = 'claude-3-haiku-20240307',
      headers = {},
    }: {
      content?: Array<
        | {
            type: 'text';
            text: string;
            citations?: Array<Citation>;
          }
        | { type: 'thinking'; thinking: string; signature: string }
        | { type: 'tool_use'; id: string; name: string; input: unknown }
      >;
      usage?: JSONObject & {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
      stopReason?: string;
      id?: string;
      model?: string;
      headers?: Record<string, string>;
    }) {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'json-value',
        headers,
        body: {
          id,
          type: 'message',
          role: 'assistant',
          content,
          model,
          stop_reason: stopReason,
          stop_sequence: null,
          usage,
        },
      };
    }

    describe('reasoning (thinking enabled)', () => {
      it('should pass thinking config; add budget tokens; clear out temperature, top_p, top_k; and return warnings', async () => {
        prepareJsonResponse({
          content: [{ type: 'text', text: 'Hello, World!' }],
        });

        const result = await provider('claude-sonnet-4-5').doGenerate({
          prompt: TEST_PROMPT,
          maxOutputTokens: 20000,
          temperature: 0.5,
          topP: 0.7,
          topK: 0.1,
          providerOptions: {
            anthropic: {
              thinking: { type: 'enabled', budgetTokens: 1000 },
            } satisfies AnthropicProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 21000,
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-sonnet-4-5",
            "thinking": {
              "budget_tokens": 1000,
              "type": "enabled",
            },
          }
        `);

        expect(result.warnings).toMatchInlineSnapshot(`
          [
            {
              "details": "temperature is not supported when thinking is enabled",
              "feature": "temperature",
              "type": "unsupported",
            },
            {
              "details": "topK is not supported when thinking is enabled",
              "feature": "topK",
              "type": "unsupported",
            },
            {
              "details": "topP is not supported when thinking is enabled",
              "feature": "topP",
              "type": "unsupported",
            },
          ]
        `);
      });

      it('should extract reasoning response', async () => {
        prepareJsonResponse({
          content: [
            {
              type: 'thinking',
              thinking: 'I am thinking...',
              signature: '1234567890',
            },
            { type: 'text', text: 'Hello, World!' },
          ],
        });

        const { content } = await model.doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": {
                "anthropic": {
                  "signature": "1234567890",
                },
              },
              "text": "I am thinking...",
              "type": "reasoning",
            },
            {
              "text": "Hello, World!",
              "type": "text",
            },
          ]
        `);
      });
    });

    describe('json schema response format with json tool response (unsupported model)', () => {
      let result: Awaited<ReturnType<typeof model.doGenerate>>;

      beforeEach(async () => {
        prepareJsonFixtureResponse('anthropic-json-tool.1');

        result = await model.doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              required: ['name'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        });
      });

      it('should pass json schema response format as a tool', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 4096,
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-3-haiku-20240307",
            "tool_choice": {
              "disable_parallel_tool_use": true,
              "type": "any",
            },
            "tools": [
              {
                "description": "Respond with a JSON object.",
                "input_schema": {
                  "$schema": "http://json-schema.org/draft-07/schema#",
                  "additionalProperties": false,
                  "properties": {
                    "name": {
                      "type": "string",
                    },
                  },
                  "required": [
                    "name",
                  ],
                  "type": "object",
                },
                "name": "json",
              },
            ],
          }
        `);
      });

      it('should return the json response', async () => {
        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "text": "{"elements":[{"location":"San Francisco","temperature":-5,"condition":"snowy"},{"location":"London","temperature":0,"condition":"snowy"},{"location":"Paris","temperature":23,"condition":"cloudy"},{"location":"Berlin","temperature":-9,"condition":"snowy"}]}",
              "type": "text",
            },
          ]
        `);
      });

      it('should send stop finish reason', async () => {
        expect(result.finishReason).toBe('stop');
      });
    });

    describe('json schema response format with json tool response (supported model, tool mode)', () => {
      let result: Awaited<ReturnType<typeof model.doGenerate>>;

      beforeEach(async () => {
        prepareJsonFixtureResponse('anthropic-json-tool.1');

        result = await provider('claude-sonnet-4-5').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            anthropic: {
              structuredOutputMode: 'jsonTool',
            } satisfies AnthropicProviderOptions,
          },
          responseFormat: {
            type: 'json',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              required: ['name'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        });
      });

      it('should pass json schema response format as a tool', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 64000,
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-sonnet-4-5",
            "tool_choice": {
              "disable_parallel_tool_use": true,
              "type": "any",
            },
            "tools": [
              {
                "description": "Respond with a JSON object.",
                "input_schema": {
                  "$schema": "http://json-schema.org/draft-07/schema#",
                  "additionalProperties": false,
                  "properties": {
                    "name": {
                      "type": "string",
                    },
                  },
                  "required": [
                    "name",
                  ],
                  "type": "object",
                },
                "name": "json",
              },
            ],
          }
        `);
      });

      it('should return the json response', async () => {
        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "text": "{"elements":[{"location":"San Francisco","temperature":-5,"condition":"snowy"},{"location":"London","temperature":0,"condition":"snowy"},{"location":"Paris","temperature":23,"condition":"cloudy"},{"location":"Berlin","temperature":-9,"condition":"snowy"}]}",
              "type": "text",
            },
          ]
        `);
      });

      it('should send stop finish reason', async () => {
        expect(result.finishReason).toBe('stop');
      });
    });

    describe('json schema response format with other tool response (unsupported model)', () => {
      let result: Awaited<ReturnType<typeof model.doGenerate>>;

      beforeEach(async () => {
        prepareJsonFixtureResponse('anthropic-json-other-tool.1');

        result = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'get-weather',
              description: 'Get the weather in a location',
              inputSchema: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
                required: ['location'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          ],
          responseFormat: {
            type: 'json',
            schema: {
              type: 'object',
              properties: {
                weather: { type: 'string' },
                temperature: { type: 'number' },
              },
              required: ['weather', 'temperature'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        });
      });

      it('should pass the tool and the json schema response format as tools', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 4096,
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-3-haiku-20240307",
            "tool_choice": {
              "disable_parallel_tool_use": true,
              "type": "any",
            },
            "tools": [
              {
                "description": "Get the weather in a location",
                "input_schema": {
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
                "name": "get-weather",
              },
              {
                "description": "Respond with a JSON object.",
                "input_schema": {
                  "$schema": "http://json-schema.org/draft-07/schema#",
                  "additionalProperties": false,
                  "properties": {
                    "temperature": {
                      "type": "number",
                    },
                    "weather": {
                      "type": "string",
                    },
                  },
                  "required": [
                    "weather",
                    "temperature",
                  ],
                  "type": "object",
                },
                "name": "json",
              },
            ],
          }
        `);
      });

      it('should return the tool call', async () => {
        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "input": "{"location":"San Francisco"}",
              "toolCallId": "toolu_01PQjhxo3eirCdKNvCJrKc8f",
              "toolName": "weather",
              "type": "tool-call",
            },
          ]
        `);
      });

      it('should send tool-calls finish reason', async () => {
        expect(result.finishReason).toBe('tool-calls');
      });
    });

    describe('json schema response format with output format (supported model)', () => {
      let result: Awaited<ReturnType<typeof model.doGenerate>>;

      beforeEach(async () => {
        prepareJsonFixtureResponse('anthropic-json-output-format.1');

        result = await provider('claude-sonnet-4-5').doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              required: ['name'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        });
      });

      it('should pass json schema response format as output format', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 64000,
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-sonnet-4-5",
            "output_format": {
              "schema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "additionalProperties": false,
                "properties": {
                  "name": {
                    "type": "string",
                  },
                },
                "required": [
                  "name",
                ],
                "type": "object",
              },
              "type": "json_schema",
            },
          }
        `);
      });

      it('should return the json response', async () => {
        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "text": "{"recipe":{"name":"Classic Lasagna","ingredients":[{"name":"lasagna noodles","amount":"12 sheets"},{"name":"ground beef","amount":"1 pound"},{"name":"Italian sausage","amount":"1/2 pound"},{"name":"onion","amount":"1 medium, diced"},{"name":"garlic","amount":"3 cloves, minced"},{"name":"crushed tomatoes","amount":"28 oz can"},{"name":"tomato paste","amount":"6 oz can"},{"name":"water","amount":"1/2 cup"},{"name":"sugar","amount":"2 tablespoons"},{"name":"dried basil","amount":"1 1/2 teaspoons"},{"name":"Italian seasoning","amount":"1 teaspoon"},{"name":"salt","amount":"1 teaspoon"},{"name":"black pepper","amount":"1/2 teaspoon"},{"name":"ricotta cheese","amount":"15 oz"},{"name":"egg","amount":"1 large"},{"name":"fresh parsley","amount":"2 tablespoons, chopped"},{"name":"mozzarella cheese","amount":"3 cups, shredded"},{"name":"parmesan cheese","amount":"3/4 cup, grated"}],"steps":["Cook lasagna noodles according to package directions, drain and set aside","In a large skillet, cook ground beef, sausage, onion, and garlic over medium heat until meat is browned, drain excess fat","Add crushed tomatoes, tomato paste, water, sugar, basil, Italian seasoning, salt, and pepper to the meat mixture, simmer for 30 minutes, stirring occasionally","In a bowl, combine ricotta cheese, egg, and parsley, mix well","Preheat oven to 375°F (190°C)","Spread 1 cup of meat sauce in the bottom of a 9x13 inch baking dish","Layer 4 lasagna noodles over the sauce","Spread half of the ricotta mixture over the noodles","Sprinkle with 1 cup mozzarella and 1/4 cup parmesan cheese","Top with 1 1/2 cups meat sauce","Repeat layers once more: 4 noodles, remaining ricotta mixture, 1 cup mozzarella, 1/4 cup parmesan, 1 1/2 cups meat sauce","Add final layer of 4 noodles, remaining meat sauce, remaining mozzarella and parmesan cheese","Cover with aluminum foil and bake for 25 minutes","Remove foil and bake an additional 25 minutes until cheese is golden and bubbly","Let stand for 15 minutes before serving"]}}",
              "type": "text",
            },
          ]
        `);
      });

      it('should send stop finish reason', async () => {
        expect(result.finishReason).toBe('stop');
      });
    });

    describe('json schema response format with output format (unknown model, forced)', () => {
      let result: Awaited<ReturnType<typeof model.doGenerate>>;

      beforeEach(async () => {
        prepareJsonFixtureResponse('anthropic-json-output-format.1');

        result = await provider('claude-unknown').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            anthropic: {
              structuredOutputMode: 'outputFormat',
            } satisfies AnthropicProviderOptions,
          },
          responseFormat: {
            type: 'json',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              required: ['name'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        });
      });

      it('should pass json schema response format as output format', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 4096,
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-unknown",
            "output_format": {
              "schema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "additionalProperties": false,
                "properties": {
                  "name": {
                    "type": "string",
                  },
                },
                "required": [
                  "name",
                ],
                "type": "object",
              },
              "type": "json_schema",
            },
          }
        `);
      });

      it('should return the json response', async () => {
        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "text": "{"recipe":{"name":"Classic Lasagna","ingredients":[{"name":"lasagna noodles","amount":"12 sheets"},{"name":"ground beef","amount":"1 pound"},{"name":"Italian sausage","amount":"1/2 pound"},{"name":"onion","amount":"1 medium, diced"},{"name":"garlic","amount":"3 cloves, minced"},{"name":"crushed tomatoes","amount":"28 oz can"},{"name":"tomato paste","amount":"6 oz can"},{"name":"water","amount":"1/2 cup"},{"name":"sugar","amount":"2 tablespoons"},{"name":"dried basil","amount":"1 1/2 teaspoons"},{"name":"Italian seasoning","amount":"1 teaspoon"},{"name":"salt","amount":"1 teaspoon"},{"name":"black pepper","amount":"1/2 teaspoon"},{"name":"ricotta cheese","amount":"15 oz"},{"name":"egg","amount":"1 large"},{"name":"fresh parsley","amount":"2 tablespoons, chopped"},{"name":"mozzarella cheese","amount":"3 cups, shredded"},{"name":"parmesan cheese","amount":"3/4 cup, grated"}],"steps":["Cook lasagna noodles according to package directions, drain and set aside","In a large skillet, cook ground beef, sausage, onion, and garlic over medium heat until meat is browned, drain excess fat","Add crushed tomatoes, tomato paste, water, sugar, basil, Italian seasoning, salt, and pepper to the meat mixture, simmer for 30 minutes, stirring occasionally","In a bowl, combine ricotta cheese, egg, and parsley, mix well","Preheat oven to 375°F (190°C)","Spread 1 cup of meat sauce in the bottom of a 9x13 inch baking dish","Layer 4 lasagna noodles over the sauce","Spread half of the ricotta mixture over the noodles","Sprinkle with 1 cup mozzarella and 1/4 cup parmesan cheese","Top with 1 1/2 cups meat sauce","Repeat layers once more: 4 noodles, remaining ricotta mixture, 1 cup mozzarella, 1/4 cup parmesan, 1 1/2 cups meat sauce","Add final layer of 4 noodles, remaining meat sauce, remaining mozzarella and parmesan cheese","Cover with aluminum foil and bake for 25 minutes","Remove foil and bake an additional 25 minutes until cheese is golden and bubbly","Let stand for 15 minutes before serving"]}}",
              "type": "text",
            },
          ]
        `);
      });

      it('should send stop finish reason', async () => {
        expect(result.finishReason).toBe('stop');
      });
    });

    it('should extract text response', async () => {
      prepareJsonResponse({
        content: [{ type: 'text', text: 'Hello, World!' }],
      });

      const { content } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(content).toMatchInlineSnapshot(`
        [
          {
            "text": "Hello, World!",
            "type": "text",
          },
        ]
      `);
    });

    it('should extract tool calls', async () => {
      prepareJsonResponse({
        content: [
          { type: 'text', text: 'Some text\n\n' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'test-tool',
            input: { value: 'example value' },
          },
        ],
        stopReason: 'tool_use',
      });

      const { content, finishReason } = await model.doGenerate({
        tools: [
          {
            type: 'function',
            name: 'test-tool',
            inputSchema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        prompt: TEST_PROMPT,
      });

      expect(content).toMatchInlineSnapshot(`
        [
          {
            "text": "Some text

        ",
            "type": "text",
          },
          {
            "input": "{"value":"example value"}",
            "toolCallId": "toolu_1",
            "toolName": "test-tool",
            "type": "tool-call",
          },
        ]
      `);
      expect(finishReason).toStrictEqual('tool-calls');
    });

    it('should extract usage', async () => {
      prepareJsonResponse({
        usage: { input_tokens: 20, output_tokens: 5 },
      });

      const { usage } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(usage).toMatchInlineSnapshot(`
        {
          "cachedInputTokens": undefined,
          "inputTokens": 20,
          "outputTokens": 5,
          "totalTokens": 25,
        }
      `);
    });

    it('should send additional response information', async () => {
      prepareJsonResponse({
        id: 'test-id',
        model: 'test-model',
      });

      const { response } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(response).toMatchInlineSnapshot(`
        {
          "body": {
            "content": [
              {
                "text": "",
                "type": "text",
              },
            ],
            "id": "test-id",
            "model": "test-model",
            "role": "assistant",
            "stop_reason": "end_turn",
            "stop_sequence": null,
            "type": "message",
            "usage": {
              "input_tokens": 4,
              "output_tokens": 30,
            },
          },
          "headers": {
            "content-length": "203",
            "content-type": "application/json",
          },
          "id": "test-id",
          "modelId": "test-model",
        }
      `);
    });

    it('should include stop_sequence in provider metadata', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'json-value',
        body: {
          id: 'msg_017TfcQ4AgGxKyBduUpqYPZn',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello, World!' }],
          model: 'claude-3-haiku-20240307',
          stop_reason: 'stop_sequence',
          stop_sequence: 'STOP',
          usage: {
            input_tokens: 4,
            output_tokens: 30,
          },
        },
      };

      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
        stopSequences: ['STOP'],
      });

      expect(result.providerMetadata).toMatchInlineSnapshot(`
        {
          "anthropic": {
            "cacheCreationInputTokens": null,
            "container": null,
            "stopSequence": "STOP",
            "usage": {
              "input_tokens": 4,
              "output_tokens": 30,
            },
          },
        }
      `);
    });

    it('should expose the raw response headers', async () => {
      prepareJsonResponse({
        headers: {
          'test-header': 'test-value',
        },
      });

      const { response } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(response?.headers).toStrictEqual({
        // default headers:
        'content-length': '237',
        'content-type': 'application/json',

        // custom header
        'test-header': 'test-value',
      });
      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk/anthropic/0.0.0-test`,
      );
    });

    it('should send the model id and settings', async () => {
      prepareJsonResponse({});

      const { warnings } = await model.doGenerate({
        prompt: TEST_PROMPT,
        temperature: 0.5,
        maxOutputTokens: 100,
        topP: 0.9,
        topK: 0.1,
        stopSequences: ['abc', 'def'],
        frequencyPenalty: 0.15,
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "max_tokens": 100,
          "messages": [
            {
              "content": [
                {
                  "text": "Hello",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ],
          "model": "claude-3-haiku-20240307",
          "stop_sequences": [
            "abc",
            "def",
          ],
          "temperature": 0.5,
          "top_k": 0.1,
          "top_p": 0.9,
        }
      `);

      expect(warnings).toMatchInlineSnapshot(`
        [
          {
            "feature": "frequencyPenalty",
            "type": "unsupported",
          },
        ]
      `);
    });

    it('should limit max output tokens to the model max and warn', async () => {
      prepareJsonResponse({});

      const { warnings } = await provider('claude-haiku-4-5').doGenerate({
        prompt: TEST_PROMPT,
        maxOutputTokens: 999999,
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "max_tokens": 64000,
          "messages": [
            {
              "content": [
                {
                  "text": "Hello",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ],
          "model": "claude-haiku-4-5",
        }
      `);

      expect(warnings).toMatchInlineSnapshot(`
        [
          {
            "details": "999999 (maxOutputTokens + thinkingBudget) is greater than claude-haiku-4-5 64000 max output tokens. The max output tokens have been limited to 64000.",
            "feature": "maxOutputTokens",
            "type": "unsupported",
          },
        ]
      `);
    });

    it('should not limit max output tokens for unknown models', async () => {
      prepareJsonResponse({});

      const { warnings } = await provider('future-model').doGenerate({
        prompt: TEST_PROMPT,
        maxOutputTokens: 123456,
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "max_tokens": 123456,
          "messages": [
            {
              "content": [
                {
                  "text": "Hello",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ],
          "model": "future-model",
        }
      `);

      expect(warnings).toMatchInlineSnapshot(`[]`);
    });

    it('should pass tools and toolChoice', async () => {
      prepareJsonResponse({});

      await model.doGenerate({
        tools: [
          {
            type: 'function',
            name: 'test-tool',
            inputSchema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        toolChoice: {
          type: 'tool',
          toolName: 'test-tool',
        },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'claude-3-haiku-20240307',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        max_tokens: 4096,
        tools: [
          {
            name: 'test-tool',
            input_schema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        tool_choice: {
          type: 'tool',
          name: 'test-tool',
        },
      });
    });

    it('should pass disableParallelToolUse', async () => {
      prepareJsonResponse({});

      await model.doGenerate({
        tools: [
          {
            type: 'function',
            name: 'test-tool',
            inputSchema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        prompt: TEST_PROMPT,
        providerOptions: {
          anthropic: {
            disableParallelToolUse: true,
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        tool_choice: {
          type: 'auto',
          disable_parallel_tool_use: true,
        },
      });
    });

    it('should pass headers', async () => {
      prepareJsonResponse({ content: [] });

      const provider = createAnthropic({
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider('claude-3-haiku-20240307').doGenerate({
        prompt: TEST_PROMPT,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
        {
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "custom-provider-header": "provider-header-value",
          "custom-request-header": "request-header-value",
          "x-api-key": "test-api-key",
        }
      `);
    });

    it('should support cache control', async () => {
      prepareJsonResponse({
        usage: {
          input_tokens: 20,
          output_tokens: 50,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 5,
        },
      });

      const model = provider('claude-3-haiku-20240307');

      const result = await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            providerOptions: {
              anthropic: {
                cacheControl: { type: 'ephemeral' },
              } satisfies AnthropicProviderOptions,
            },
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'claude-3-haiku-20240307',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello',
                cache_control: { type: 'ephemeral' },
              },
            ],
          },
        ],
        max_tokens: 4096,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "text": "",
              "type": "text",
            },
          ],
          "finishReason": "stop",
          "providerMetadata": {
            "anthropic": {
              "cacheCreationInputTokens": 10,
              "container": null,
              "stopSequence": null,
              "usage": {
                "cache_creation_input_tokens": 10,
                "cache_read_input_tokens": 5,
                "input_tokens": 20,
                "output_tokens": 50,
              },
            },
          },
          "request": {
            "body": {
              "max_tokens": 4096,
              "messages": [
                {
                  "content": [
                    {
                      "cache_control": {
                        "type": "ephemeral",
                      },
                      "text": "Hello",
                      "type": "text",
                    },
                  ],
                  "role": "user",
                },
              ],
              "model": "claude-3-haiku-20240307",
              "stop_sequences": undefined,
              "stream": undefined,
              "system": undefined,
              "temperature": undefined,
              "tool_choice": undefined,
              "tools": undefined,
              "top_k": undefined,
              "top_p": undefined,
            },
          },
          "response": {
            "body": {
              "content": [
                {
                  "text": "",
                  "type": "text",
                },
              ],
              "id": "msg_017TfcQ4AgGxKyBduUpqYPZn",
              "model": "claude-3-haiku-20240307",
              "role": "assistant",
              "stop_reason": "end_turn",
              "stop_sequence": null,
              "type": "message",
              "usage": {
                "cache_creation_input_tokens": 10,
                "cache_read_input_tokens": 5,
                "input_tokens": 20,
                "output_tokens": 50,
              },
            },
            "headers": {
              "content-length": "299",
              "content-type": "application/json",
            },
            "id": "msg_017TfcQ4AgGxKyBduUpqYPZn",
            "modelId": "claude-3-haiku-20240307",
          },
          "usage": {
            "cachedInputTokens": 5,
            "inputTokens": 20,
            "outputTokens": 50,
            "totalTokens": 70,
          },
          "warnings": [],
        }
      `);
    });

    it('should support cache control and return extra fields in provider metadata', async () => {
      prepareJsonResponse({
        usage: {
          input_tokens: 20,
          output_tokens: 50,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 5,
          cache_creation: {
            ephemeral_5m_input_tokens: 0,
            ephemeral_1h_input_tokens: 10,
          },
        },
      });

      const model = provider('claude-3-haiku-20240307');

      const result = await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            providerOptions: {
              anthropic: {
                cacheControl: { type: 'ephemeral', ttl: '1h' },
              } satisfies AnthropicProviderOptions,
            },
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'claude-3-haiku-20240307',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello',
                cache_control: { type: 'ephemeral', ttl: '1h' },
              },
            ],
          },
        ],
        max_tokens: 4096,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "text": "",
              "type": "text",
            },
          ],
          "finishReason": "stop",
          "providerMetadata": {
            "anthropic": {
              "cacheCreationInputTokens": 10,
              "container": null,
              "stopSequence": null,
              "usage": {
                "cache_creation": {
                  "ephemeral_1h_input_tokens": 10,
                  "ephemeral_5m_input_tokens": 0,
                },
                "cache_creation_input_tokens": 10,
                "cache_read_input_tokens": 5,
                "input_tokens": 20,
                "output_tokens": 50,
              },
            },
          },
          "request": {
            "body": {
              "max_tokens": 4096,
              "messages": [
                {
                  "content": [
                    {
                      "cache_control": {
                        "ttl": "1h",
                        "type": "ephemeral",
                      },
                      "text": "Hello",
                      "type": "text",
                    },
                  ],
                  "role": "user",
                },
              ],
              "model": "claude-3-haiku-20240307",
              "stop_sequences": undefined,
              "stream": undefined,
              "system": undefined,
              "temperature": undefined,
              "tool_choice": undefined,
              "tools": undefined,
              "top_k": undefined,
              "top_p": undefined,
            },
          },
          "response": {
            "body": {
              "content": [
                {
                  "text": "",
                  "type": "text",
                },
              ],
              "id": "msg_017TfcQ4AgGxKyBduUpqYPZn",
              "model": "claude-3-haiku-20240307",
              "role": "assistant",
              "stop_reason": "end_turn",
              "stop_sequence": null,
              "type": "message",
              "usage": {
                "cache_creation": {
                  "ephemeral_1h_input_tokens": 10,
                  "ephemeral_5m_input_tokens": 0,
                },
                "cache_creation_input_tokens": 10,
                "cache_read_input_tokens": 5,
                "input_tokens": 20,
                "output_tokens": 50,
              },
            },
            "headers": {
              "content-length": "379",
              "content-type": "application/json",
            },
            "id": "msg_017TfcQ4AgGxKyBduUpqYPZn",
            "modelId": "claude-3-haiku-20240307",
          },
          "usage": {
            "cachedInputTokens": 5,
            "inputTokens": 20,
            "outputTokens": 50,
            "totalTokens": 70,
          },
          "warnings": [],
        }
      `);
    });

    it('should send request body', async () => {
      prepareJsonResponse({ content: [] });

      const { request } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(request).toMatchInlineSnapshot(`
        {
          "body": {
            "max_tokens": 4096,
            "messages": [
              {
                "content": [
                  {
                    "cache_control": undefined,
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-3-haiku-20240307",
            "stop_sequences": undefined,
            "stream": undefined,
            "system": undefined,
            "temperature": undefined,
            "tool_choice": undefined,
            "tools": undefined,
            "top_k": undefined,
            "top_p": undefined,
          },
        }
      `);
    });

    it('should process PDF citation responses', async () => {
      // Mock response with PDF citations
      prepareJsonResponse({
        content: [
          {
            type: 'text',
            text: 'Based on the document, the results show positive growth.',
            citations: [
              {
                type: 'page_location',
                cited_text: 'Revenue increased by 25% year over year',
                document_index: 0,
                document_title: 'Financial Report 2023',
                start_page_number: 5,
                end_page_number: 6,
              },
            ],
          },
        ],
      });

      const result = await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'base64PDFdata',
                mediaType: 'application/pdf',
                filename: 'financial-report.pdf',
                providerOptions: {
                  anthropic: {
                    citations: { enabled: true },
                  },
                },
              },
              {
                type: 'text',
                text: 'What do the results show?',
              },
            ],
          },
        ],
      });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "text": "Based on the document, the results show positive growth.",
            "type": "text",
          },
          {
            "filename": "financial-report.pdf",
            "id": "id-0",
            "mediaType": "application/pdf",
            "providerMetadata": {
              "anthropic": {
                "citedText": "Revenue increased by 25% year over year",
                "endPageNumber": 6,
                "startPageNumber": 5,
              },
            },
            "sourceType": "document",
            "title": "Financial Report 2023",
            "type": "source",
          },
        ]
      `);
    });

    it('should process text citation responses', async () => {
      const mockProvider = createAnthropic({
        apiKey: 'test-api-key',
        generateId: () => 'test-text-citation-id',
      });
      const modelWithMockId = mockProvider('claude-3-haiku-20240307');

      prepareJsonResponse({
        content: [
          {
            type: 'text',
            text: 'The text shows important information.',
            citations: [
              {
                type: 'char_location',
                cited_text: 'important information',
                document_index: 0,
                document_title: 'Test Document',
                start_char_index: 15,
                end_char_index: 35,
              },
            ],
          },
        ],
      });

      const result = await modelWithMockId.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'VGVzdCBkb2N1bWVudCBjb250ZW50',
                mediaType: 'text/plain',
                filename: 'test.txt',
                providerOptions: {
                  anthropic: {
                    citations: { enabled: true },
                  },
                },
              },
              {
                type: 'text',
                text: 'What does this say?',
              },
            ],
          },
        ],
      });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "text": "The text shows important information.",
            "type": "text",
          },
          {
            "filename": "test.txt",
            "id": "test-text-citation-id",
            "mediaType": "text/plain",
            "providerMetadata": {
              "anthropic": {
                "citedText": "important information",
                "endCharIndex": 35,
                "startCharIndex": 15,
              },
            },
            "sourceType": "document",
            "title": "Test Document",
            "type": "source",
          },
        ]
      `);
    });

    describe('web search tool', () => {
      describe('with fixture', () => {
        let result: Awaited<ReturnType<LanguageModelV3['doGenerate']>>;

        beforeEach(async () => {
          prepareJsonFixtureResponse('anthropic-web-search-tool.1');

          result = await model.doGenerate({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider',
                id: 'anthropic.web_search_20250305',
                name: 'web_search',
                args: {
                  maxUses: 1,
                  userLocation: {
                    type: 'approximate',
                    country: 'US',
                  },
                },
              },
            ],
          });
        });

        it('should send request body with include and tool', async () => {
          expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
            {
              "max_tokens": 4096,
              "messages": [
                {
                  "content": [
                    {
                      "text": "What is the latest news?",
                      "type": "text",
                    },
                  ],
                  "role": "user",
                },
              ],
              "model": "claude-3-haiku-20240307",
              "tools": [
                {
                  "max_uses": 1,
                  "name": "web_search",
                  "type": "web_search_20250305",
                  "user_location": {
                    "country": "US",
                    "type": "approximate",
                  },
                },
              ],
            }
          `);
        });

        it('should include web search tool call and result in content', async () => {
          expect(result.content).toMatchSnapshot();
        });
      });

      const TEST_PROMPT = [
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: 'What is the latest news?' },
          ],
        },
      ];

      function prepareJsonResponse(body: any) {
        server.urls['https://api.anthropic.com/v1/messages'].response = {
          type: 'json-value',
          body,
        };
      }

      it('should enable server-side web search when using anthropic.tools.webSearch_20250305', async () => {
        prepareJsonResponse({
          type: 'message',
          id: 'msg_test',
          content: [
            {
              type: 'text',
              text: 'Here are the latest quantum computing breakthroughs.',
            },
          ],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        });

        await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.web_search_20250305',
              name: 'web_search',
              args: {
                maxUses: 3,
                allowedDomains: ['arxiv.org', 'nature.com', 'mit.edu'],
              },
            },
          ],
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody.tools).toHaveLength(1);

        expect(requestBody.tools[0]).toEqual({
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 3,
          allowed_domains: ['arxiv.org', 'nature.com', 'mit.edu'],
        });
      });

      it('should pass web search configuration with blocked domains', async () => {
        prepareJsonResponse({
          type: 'message',
          id: 'msg_test',
          content: [
            { type: 'text', text: 'Here are the latest stock market trends.' },
          ],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        });

        await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.web_search_20250305',
              name: 'web_search',
              args: {
                maxUses: 2,
                blockedDomains: ['reddit.com'],
              },
            },
          ],
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody.tools).toHaveLength(1);

        expect(requestBody.tools[0]).toEqual({
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 2,
          blocked_domains: ['reddit.com'],
        });
      });

      it('should handle web search with user location', async () => {
        prepareJsonResponse({
          type: 'message',
          id: 'msg_test',
          content: [{ type: 'text', text: 'Here are local tech events.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        });

        await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.web_search_20250305',
              name: 'web_search',
              args: {
                maxUses: 1,
                userLocation: {
                  type: 'approximate',
                  city: 'New York',
                  region: 'New York',
                  country: 'US',
                  timezone: 'America/New_York',
                },
              },
            },
          ],
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody.tools).toHaveLength(1);

        expect(requestBody.tools[0]).toEqual({
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 1,
          user_location: {
            type: 'approximate',
            city: 'New York',
            region: 'New York',
            country: 'US',
            timezone: 'America/New_York',
          },
        });
      });

      it('should handle web search with partial user location (city + country)', async () => {
        prepareJsonResponse({
          type: 'message',
          id: 'msg_test',
          content: [{ type: 'text', text: 'Here are local events.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        });

        await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.web_search_20250305',
              name: 'web_search',
              args: {
                maxUses: 1,
                userLocation: {
                  type: 'approximate',
                  city: 'London',
                  country: 'GB',
                },
              },
            },
          ],
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody.tools).toHaveLength(1);

        expect(requestBody.tools[0]).toEqual({
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 1,
          user_location: {
            type: 'approximate',
            city: 'London',
            country: 'GB',
          },
        });
      });

      it('should handle web search with minimal user location (country only)', async () => {
        prepareJsonResponse({
          type: 'message',
          id: 'msg_test',
          content: [{ type: 'text', text: 'Here are global events.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        });

        await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.web_search_20250305',
              name: 'web_search',
              args: {
                maxUses: 1,
                userLocation: {
                  type: 'approximate',
                  country: 'US',
                },
              },
            },
          ],
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody.tools).toHaveLength(1);

        expect(requestBody.tools[0]).toEqual({
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 1,
          user_location: {
            type: 'approximate',
            country: 'US',
          },
        });
      });

      it('should handle server-side web search results with citations', async () => {
        prepareJsonResponse({
          type: 'message',
          id: 'msg_test',
          content: [
            {
              type: 'server_tool_use',
              id: 'tool_1',
              name: 'web_search',
              input: { query: 'latest AI news' },
            },
            {
              type: 'web_search_tool_result',
              tool_use_id: 'tool_1',
              content: [
                {
                  type: 'web_search_result',
                  url: 'https://example.com/ai-news',
                  title: 'Latest AI Developments',
                  encrypted_content: 'encrypted_content_123',
                  page_age: 'January 15, 2025',
                },
              ],
            },
            {
              type: 'text',
              text: 'Based on recent articles, AI continues to advance rapidly.',
            },
          ],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            server_tool_use: { web_search_requests: 1 },
          },
        });

        const provider = createAnthropic({
          apiKey: 'test-api-key',
          generateId: mockId(),
        });
        const model = provider('claude-3-5-sonnet-latest');
        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.web_search_20250305',
              name: 'web_search',
              args: {
                maxUses: 5,
              },
            },
          ],
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "input": "{"query":"latest AI news"}",
              "providerExecuted": true,
              "toolCallId": "tool_1",
              "toolName": "web_search",
              "type": "tool-call",
            },
            {
              "result": [
                {
                  "encryptedContent": "encrypted_content_123",
                  "pageAge": "January 15, 2025",
                  "title": "Latest AI Developments",
                  "type": "web_search_result",
                  "url": "https://example.com/ai-news",
                },
              ],
              "toolCallId": "tool_1",
              "toolName": "web_search",
              "type": "tool-result",
            },
            {
              "id": "id-0",
              "providerMetadata": {
                "anthropic": {
                  "pageAge": "January 15, 2025",
                },
              },
              "sourceType": "url",
              "title": "Latest AI Developments",
              "type": "source",
              "url": "https://example.com/ai-news",
            },
            {
              "text": "Based on recent articles, AI continues to advance rapidly.",
              "type": "text",
            },
          ]
        `);
      });

      it('should handle server-side web search errors', async () => {
        prepareJsonResponse({
          type: 'message',
          id: 'msg_test',
          content: [
            {
              type: 'web_search_tool_result',
              tool_use_id: 'tool_1',
              content: {
                type: 'web_search_tool_result_error',
                error_code: 'max_uses_exceeded',
              },
            },
            {
              type: 'text',
              text: 'I cannot search further due to limits.',
            },
          ],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        });

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.web_search_20250305',
              name: 'web_search',
              args: {
                maxUses: 1,
              },
            },
          ],
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "isError": true,
              "result": {
                "errorCode": "max_uses_exceeded",
                "type": "web_search_tool_result_error",
              },
              "toolCallId": "tool_1",
              "toolName": "web_search",
              "type": "tool-result",
            },
            {
              "text": "I cannot search further due to limits.",
              "type": "text",
            },
          ]
        `);
      });

      it('should work alongside regular client-side tools', async () => {
        prepareJsonResponse({
          type: 'message',
          id: 'msg_test',
          content: [{ type: 'text', text: 'I can search and calculate.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        });

        await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'calculator',
              description: 'Calculate math',
              inputSchema: { type: 'object', properties: {} },
            },
            {
              type: 'provider',
              id: 'anthropic.web_search_20250305',
              name: 'web_search',
              args: {
                maxUses: 1,
              },
            },
          ],
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody.tools).toHaveLength(2);

        expect(requestBody.tools[0]).toEqual({
          name: 'calculator',
          description: 'Calculate math',
          input_schema: { type: 'object', properties: {} },
        });

        expect(requestBody.tools[1]).toEqual({
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 1,
        });
      });
    });

    describe('web fetch tool', () => {
      describe('text response', () => {
        let result: Awaited<ReturnType<LanguageModelV3['doGenerate']>>;

        beforeEach(async () => {
          prepareJsonFixtureResponse('anthropic-web-fetch-tool.1');

          result = await model.doGenerate({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider',
                id: 'anthropic.web_fetch_20250910',
                name: 'web_fetch',
                args: { maxUses: 1 },
              },
            ],
          });
        });

        it('should send request body with include and tool', async () => {
          expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 4096,
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-3-haiku-20240307",
            "tools": [
              {
                "max_uses": 1,
                "name": "web_fetch",
                "type": "web_fetch_20250910",
              },
            ],
          }
        `);
        });

        it('should include web fetch tool call and result in content', async () => {
          expect(result.content).toMatchSnapshot();
        });
      });

      describe('text response without title', () => {
        let result: Awaited<ReturnType<LanguageModelV3['doGenerate']>>;

        beforeEach(async () => {
          prepareJsonFixtureResponse('anthropic-web-fetch-tool.2');

          result = await model.doGenerate({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider',
                id: 'anthropic.web_fetch_20250910',
                name: 'web_fetch',
                args: { maxUses: 1 },
              },
            ],
          });
        });

        it('should include web fetch tool call and result in content', async () => {
          expect(result.content).toMatchSnapshot();
        });
      });

      describe('unavailable error', () => {
        let result: Awaited<ReturnType<LanguageModelV3['doGenerate']>>;

        beforeEach(async () => {
          prepareJsonFixtureResponse('anthropic-web-fetch-tool.error');

          result = await model.doGenerate({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider',
                id: 'anthropic.web_fetch_20250910',
                name: 'web_fetch',
                args: { maxUses: 1 },
              },
            ],
          });
        });

        it('should include web fetch tool call and result in content', async () => {
          expect(result.content).toMatchSnapshot();
        });
      });
    });

    describe('mcp servers', () => {
      it('should send request body with include and tool', async () => {
        prepareJsonFixtureResponse('anthropic-mcp.1');

        await model.doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            anthropic: {
              mcpServers: [
                {
                  type: 'url',
                  name: 'echo',
                  url: 'https://echo.mcp.inevitable.fyi/mcp',
                },
              ],
            } satisfies AnthropicProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 4096,
            "mcp_servers": [
              {
                "name": "echo",
                "type": "url",
                "url": "https://echo.mcp.inevitable.fyi/mcp",
              },
            ],
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-3-haiku-20240307",
          }
        `);

        expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
          {
            "anthropic-beta": "mcp-client-2025-04-04",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "x-api-key": "test-api-key",
          }
        `);
      });

      it('should include mcp tool call and result in content', async () => {
        prepareJsonFixtureResponse('anthropic-mcp.1');

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            anthropic: {
              mcpServers: [
                {
                  type: 'url',
                  name: 'echo',
                  url: 'https://echo.mcp.inevitable.fyi/mcp',
                },
              ],
            } satisfies AnthropicProviderOptions,
          },
        });

        expect(result.content).toMatchSnapshot();
      });
    });

    describe('agent skills', () => {
      it('should send request body with skills in container', async () => {
        prepareJsonFixtureResponse(
          'anthropic-code-execution-20250825.pptx-skill',
        );

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.code_execution_20250825',
              name: 'code_execution',
              args: {},
            },
          ],
          providerOptions: {
            anthropic: {
              container: {
                id: 'test-container-id',
                skills: [
                  {
                    type: 'anthropic',
                    skillId: 'pptx',
                    version: 'latest',
                  },
                  {
                    type: 'custom',
                    skillId: 'my-custom-skill',
                    version: '1.0',
                  },
                ],
              },
            } satisfies AnthropicProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "container": {
              "id": "test-container-id",
              "skills": [
                {
                  "skill_id": "pptx",
                  "type": "anthropic",
                  "version": "latest",
                },
                {
                  "skill_id": "my-custom-skill",
                  "type": "custom",
                  "version": "1.0",
                },
              ],
            },
            "max_tokens": 4096,
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-3-haiku-20240307",
            "tools": [
              {
                "name": "code_execution",
                "type": "code_execution_20250825",
              },
            ],
          }
        `);

        expect(result.warnings).toMatchInlineSnapshot(`[]`);
      });

      it('should add a warning when the code execution tool is not present', async () => {
        prepareJsonFixtureResponse(
          'anthropic-code-execution-20250825.pptx-skill',
        );

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            anthropic: {
              container: {
                id: 'test-container-id',
                skills: [
                  {
                    type: 'anthropic',
                    skillId: 'pptx',
                    version: 'latest',
                  },
                  {
                    type: 'custom',
                    skillId: 'my-custom-skill',
                    version: '1.0',
                  },
                ],
              },
            } satisfies AnthropicProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "container": {
              "id": "test-container-id",
              "skills": [
                {
                  "skill_id": "pptx",
                  "type": "anthropic",
                  "version": "latest",
                },
                {
                  "skill_id": "my-custom-skill",
                  "type": "custom",
                  "version": "1.0",
                },
              ],
            },
            "max_tokens": 4096,
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-3-haiku-20240307",
          }
        `);

        expect(result.warnings).toMatchInlineSnapshot(`
          [
            {
              "message": "code execution tool is required when using skills",
              "type": "other",
            },
          ]
        `);
      });

      it('should include beta headers when skills are configured', async () => {
        prepareJsonFixtureResponse(
          'anthropic-code-execution-20250825.pptx-skill',
        );

        await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.code_execution_20250825',
              name: 'code_execution',
              args: {},
            },
          ],
          providerOptions: {
            anthropic: {
              container: {
                skills: [
                  {
                    type: 'anthropic',
                    skillId: 'pptx',
                    version: 'latest',
                  },
                ],
              },
            } satisfies AnthropicProviderOptions,
          },
        });

        expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
          {
            "anthropic-beta": "code-execution-2025-08-25,skills-2025-10-02,files-api-2025-04-14",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "x-api-key": "test-api-key",
          }
        `);
      });

      it('should expose container information as provider metadata', async () => {
        prepareJsonFixtureResponse(
          'anthropic-code-execution-20250825.pptx-skill',
        );

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.code_execution_20250825',
              name: 'code_execution',
              args: {},
            },
          ],
          providerOptions: {
            anthropic: {
              container: {
                skills: [
                  {
                    type: 'anthropic',
                    skillId: 'pptx',
                    version: 'latest',
                  },
                ],
              },
            } satisfies AnthropicProviderOptions,
          },
        });

        expect(result.providerMetadata).toMatchSnapshot();
      });
    });

    describe('memory 20250818', () => {
      it('should send request body with include and tool', async () => {
        prepareJsonFixtureResponse('anthropic-memory-20250818.1');

        await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.memory_20250818',
              name: 'memory',
              args: {},
            },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 4096,
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-3-haiku-20240307",
            "tools": [
              {
                "name": "memory",
                "type": "memory_20250818",
              },
            ],
          }
        `);

        expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
          {
            "anthropic-beta": "context-management-2025-06-27",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "x-api-key": "test-api-key",
          }
        `);
      });

      it('should include memory tool call and result in content', async () => {
        prepareJsonFixtureResponse('anthropic-memory-20250818.1');

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.memory_20250818',
              name: 'memory',
              args: {},
            },
          ],
        });

        expect(result.content).toMatchSnapshot();
      });
    });

    describe('code execution 20250825', () => {
      it('should send request body with include and tool', async () => {
        prepareJsonFixtureResponse('anthropic-code-execution-20250825.1');

        await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.code_execution_20250825',
              name: 'code_execution',
              args: {},
            },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 4096,
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-3-haiku-20240307",
            "tools": [
              {
                "name": "code_execution",
                "type": "code_execution_20250825",
              },
            ],
          }
        `);

        expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
          {
            "anthropic-beta": "code-execution-2025-08-25",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "x-api-key": "test-api-key",
          }
        `);
      });

      it('should include code execution tool call and result in content', async () => {
        prepareJsonFixtureResponse('anthropic-code-execution-20250825.1');

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.code_execution_20250825',
              name: 'code_execution',
              args: {},
            },
          ],
        });

        expect(result.content).toMatchSnapshot();
      });

      it('should expose container information as provider metadata', async () => {
        prepareJsonFixtureResponse('anthropic-code-execution-20250825.1');

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.code_execution_20250825',
              name: 'code_execution',
              args: {},
            },
          ],
        });

        expect(result.providerMetadata).toMatchSnapshot();
      });

      it('should include file id list in code execution tool generate call result.', async () => {
        prepareJsonFixtureResponse('anthropic-code-execution-20250825.2');

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.code_execution_20250825',
              name: 'code_execution',
              args: {},
            },
          ],
        });

        expect(result).toMatchSnapshot();
      });
    });

    describe('code execution 20250522', () => {
      const TEST_PROMPT = [
        {
          role: 'user' as const,
          content: [
            {
              type: 'text' as const,
              text: 'Write a Python function to calculate factorial',
            },
          ],
        },
      ];

      function prepareJsonResponse(body: any) {
        server.urls['https://api.anthropic.com/v1/messages'].response = {
          type: 'json-value',
          body,
        };
      }

      it('should enable server-side code execution when using anthropic.tools.codeExecution_20250522', async () => {
        prepareJsonResponse({
          type: 'message',
          id: 'msg_test',
          content: [
            {
              type: 'text',
              text: 'Here is a Python function to calculate factorial',
            },
          ],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        });

        await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.code_execution_20250522',
              name: 'code_execution',
              args: {},
            },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 4096,
            "messages": [
              {
                "content": [
                  {
                    "text": "Write a Python function to calculate factorial",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-3-haiku-20240307",
            "tools": [
              {
                "name": "code_execution",
                "type": "code_execution_20250522",
              },
            ],
          }
        `);

        expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
          {
            "anthropic-beta": "code-execution-2025-05-22",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "x-api-key": "test-api-key",
          }
        `);
      });

      it('should handle server-side code execution results', async () => {
        prepareJsonResponse({
          type: 'message',
          id: 'msg_test',
          content: [
            {
              type: 'server_tool_use',
              id: 'tool_1',
              name: 'code_execution',
              input: { code: 'print("Hello, World!")' },
            },
            {
              type: 'code_execution_tool_result',
              tool_use_id: 'tool_1',
              content: {
                type: 'code_execution_result',
                stdout: 'Hello, World!\n',
                stderr: '',
                return_code: 0,
              },
            },
            {
              type: 'text',
              text: 'The code executed successfully with output: Hello, World!',
            },
          ],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 15,
            output_tokens: 25,
            server_tool_use: { code_execution_requests: 1 },
          },
        });

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.code_execution_20250522',
              name: 'code_execution',
              args: {},
            },
          ],
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "input": "{"code":"print(\\"Hello, World!\\")"}",
              "providerExecuted": true,
              "toolCallId": "tool_1",
              "toolName": "code_execution",
              "type": "tool-call",
            },
            {
              "result": {
                "return_code": 0,
                "stderr": "",
                "stdout": "Hello, World!
          ",
                "type": "code_execution_result",
              },
              "toolCallId": "tool_1",
              "toolName": "code_execution",
              "type": "tool-result",
            },
            {
              "text": "The code executed successfully with output: Hello, World!",
              "type": "text",
            },
          ]
        `);
      });

      it('should handle server-side code execution errors', async () => {
        prepareJsonResponse({
          type: 'message',
          id: 'msg_test',
          content: [
            {
              type: 'code_execution_tool_result',
              tool_use_id: 'tool_1',
              content: {
                type: 'code_execution_tool_result_error',
                error_code: 'unavailable',
              },
            },
            {
              type: 'text',
              text: 'The code execution service is currently unavailable.',
            },
          ],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        });

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'provider',
              id: 'anthropic.code_execution_20250522',
              name: 'code_execution',
              args: {},
            },
          ],
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "isError": true,
              "result": {
                "errorCode": "unavailable",
                "type": "code_execution_tool_result_error",
              },
              "toolCallId": "tool_1",
              "toolName": "code_execution",
              "type": "tool-result",
            },
            {
              "text": "The code execution service is currently unavailable.",
              "type": "text",
            },
          ]
        `);
      });

      it('should work alongside regular client-side tools', async () => {
        prepareJsonResponse({
          type: 'message',
          id: 'msg_test',
          content: [
            { type: 'text', text: 'I can execute code and calculate.' },
          ],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        });

        await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'calculator',
              description: 'Calculate math expressions',
              inputSchema: { type: 'object', properties: {} },
            },
            {
              type: 'provider',
              id: 'anthropic.code_execution_20250522',
              name: 'code_execution',
              args: {},
            },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 4096,
            "messages": [
              {
                "content": [
                  {
                    "text": "Write a Python function to calculate factorial",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-3-haiku-20240307",
            "tools": [
              {
                "description": "Calculate math expressions",
                "input_schema": {
                  "properties": {},
                  "type": "object",
                },
                "name": "calculator",
              },
              {
                "name": "code_execution",
                "type": "code_execution_20250522",
              },
            ],
          }
        `);

        expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
          {
            "anthropic-beta": "code-execution-2025-05-22",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "x-api-key": "test-api-key",
          }
        `);
      });
    });

    it('should throw an api error when the server is returning a 529 overloaded error', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'error',
        status: 529,
        body: '{"type":"error","error":{"details":null,"type":"overloaded_error","message":"Overloaded"}}',
      };

      await expect(
        model.doGenerate({ prompt: TEST_PROMPT }),
      ).rejects.toThrowError(
        new APICallError({
          message: 'Overloaded',
          url: 'https://api.anthropic.com/v1/messages',
          requestBodyValues: {},
          statusCode: 529,
          responseHeaders: {},
          responseBody:
            '{"type":"error","error":{"details":null,"type":"overloaded_error","message":"Overloaded"}}',
          isRetryable: true,
        }),
      );
    });

    describe('temperature clamping', () => {
      it('should clamp temperature above 1 to 1 and add warning', async () => {
        prepareJsonResponse({});

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          temperature: 1.5,
        });

        const requestBody = await server.calls[0].requestBodyJson;

        expect(requestBody.temperature).toBe(1);
        expect(result.warnings).toMatchInlineSnapshot(`
          [
            {
              "details": "1.5 exceeds anthropic maximum of 1.0. clamped to 1.0",
              "feature": "temperature",
              "type": "unsupported",
            },
          ]
        `);
      });

      it('should clamp temperature below 0 to 0 and add warning', async () => {
        prepareJsonResponse({});

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          temperature: -0.5,
        });

        const requestBody = await server.calls[0].requestBodyJson;

        expect(requestBody.temperature).toBe(0);
        expect(result.warnings).toMatchInlineSnapshot(`
          [
            {
              "details": "-0.5 is below anthropic minimum of 0. clamped to 0",
              "feature": "temperature",
              "type": "unsupported",
            },
          ]
        `);
      });

      it('should not clamp valid temperature between 0 and 1', async () => {
        prepareJsonResponse({});

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          temperature: 0.7,
        });

        const requestBody = await server.calls[0].requestBodyJson;

        expect(requestBody.temperature).toBe(0.7);
        expect(result.warnings).toMatchInlineSnapshot(`[]`);
      });
    });

    it('should set effort', async () => {
      prepareJsonResponse({});

      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          anthropic: {
            effort: 'medium',
          } satisfies AnthropicProviderOptions,
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "max_tokens": 4096,
          "messages": [
            {
              "content": [
                {
                  "text": "Hello",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ],
          "model": "claude-3-haiku-20240307",
          "output_config": {
            "effort": "medium",
          },
        }
      `);
      expect(await server.calls[0].requestHeaders).toMatchInlineSnapshot(`
        {
          "anthropic-beta": "effort-2025-11-24",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": "test-api-key",
        }
      `);

      expect(result.warnings).toStrictEqual([]);
    });
  });

  describe('doStream', () => {
    describe('json schema response format (unsupported model)', () => {
      let result: Array<LanguageModelV3StreamPart>;

      beforeEach(async () => {
        prepareChunksFixtureResponse('anthropic-json-tool.1');

        const { stream } = await model.doStream({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              required: ['name'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        });

        result = await convertReadableStreamToArray(stream);
      });

      it('should pass json schema response format as a tool', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 4096,
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-3-haiku-20240307",
            "stream": true,
            "tool_choice": {
              "disable_parallel_tool_use": true,
              "type": "any",
            },
            "tools": [
              {
                "description": "Respond with a JSON object.",
                "input_schema": {
                  "$schema": "http://json-schema.org/draft-07/schema#",
                  "additionalProperties": false,
                  "properties": {
                    "name": {
                      "type": "string",
                    },
                  },
                  "required": [
                    "name",
                  ],
                  "type": "object",
                },
                "name": "json",
              },
            ],
          }
        `);
      });

      it('should stream the response', async () => {
        expect(result).toMatchInlineSnapshot(`
          [
            {
              "type": "stream-start",
              "warnings": [],
            },
            {
              "id": "msg_01K2JbSUMYhez5RHoK9ZCj9U",
              "modelId": "claude-haiku-4-5-20251001",
              "type": "response-metadata",
            },
            {
              "id": "0",
              "type": "text-start",
            },
            {
              "delta": "{"elements": [{"location": "San Francisco", "temperature": 58, "condition": "sunny"}]",
              "id": "0",
              "type": "text-delta",
            },
            {
              "delta": "}",
              "id": "0",
              "type": "text-delta",
            },
            {
              "id": "0",
              "type": "text-end",
            },
            {
              "finishReason": "stop",
              "providerMetadata": {
                "anthropic": {
                  "cacheCreationInputTokens": 0,
                  "container": null,
                  "stopSequence": null,
                  "usage": {
                    "cache_creation": {
                      "ephemeral_1h_input_tokens": 0,
                      "ephemeral_5m_input_tokens": 0,
                    },
                    "cache_creation_input_tokens": 0,
                    "cache_read_input_tokens": 0,
                    "input_tokens": 849,
                    "output_tokens": 47,
                    "service_tier": "standard",
                  },
                },
              },
              "type": "finish",
              "usage": {
                "cachedInputTokens": 0,
                "inputTokens": 849,
                "outputTokens": 47,
                "totalTokens": 896,
              },
            },
          ]
        `);
      });
    });

    describe('json schema response format with text content prefix', () => {
      let result: Array<LanguageModelV3StreamPart>;

      beforeEach(async () => {
        prepareChunksFixtureResponse('anthropic-json-tool.2');

        const { stream } = await model.doStream({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              required: ['name'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        });

        result = await convertReadableStreamToArray(stream);
      });

      it('should pass json schema response format as a tool', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 4096,
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-3-haiku-20240307",
            "stream": true,
            "tool_choice": {
              "disable_parallel_tool_use": true,
              "type": "any",
            },
            "tools": [
              {
                "description": "Respond with a JSON object.",
                "input_schema": {
                  "$schema": "http://json-schema.org/draft-07/schema#",
                  "additionalProperties": false,
                  "properties": {
                    "name": {
                      "type": "string",
                    },
                  },
                  "required": [
                    "name",
                  ],
                  "type": "object",
                },
                "name": "json",
              },
            ],
          }
        `);
      });

      it('should stream the response', async () => {
        expect(result).toMatchInlineSnapshot(`
          [
            {
              "type": "stream-start",
              "warnings": [],
            },
            {
              "id": "msg_01K2JbSUMYhez5RHoK9ZCj9U",
              "modelId": "claude-haiku-4-5-20251001",
              "type": "response-metadata",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "delta": "{"elements": [{"location": "San Francisco", "temperature": 58, "condition": "sunny"}]",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": "}",
              "id": "1",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "finishReason": "stop",
              "providerMetadata": {
                "anthropic": {
                  "cacheCreationInputTokens": 0,
                  "container": null,
                  "stopSequence": null,
                  "usage": {
                    "cache_creation": {
                      "ephemeral_1h_input_tokens": 0,
                      "ephemeral_5m_input_tokens": 0,
                    },
                    "cache_creation_input_tokens": 0,
                    "cache_read_input_tokens": 0,
                    "input_tokens": 849,
                    "output_tokens": 47,
                    "service_tier": "standard",
                  },
                },
              },
              "type": "finish",
              "usage": {
                "cachedInputTokens": 0,
                "inputTokens": 849,
                "outputTokens": 47,
                "totalTokens": 896,
              },
            },
          ]
        `);
      });
    });

    describe('json schema response format with other tool response (unsupported model)', () => {
      let result: Awaited<ReturnType<typeof model.doStream>>;

      beforeEach(async () => {
        prepareChunksFixtureResponse('anthropic-json-other-tool.1');

        result = await model.doStream({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'weather',
              description: 'Get the weather in a location',
              inputSchema: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
                required: ['location'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          ],
          responseFormat: {
            type: 'json',
            schema: {
              type: 'object',
              properties: {
                weather: { type: 'string' },
                temperature: { type: 'number' },
              },
              required: ['weather', 'temperature'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        });
      });

      it('should pass json schema response format as a tool', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 4096,
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-3-haiku-20240307",
            "stream": true,
            "tool_choice": {
              "disable_parallel_tool_use": true,
              "type": "any",
            },
            "tools": [
              {
                "description": "Get the weather in a location",
                "input_schema": {
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
                "name": "weather",
              },
              {
                "description": "Respond with a JSON object.",
                "input_schema": {
                  "$schema": "http://json-schema.org/draft-07/schema#",
                  "additionalProperties": false,
                  "properties": {
                    "temperature": {
                      "type": "number",
                    },
                    "weather": {
                      "type": "string",
                    },
                  },
                  "required": [
                    "weather",
                    "temperature",
                  ],
                  "type": "object",
                },
                "name": "json",
              },
            ],
          }
        `);
      });

      it('should stream the tool call', async () => {
        expect(await convertReadableStreamToArray(result.stream))
          .toMatchInlineSnapshot(`
            [
              {
                "type": "stream-start",
                "warnings": [],
              },
              {
                "id": "msg_01CD3XaZfhNabxRt1SG5ybtK",
                "modelId": "claude-haiku-4-5-20251001",
                "type": "response-metadata",
              },
              {
                "id": "toolu_019Zvehfe1XQWweT1pm7okyt",
                "toolName": "weather",
                "type": "tool-input-start",
              },
              {
                "delta": "{"location": "San Francisco",
                "id": "toolu_019Zvehfe1XQWweT1pm7okyt",
                "type": "tool-input-delta",
              },
              {
                "delta": ""}",
                "id": "toolu_019Zvehfe1XQWweT1pm7okyt",
                "type": "tool-input-delta",
              },
              {
                "id": "toolu_019Zvehfe1XQWweT1pm7okyt",
                "type": "tool-input-end",
              },
              {
                "input": "{"location": "San Francisco"}",
                "providerExecuted": undefined,
                "toolCallId": "toolu_019Zvehfe1XQWweT1pm7okyt",
                "toolName": "weather",
                "type": "tool-call",
              },
              {
                "finishReason": "tool-calls",
                "providerMetadata": {
                  "anthropic": {
                    "cacheCreationInputTokens": 0,
                    "container": null,
                    "stopSequence": null,
                    "usage": {
                      "cache_creation": {
                        "ephemeral_1h_input_tokens": 0,
                        "ephemeral_5m_input_tokens": 0,
                      },
                      "cache_creation_input_tokens": 0,
                      "cache_read_input_tokens": 0,
                      "input_tokens": 843,
                      "output_tokens": 28,
                      "service_tier": "standard",
                    },
                  },
                },
                "type": "finish",
                "usage": {
                  "cachedInputTokens": 0,
                  "inputTokens": 843,
                  "outputTokens": 28,
                  "totalTokens": 871,
                },
              },
            ]
          `);
      });
    });

    describe('json schema response format with output format (supported model)', () => {
      let result: Awaited<ReturnType<typeof model.doStream>>;

      beforeEach(async () => {
        prepareChunksFixtureResponse('anthropic-json-output-format.1');

        result = await provider('claude-sonnet-4-5').doStream({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
            schema: {
              type: 'object',
              properties: {
                characters: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      class: { type: 'string' },
                      description: { type: 'string' },
                    },
                    required: ['name', 'class', 'description'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['characters'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        });
      });

      it('should pass json schema response format as output format', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "max_tokens": 64000,
            "messages": [
              {
                "content": [
                  {
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-sonnet-4-5",
            "output_format": {
              "schema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "additionalProperties": false,
                "properties": {
                  "characters": {
                    "items": {
                      "additionalProperties": false,
                      "properties": {
                        "class": {
                          "type": "string",
                        },
                        "description": {
                          "type": "string",
                        },
                        "name": {
                          "type": "string",
                        },
                      },
                      "required": [
                        "name",
                        "class",
                        "description",
                      ],
                      "type": "object",
                    },
                    "type": "array",
                  },
                },
                "required": [
                  "characters",
                ],
                "type": "object",
              },
              "type": "json_schema",
            },
            "stream": true,
          }
        `);
      });

      it('should stream the text output', async () => {
        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });

    it('should stream text deltas', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":", "}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"World!"}}\n\n`,
          `data: {"type":"content_block_stop","index":0}\n\n`,
          `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}}\n\n`,
          `data: {"type":"message_stop"}\n\n`,
        ],
      };

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "msg_01KfpJoAEabmH2iHRRFjQMAG",
            "modelId": "claude-3-haiku-20240307",
            "type": "response-metadata",
          },
          {
            "id": "0",
            "type": "text-start",
          },
          {
            "delta": "Hello",
            "id": "0",
            "type": "text-delta",
          },
          {
            "delta": ", ",
            "id": "0",
            "type": "text-delta",
          },
          {
            "delta": "World!",
            "id": "0",
            "type": "text-delta",
          },
          {
            "id": "0",
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "anthropic": {
                "cacheCreationInputTokens": null,
                "container": null,
                "stopSequence": null,
                "usage": {
                  "input_tokens": 17,
                  "output_tokens": 227,
                },
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 17,
              "outputTokens": 227,
              "totalTokens": 244,
            },
          },
        ]
      `);
    });

    it('should stream reasoning deltas', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"I am"}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"thinking..."}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"1234567890"}}\n\n`,
          `data: {"type":"content_block_stop","index":0}\n\n`,
          `data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n`,
          `data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Hello, World!"}}\n\n`,
          `data: {"type":"content_block_stop","index":1}\n\n`,
          `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}}\n\n`,
          `data: {"type":"message_stop"}\n\n`,
        ],
      };

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "msg_01KfpJoAEabmH2iHRRFjQMAG",
            "modelId": "claude-3-haiku-20240307",
            "type": "response-metadata",
          },
          {
            "id": "0",
            "type": "reasoning-start",
          },
          {
            "delta": "I am",
            "id": "0",
            "type": "reasoning-delta",
          },
          {
            "delta": "thinking...",
            "id": "0",
            "type": "reasoning-delta",
          },
          {
            "delta": "",
            "id": "0",
            "providerMetadata": {
              "anthropic": {
                "signature": "1234567890",
              },
            },
            "type": "reasoning-delta",
          },
          {
            "id": "0",
            "type": "reasoning-end",
          },
          {
            "id": "1",
            "type": "text-start",
          },
          {
            "delta": "Hello, World!",
            "id": "1",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "anthropic": {
                "cacheCreationInputTokens": null,
                "container": null,
                "stopSequence": null,
                "usage": {
                  "input_tokens": 17,
                  "output_tokens": 227,
                },
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 17,
              "outputTokens": 227,
              "totalTokens": 244,
            },
          },
        ]
      `);
    });

    it('should stream redacted reasoning', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"redacted_thinking","data":"redacted-thinking-data"}}\n\n`,
          `data: {"type":"content_block_stop","index":0}\n\n`,
          `data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n`,
          `data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Hello, World!"}}\n\n`,
          `data: {"type":"content_block_stop","index":1}\n\n`,
          `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}}\n\n`,
          `data: {"type":"message_stop"}\n\n`,
        ],
      };

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "msg_01KfpJoAEabmH2iHRRFjQMAG",
            "modelId": "claude-3-haiku-20240307",
            "type": "response-metadata",
          },
          {
            "id": "0",
            "providerMetadata": {
              "anthropic": {
                "redactedData": "redacted-thinking-data",
              },
            },
            "type": "reasoning-start",
          },
          {
            "id": "0",
            "type": "reasoning-end",
          },
          {
            "id": "1",
            "type": "text-start",
          },
          {
            "delta": "Hello, World!",
            "id": "1",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "anthropic": {
                "cacheCreationInputTokens": null,
                "container": null,
                "stopSequence": null,
                "usage": {
                  "input_tokens": 17,
                  "output_tokens": 227,
                },
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 17,
              "outputTokens": 227,
              "totalTokens": 244,
            },
          },
        ]
      `);
    });

    it('should ignore signatures on text deltas', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello, World!"}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"1234567890"}}\n\n`,
          `data: {"type":"content_block_stop","index":0}\n\n`,
          `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}}\n\n`,
          `data: {"type":"message_stop"}\n\n`,
        ],
      };

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "msg_01KfpJoAEabmH2iHRRFjQMAG",
            "modelId": "claude-3-haiku-20240307",
            "type": "response-metadata",
          },
          {
            "id": "0",
            "type": "text-start",
          },
          {
            "delta": "Hello, World!",
            "id": "0",
            "type": "text-delta",
          },
          {
            "id": "0",
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "anthropic": {
                "cacheCreationInputTokens": null,
                "container": null,
                "stopSequence": null,
                "usage": {
                  "input_tokens": 17,
                  "output_tokens": 227,
                },
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 17,
              "outputTokens": 227,
              "totalTokens": 244,
            },
          },
        ]
      `);
    });

    it('should stream tool deltas', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01GouTqNCGXzrj5LQ5jEkw67","type":"message","role":"assistant","model":"claude-3-haiku-20240307","stop_sequence":null,"usage":{"input_tokens":441,"output_tokens":2},"content":[],"stop_reason":null}            }\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}      }\n\n`,
          `data: {"type": "ping"}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Okay"}    }\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"!"}   }\n\n`,
          `data: {"type":"content_block_stop","index":0    }\n\n`,
          `data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_01DBsB4vvYLnBDzZ5rBSxSLs","name":"test-tool","input":{}}      }\n\n`,
          `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":""}           }\n\n`,
          `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"value"}              }\n\n`,
          `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\":"}      }\n\n`,
          `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"Spark"}          }\n\n`,
          `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"le"}          }\n\n`,
          `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":" Day\\"}"}               }\n\n`,
          `data: {"type":"content_block_stop","index":1              }\n\n`,
          `data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":65}           }\n\n`,
          `data: {"type":"message_stop"           }\n\n`,
        ],
      };

      const { stream } = await model.doStream({
        tools: [
          {
            type: 'function',
            name: 'test-tool',
            inputSchema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "msg_01GouTqNCGXzrj5LQ5jEkw67",
            "modelId": "claude-3-haiku-20240307",
            "type": "response-metadata",
          },
          {
            "id": "0",
            "type": "text-start",
          },
          {
            "delta": "Okay",
            "id": "0",
            "type": "text-delta",
          },
          {
            "delta": "!",
            "id": "0",
            "type": "text-delta",
          },
          {
            "id": "0",
            "type": "text-end",
          },
          {
            "id": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "toolName": "test-tool",
            "type": "tool-input-start",
          },
          {
            "delta": "{"value",
            "id": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "type": "tool-input-delta",
          },
          {
            "delta": "":",
            "id": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "type": "tool-input-delta",
          },
          {
            "delta": ""Spark",
            "id": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "type": "tool-input-delta",
          },
          {
            "delta": "le",
            "id": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "type": "tool-input-delta",
          },
          {
            "delta": " Day"}",
            "id": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "type": "tool-input-delta",
          },
          {
            "id": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "type": "tool-input-end",
          },
          {
            "input": "{"value":"Sparkle Day"}",
            "providerExecuted": undefined,
            "toolCallId": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "toolName": "test-tool",
            "type": "tool-call",
          },
          {
            "finishReason": "tool-calls",
            "providerMetadata": {
              "anthropic": {
                "cacheCreationInputTokens": null,
                "container": null,
                "stopSequence": null,
                "usage": {
                  "input_tokens": 441,
                  "output_tokens": 65,
                },
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 441,
              "outputTokens": 65,
              "totalTokens": 506,
            },
          },
        ]
      `);
    });

    it('should forward error chunks', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}      }\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}          }\n\n`,
          `data: {"type": "ping"}\n\n`,
          `data: {"type":"error","error":{"type":"error","message":"test error"}}\n\n`,
        ],
      };

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "msg_01KfpJoAEabmH2iHRRFjQMAG",
            "modelId": "claude-3-haiku-20240307",
            "type": "response-metadata",
          },
          {
            "id": "0",
            "type": "text-start",
          },
          {
            "error": {
              "message": "test error",
              "type": "error",
            },
            "type": "error",
          },
        ]
      `);
    });

    it('should expose the raw response headers', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        headers: { 'test-header': 'test-value' },
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello, World!"}}\n\n`,
          `data: {"type":"content_block_stop","index":0}\n\n`,
          `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}}\n\n`,
          `data: {"type":"message_stop"}\n\n`,
        ],
      };

      const { response } = await model.doStream({
        prompt: TEST_PROMPT,
      });

      expect(response?.headers).toStrictEqual({
        // default headers:
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',

        // custom header
        'test-header': 'test-value',
      });
    });

    it('should pass the messages and the model', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        headers: { 'test-header': 'test-value' },
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello, World!"}}\n\n`,
          `data: {"type":"content_block_stop","index":0}\n\n`,
          `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}}\n\n`,
          `data: {"type":"message_stop"}\n\n`,
        ],
      };

      await model.doStream({
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        stream: true,
        model: 'claude-3-haiku-20240307',
        max_tokens: 4096, // default value
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
      });
    });

    it('should pass headers', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        headers: { 'test-header': 'test-value' },
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello, World!"}}\n\n`,
          `data: {"type":"content_block_stop","index":0}\n\n`,
          `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}}\n\n`,
          `data: {"type":"message_stop"}\n\n`,
        ],
      };

      const provider = createAnthropic({
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider('claude-3-haiku-20240307').doStream({
        prompt: TEST_PROMPT,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
        {
          "anthropic-beta": "fine-grained-tool-streaming-2025-05-14",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "custom-provider-header": "provider-header-value",
          "custom-request-header": "request-header-value",
          "x-api-key": "test-api-key",
        }
      `);
    });

    it('should merge custom anthropic-beta header with fine-grained-tool-streaming beta', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello, World!"}}\n\n`,
          `data: {"type":"content_block_stop","index":0}\n\n`,
          `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}}\n\n`,
          `data: {"type":"message_stop"}\n\n`,
        ],
      };

      const provider = createAnthropic({
        apiKey: 'test-api-key',
        headers: { 'anthropic-beta': 'CONFIG-beta1,config-beta2' },
      });

      await provider('claude-3-haiku-20240307').doStream({
        prompt: TEST_PROMPT,
        headers: { 'anthropic-beta': 'REQUEST-beta1,request-beta2' },
      });

      expect(
        server.calls[0].requestHeaders['anthropic-beta'],
      ).toMatchInlineSnapshot(
        `"fine-grained-tool-streaming-2025-05-14,config-beta1,config-beta2,request-beta1,request-beta2"`,
      );
    });

    it('should support cache control', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],` +
            `"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":` +
            // send cache output tokens:
            `{"input_tokens":17,"output_tokens":1,"cache_creation_input_tokens":10,"cache_read_input_tokens":5}}      }\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}          }\n\n`,
          `data: {"type": "ping"}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"${'Hello'}"}              }\n\n`,
          `data: {"type":"content_block_stop","index":0             }\n\n`,
          `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}          }\n\n`,
          `data: {"type":"message_stop"           }\n\n`,
        ],
      };

      const model = provider('claude-3-haiku-20240307');

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "msg_01KfpJoAEabmH2iHRRFjQMAG",
            "modelId": "claude-3-haiku-20240307",
            "type": "response-metadata",
          },
          {
            "id": "0",
            "type": "text-start",
          },
          {
            "delta": "Hello",
            "id": "0",
            "type": "text-delta",
          },
          {
            "id": "0",
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "anthropic": {
                "cacheCreationInputTokens": 10,
                "container": null,
                "stopSequence": null,
                "usage": {
                  "cache_creation_input_tokens": 10,
                  "cache_read_input_tokens": 5,
                  "input_tokens": 17,
                  "output_tokens": 227,
                },
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 5,
              "inputTokens": 17,
              "outputTokens": 227,
              "totalTokens": 244,
            },
          },
        ]
      `);
    });

    it('should support cache control and return extra fields in provider metadata', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],` +
            `"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":` +
            // send cache output tokens:
            `{"input_tokens":17,"output_tokens":1,"cache_creation_input_tokens":10,"cache_read_input_tokens":5,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":10}}}}\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}          }\n\n`,
          `data: {"type": "ping"}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"${'Hello'}"}              }\n\n`,
          `data: {"type":"content_block_stop","index":0             }\n\n`,
          `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}          }\n\n`,
          `data: {"type":"message_stop"           }\n\n`,
        ],
      };

      const model = provider('claude-3-haiku-20240307');

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "msg_01KfpJoAEabmH2iHRRFjQMAG",
            "modelId": "claude-3-haiku-20240307",
            "type": "response-metadata",
          },
          {
            "id": "0",
            "type": "text-start",
          },
          {
            "delta": "Hello",
            "id": "0",
            "type": "text-delta",
          },
          {
            "id": "0",
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "anthropic": {
                "cacheCreationInputTokens": 10,
                "container": null,
                "stopSequence": null,
                "usage": {
                  "cache_creation": {
                    "ephemeral_1h_input_tokens": 10,
                    "ephemeral_5m_input_tokens": 0,
                  },
                  "cache_creation_input_tokens": 10,
                  "cache_read_input_tokens": 5,
                  "input_tokens": 17,
                  "output_tokens": 227,
                },
              },
            },
            "type": "finish",
            "usage": {
              "cachedInputTokens": 5,
              "inputTokens": 17,
              "outputTokens": 227,
              "totalTokens": 244,
            },
          },
        ]
      `);
    });

    it('should send request body', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        headers: { 'test-header': 'test-value' },
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello, World!"}}\n\n`,
          `data: {"type":"content_block_stop","index":0}\n\n`,
          `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}}\n\n`,
          `data: {"type":"message_stop"}\n\n`,
        ],
      };

      const { request } = await model.doStream({
        prompt: TEST_PROMPT,
      });

      expect(request).toMatchInlineSnapshot(`
        {
          "body": {
            "max_tokens": 4096,
            "messages": [
              {
                "content": [
                  {
                    "cache_control": undefined,
                    "text": "Hello",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "model": "claude-3-haiku-20240307",
            "stop_sequences": undefined,
            "stream": true,
            "system": undefined,
            "temperature": undefined,
            "tool_choice": undefined,
            "tools": undefined,
            "top_k": undefined,
            "top_p": undefined,
          },
        }
      `);
    });

    it('should handle handle stop_reason:pause_turn', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":", "}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"World!"}}\n\n`,
          `data: {"type":"content_block_stop","index":0}\n\n`,
          `data: {"type":"message_delta","delta":{"stop_reason":"pause_turn","stop_sequence":null},"usage":{"output_tokens":227}}\n\n`,
          `data: {"type":"message_stop"}\n\n`,
        ],
      };

      const result = await model.doStream({
        prompt: TEST_PROMPT,
      });

      // consume stream
      const chunks = await convertReadableStreamToArray(result.stream);

      expect(chunks.filter(chunk => chunk.type === 'finish'))
        .toMatchInlineSnapshot(`
          [
            {
              "finishReason": "stop",
              "providerMetadata": {
                "anthropic": {
                  "cacheCreationInputTokens": null,
                  "container": null,
                  "stopSequence": null,
                  "usage": {
                    "input_tokens": 17,
                    "output_tokens": 227,
                  },
                },
              },
              "type": "finish",
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 17,
                "outputTokens": 227,
                "totalTokens": 244,
              },
            },
          ]
        `);
    });

    it('should include stop_sequence in provider metadata', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n`,
          `data: {"type":"content_block_stop","index":0}\n\n`,
          `data: {"type":"message_delta","delta":{"stop_reason":"stop_sequence","stop_sequence":"STOP"},"usage":{"output_tokens":227}}\n\n`,
          `data: {"type":"message_stop"}\n\n`,
        ],
      };

      const result = await model.doStream({
        prompt: TEST_PROMPT,
        stopSequences: ['STOP'],
      });

      const chunks = await convertReadableStreamToArray(result.stream);

      expect(chunks.filter(chunk => chunk.type === 'finish'))
        .toMatchInlineSnapshot(`
          [
            {
              "finishReason": "stop",
              "providerMetadata": {
                "anthropic": {
                  "cacheCreationInputTokens": null,
                  "container": null,
                  "stopSequence": "STOP",
                  "usage": {
                    "input_tokens": 17,
                    "output_tokens": 227,
                  },
                },
              },
              "type": "finish",
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 17,
                "outputTokens": 227,
                "totalTokens": 244,
              },
            },
          ]
        `);
    });

    describe('raw chunks', () => {
      it('should include raw chunks when includeRawChunks is enabled', async () => {
        server.urls['https://api.anthropic.com/v1/messages'].response = {
          type: 'stream-chunks',
          chunks: [
            `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
            `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
            `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n`,
            `data: {"type":"content_block_stop","index":0}\n\n`,
            `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}}\n\n`,
            `data: {"type":"message_stop"}\n\n`,
          ],
        };

        const { stream } = await model.doStream({
          prompt: TEST_PROMPT,
          includeRawChunks: true,
        });

        const chunks = await convertReadableStreamToArray(stream);

        expect(chunks.filter(chunk => chunk.type === 'raw'))
          .toMatchInlineSnapshot(`
        [
          {
            "rawValue": {
              "message": {
                "content": [],
                "id": "msg_01KfpJoAEabmH2iHRRFjQMAG",
                "model": "claude-3-haiku-20240307",
                "role": "assistant",
                "stop_reason": null,
                "stop_sequence": null,
                "type": "message",
                "usage": {
                  "input_tokens": 17,
                  "output_tokens": 1,
                },
              },
              "type": "message_start",
            },
            "type": "raw",
          },
          {
            "rawValue": {
              "content_block": {
                "text": "",
                "type": "text",
              },
              "index": 0,
              "type": "content_block_start",
            },
            "type": "raw",
          },
          {
            "rawValue": {
              "delta": {
                "text": "Hello",
                "type": "text_delta",
              },
              "index": 0,
              "type": "content_block_delta",
            },
            "type": "raw",
          },
          {
            "rawValue": {
              "index": 0,
              "type": "content_block_stop",
            },
            "type": "raw",
          },
          {
            "rawValue": {
              "delta": {
                "stop_reason": "end_turn",
                "stop_sequence": null,
              },
              "type": "message_delta",
              "usage": {
                "output_tokens": 227,
              },
            },
            "type": "raw",
          },
          {
            "rawValue": {
              "type": "message_stop",
            },
            "type": "raw",
          },
        ]
      `);
      });

      it('should not include raw chunks when includeRawChunks is false', async () => {
        server.urls['https://api.anthropic.com/v1/messages'].response = {
          type: 'stream-chunks',
          chunks: [
            `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
            `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
            `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n`,
            `data: {"type":"content_block_stop","index":0}\n\n`,
            `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}}\n\n`,
            `data: {"type":"message_stop"}\n\n`,
          ],
        };

        const { stream } = await model.doStream({
          prompt: TEST_PROMPT,
        });

        const chunks = await convertReadableStreamToArray(stream);
        expect(chunks.filter(chunk => chunk.type === 'raw')).toHaveLength(0);
      });

      it('should process PDF citation responses in streaming', async () => {
        // Create a model with predictable ID generation for testing
        const mockProvider = createAnthropic({
          apiKey: 'test-api-key',
          generateId: mockId(),
        });
        const modelWithMockId = mockProvider('claude-3-haiku-20240307');

        // Mock streaming response with PDF citations
        server.urls['https://api.anthropic.com/v1/messages'].response = {
          type: 'stream-chunks',
          chunks: [
            `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
            `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
            `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Based on the document"}}\n\n`,
            `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":", results show growth."}}\n\n`,
            `data: {"type":"content_block_stop","index":0}\n\n`,
            `data: {"type":"content_block_delta","index":0,"delta":{"type":"citations_delta","citation":{"type":"page_location","cited_text":"Revenue increased by 25% year over year","document_index":0,"document_title":"Financial Report 2023","start_page_number":5,"end_page_number":6}}}\n\n`,
            `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":227}}\n\n`,
            `data: {"type":"message_stop"}\n\n`,
          ],
        };

        const { stream } = await modelWithMockId.doStream({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  data: 'base64PDFdata',
                  mediaType: 'application/pdf',
                  filename: 'financial-report.pdf',
                  providerOptions: {
                    anthropic: {
                      citations: { enabled: true },
                    },
                  },
                },
                {
                  type: 'text',
                  text: 'What do the results show?',
                },
              ],
            },
          ],
        });

        const result = await convertReadableStreamToArray(stream);

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "type": "stream-start",
              "warnings": [],
            },
            {
              "id": "msg_01KfpJoAEabmH2iHRRFjQMAG",
              "modelId": "claude-3-haiku-20240307",
              "type": "response-metadata",
            },
            {
              "id": "0",
              "type": "text-start",
            },
            {
              "delta": "Based on the document",
              "id": "0",
              "type": "text-delta",
            },
            {
              "delta": ", results show growth.",
              "id": "0",
              "type": "text-delta",
            },
            {
              "id": "0",
              "type": "text-end",
            },
            {
              "filename": "financial-report.pdf",
              "id": "id-0",
              "mediaType": "application/pdf",
              "providerMetadata": {
                "anthropic": {
                  "citedText": "Revenue increased by 25% year over year",
                  "endPageNumber": 6,
                  "startPageNumber": 5,
                },
              },
              "sourceType": "document",
              "title": "Financial Report 2023",
              "type": "source",
            },
            {
              "finishReason": "stop",
              "providerMetadata": {
                "anthropic": {
                  "cacheCreationInputTokens": null,
                  "container": null,
                  "stopSequence": null,
                  "usage": {
                    "input_tokens": 17,
                    "output_tokens": 227,
                  },
                },
              },
              "type": "finish",
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 17,
                "outputTokens": 227,
                "totalTokens": 244,
              },
            },
          ]
        `);
      });

      describe('mcp servers', () => {
        it('should stream code execution tool results', async () => {
          prepareChunksFixtureResponse('anthropic-mcp.1');

          const result = await model.doStream({
            prompt: TEST_PROMPT,
            providerOptions: {
              anthropic: {
                mcpServers: [
                  {
                    type: 'url',
                    name: 'echo',
                    url: 'https://echo.mcp.inevitable.fyi/mcp',
                  },
                ],
              } satisfies AnthropicProviderOptions,
            },
          });
          expect(
            await convertReadableStreamToArray(result.stream),
          ).toMatchSnapshot();
        });
      });

      describe('agent skills', () => {
        it('should stream code execution tool results', async () => {
          prepareChunksFixtureResponse(
            'anthropic-code-execution-20250825.pptx-skill',
          );

          const result = await model.doStream({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider',
                id: 'anthropic.code_execution_20250825',
                name: 'code_execution',
                args: {},
              },
            ],
            providerOptions: {
              anthropic: {
                container: {
                  skills: [{ type: 'anthropic', skillId: 'pptx' }],
                },
              } satisfies AnthropicProviderOptions,
            },
          });

          expect(
            await convertReadableStreamToArray(result.stream),
          ).toMatchSnapshot();
        });
      });

      describe('code execution 20250825 tool', () => {
        it('should stream code execution tool results', async () => {
          prepareChunksFixtureResponse('anthropic-code-execution-20250825.1');

          const result = await model.doStream({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider',
                id: 'anthropic.code_execution_20250825',
                name: 'code_execution',
                args: {},
              },
            ],
          });
          expect(
            await convertReadableStreamToArray(result.stream),
          ).toMatchSnapshot();
        });

        it('should include file id list in code execution tool call result.', async () => {
          prepareChunksFixtureResponse('anthropic-code-execution-20250825.2');

          const result = await model.doStream({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider',
                id: 'anthropic.code_execution_20250825',
                name: 'code_execution',
                args: {},
              },
            ],
          });

          expect(
            await convertReadableStreamToArray(result.stream),
          ).toMatchSnapshot();
        });
      });

      describe('web fetch tool', () => {
        describe('txt response', () => {
          let result: Awaited<ReturnType<LanguageModelV3['doStream']>>;

          beforeEach(async () => {
            prepareChunksFixtureResponse('anthropic-web-fetch-tool.1');

            result = await model.doStream({
              prompt: TEST_PROMPT,
              tools: [
                {
                  type: 'provider',
                  id: 'anthropic.web_fetch_20250910',
                  name: 'web_fetch',
                  args: { maxUses: 1 },
                },
              ],
            });
          });

          it('should stream web search tool results', async () => {
            expect(
              await convertReadableStreamToArray(result.stream),
            ).toMatchSnapshot();
          });
        });
      });

      describe('web search tool', () => {
        let result: Awaited<ReturnType<LanguageModelV3['doStream']>>;

        beforeEach(async () => {
          prepareChunksFixtureResponse('anthropic-web-search-tool.1');

          result = await model.doStream({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider',
                id: 'anthropic.web_search_20250305',
                name: 'web_search',
                args: {
                  maxUses: 1,
                  userLocation: {
                    type: 'approximate',
                    country: 'US',
                  },
                },
              },
            ],
          });
        });

        it('should stream web search tool results', async () => {
          expect(
            await convertReadableStreamToArray(result.stream),
          ).toMatchSnapshot();
        });
      });
    });

    it('should throw an api error when the server is returning a 529 overloaded error', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'error',
        status: 529,
        body: '{"type":"error","error":{"details":null,"type":"overloaded_error","message":"Overloaded"}}',
      };

      try {
        await model.doStream({ prompt: TEST_PROMPT });
        expect.fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(APICallError);
        const apiCallError = error as APICallError;
        expect({
          message: apiCallError.message,
          url: apiCallError.url,
          requestBodyValues: apiCallError.requestBodyValues,
          statusCode: apiCallError.statusCode,
          responseHeaders: apiCallError.responseHeaders,
          responseBody: apiCallError.responseBody,
          isRetryable: apiCallError.isRetryable,
        }).toMatchInlineSnapshot(`
          {
            "isRetryable": true,
            "message": "Overloaded",
            "requestBodyValues": {
              "max_tokens": 4096,
              "messages": [
                {
                  "content": [
                    {
                      "cache_control": undefined,
                      "text": "Hello",
                      "type": "text",
                    },
                  ],
                  "role": "user",
                },
              ],
              "model": "claude-3-haiku-20240307",
              "stop_sequences": undefined,
              "stream": true,
              "system": undefined,
              "temperature": undefined,
              "tool_choice": undefined,
              "tools": undefined,
              "top_k": undefined,
              "top_p": undefined,
            },
            "responseBody": "{"type":"error","error":{"details":null,"type":"overloaded_error","message":"Overloaded"}}",
            "responseHeaders": {
              "content-length": "90",
              "content-type": "text/plain",
            },
            "statusCode": 529,
            "url": "https://api.anthropic.com/v1/messages",
          }
        `);
      }
    });

    it('should throw an api error when the first stream chunk is an overloaded error', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          `event: error\n`,
          `data: {"type":"error","error":{"details":null,"type":"overloaded_error","message":"Overloaded"}}\n`,
          `\n`,
        ],
      };

      try {
        await model.doStream({ prompt: TEST_PROMPT });
        expect.fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(APICallError);
        const apiCallError = error as APICallError;
        expect({
          message: apiCallError.message,
          url: apiCallError.url,
          requestBodyValues: apiCallError.requestBodyValues,
          statusCode: apiCallError.statusCode,
          responseHeaders: apiCallError.responseHeaders,
          responseBody: apiCallError.responseBody,
          isRetryable: apiCallError.isRetryable,
        }).toMatchInlineSnapshot(`
          {
            "isRetryable": true,
            "message": "Overloaded",
            "requestBodyValues": {
              "max_tokens": 4096,
              "messages": [
                {
                  "content": [
                    {
                      "cache_control": undefined,
                      "text": "Hello",
                      "type": "text",
                    },
                  ],
                  "role": "user",
                },
              ],
              "model": "claude-3-haiku-20240307",
              "stop_sequences": undefined,
              "stream": true,
              "system": undefined,
              "temperature": undefined,
              "tool_choice": undefined,
              "tools": undefined,
              "top_k": undefined,
              "top_p": undefined,
            },
            "responseBody": "{"type":"overloaded_error","message":"Overloaded"}",
            "responseHeaders": {
              "cache-control": "no-cache",
              "connection": "keep-alive",
              "content-type": "text/event-stream",
            },
            "statusCode": 529,
            "url": "https://api.anthropic.com/v1/messages",
          }
        `);
      }
    });

    it('should forward overloaded error during streaming', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n`,
          `event: error\n`,
          `data: {"type":"error","error":{"details":null,"type":"overloaded_error","message":"Overloaded"}}\n\n`,
        ],
      };

      const { stream } = await model.doStream({ prompt: TEST_PROMPT });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "msg_01KfpJoAEabmH2iHRRFjQMAG",
            "modelId": "claude-3-haiku-20240307",
            "type": "response-metadata",
          },
          {
            "id": "0",
            "type": "text-start",
          },
          {
            "delta": "Hello",
            "id": "0",
            "type": "text-delta",
          },
          {
            "error": {
              "message": "Overloaded",
              "type": "overloaded_error",
            },
            "type": "error",
          },
        ]
      `);
    });
  });
});
