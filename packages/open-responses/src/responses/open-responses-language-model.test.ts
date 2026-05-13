import type {
  LanguageModelV3GenerateResult,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { OpenResponsesLanguageModel } from './open-responses-language-model';

describe('OpenResponsesLanguageModel', () => {
  const TEST_PROMPT: LanguageModelV3Prompt = [
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  ];

  const URL = 'https://localhost:1234/v1/responses';

  const server = createTestServer({
    [URL]: {},
  });

  function createModel(modelId: string = 'gemma-7b-it') {
    return new OpenResponsesLanguageModel(modelId, {
      provider: 'lmstudio',
      providerOptionsName: 'lmstudio',
      url: URL,
      headers: () => ({}),
      generateId: mockId(),
    });
  }

  describe('doGenerate', () => {
    function prepareJsonFixtureResponse(filename: string) {
      server.urls[URL].response = {
        type: 'json-value',
        body: JSON.parse(
          fs.readFileSync(
            `src/responses/__fixtures__/${filename}.json`,
            'utf8',
          ),
        ),
      };
      return;
    }

    describe('basic generation', () => {
      let result: LanguageModelV3GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
        });
      });

      it('should send correct request body', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });

      it('should produce correct content', async () => {
        expect(result.content).toMatchSnapshot();
      });

      it('should extract usage correctly', async () => {
        expect(result.usage).toMatchSnapshot();
      });
    });

    describe('request parameters', () => {
      let result: LanguageModelV3GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          maxOutputTokens: 100,
          temperature: 0.5,
          topP: 0.9,
          presencePenalty: 0.1,
          frequencyPenalty: 0.2,
          responseFormat: {
            type: 'json',
            name: 'response',
            description: 'Example response schema',
            schema: {
              type: 'object',
              properties: {
                status: { type: 'string' },
              },
              required: ['status'],
            },
          },
        });
      });

      it('should send correct request body', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });
    });

    describe('tools', () => {
      let result: LanguageModelV3GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'get_weather',
              description: 'Get the current weather for a location',
              inputSchema: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city and state',
                  },
                },
                required: ['location'],
              },
            },
            {
              type: 'function',
              name: 'search',
              description: 'Search for information',
              inputSchema: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                  },
                },
                required: ['query'],
              },
              strict: true,
            },
          ],
        });
      });

      it('should send correct request body with tools', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });
    });

    describe('providerOptions reasoning', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('lmstudio-basic.1');
      });

      it('should send reasoning.effort via providerOptions', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            lmstudio: { reasoningEffort: 'high' },
          },
        });

        expect((await server.calls[0].requestBodyJson).reasoning).toStrictEqual(
          { effort: 'high' },
        );
      });

      it('should send reasoning.effort none via providerOptions', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            lmstudio: { reasoningEffort: 'none' },
          },
        });

        expect((await server.calls[0].requestBodyJson).reasoning).toStrictEqual(
          { effort: 'none' },
        );
      });

      it('should send reasoning.summary via providerOptions', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            lmstudio: { reasoningSummary: 'detailed' },
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
                "type": "message",
              },
            ],
            "model": "gemma-7b-it",
            "reasoning": {
              "summary": "detailed",
            },
          }
        `);
      });

      it('should send reasoning.summary concise via providerOptions', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            lmstudio: { reasoningSummary: 'concise' },
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
                "type": "message",
              },
            ],
            "model": "gemma-7b-it",
            "reasoning": {
              "summary": "concise",
            },
          }
        `);
      });

      it('should combine reasoning effort and summary from providerOptions', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            lmstudio: { reasoningEffort: 'high', reasoningSummary: 'auto' },
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
                "type": "message",
              },
            ],
            "model": "gemma-7b-it",
            "reasoning": {
              "effort": "high",
              "summary": "auto",
            },
          }
        `);
      });

      it('should not set reasoning when providerOptions has no reasoning fields', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            lmstudio: {},
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
                "type": "message",
              },
            ],
            "model": "gemma-7b-it",
          }
        `);
      });

      it('should not set reasoning when not specified', async () => {
        await createModel().doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(
          (await server.calls[0].requestBodyJson).reasoning,
        ).toBeUndefined();
      });
    });

    describe('tool call parsing', () => {
      let result: LanguageModelV3GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('lmstudio-tool-call.1');

        result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'weather',
              description: 'Get the weather in a location',
              inputSchema: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The location to get the weather for',
                  },
                },
                required: ['location'],
              },
            },
          ],
          toolChoice: { type: 'required' },
        });
      });

      it('should parse tool call from response', async () => {
        expect(result.content).toMatchSnapshot();
      });

      it('should return tool-calls finish reason', async () => {
        expect(result.finishReason).toStrictEqual({
          unified: 'tool-calls',
          raw: undefined,
        });
      });

      it('should extract usage correctly', async () => {
        expect(result.usage).toMatchSnapshot();
      });
    });

    describe('tool choice', () => {
      const TEST_TOOL = {
        type: 'function' as const,
        name: 'get_weather',
        description: 'Get the current weather',
        inputSchema: {
          type: 'object' as const,
          properties: {
            location: { type: 'string' as const },
          },
          required: ['location'],
        },
      };

      it('should send tool_choice auto', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [TEST_TOOL],
          toolChoice: { type: 'auto' },
        });

        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });

      it('should send tool_choice none', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [TEST_TOOL],
          toolChoice: { type: 'none' },
        });

        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });

      it('should send tool_choice required', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [TEST_TOOL],
          toolChoice: { type: 'required' },
        });

        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });

      it('should send tool_choice with specific tool', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [TEST_TOOL],
          toolChoice: { type: 'tool', toolName: 'get_weather' },
        });

        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });
    });

    describe('system messages', () => {
      it('should send instructions from system message', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        await createModel().doGenerate({
          prompt: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
            },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });

      it('should join multiple system messages with newlines', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        await createModel().doGenerate({
          prompt: [
            {
              role: 'system',
              content: 'You are a helpful assistant.',
            },
            {
              role: 'system',
              content: 'Always be concise.',
            },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });
    });

    describe('multi-turn tool conversation', () => {
      it('should send correct request body with user, assistant tool-call, and tool result', async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        const toolConversationPrompt: LanguageModelV3Prompt = [
          {
            role: 'user',
            content: [{ type: 'text', text: 'What is the weather in Tokyo?' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_weather_123',
                toolName: 'get_weather',
                input: { location: 'Tokyo' },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_weather_123',
                toolName: 'get_weather',
                output: {
                  type: 'json',
                  value: { temperature: 22, condition: 'sunny', humidity: 65 },
                },
              },
            ],
          },
        ];

        await createModel().doGenerate({
          prompt: toolConversationPrompt,
          tools: [
            {
              type: 'function',
              name: 'get_weather',
              description: 'Get the current weather for a location',
              inputSchema: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
                required: ['location'],
              },
            },
          ],
        });

        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });
    });

    describe('pdf input file', () => {
      function getPdfPrompt(): LanguageModelV3Prompt {
        return [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'What text does this PDF contain? Reply with just the text content, nothing else.',
              },
              {
                type: 'file',
                data: {
                  type: 'url',
                  url: new globalThis.URL(
                    'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                  ),
                },
                mediaType: 'application/pdf',
              },
            ],
          },
        ];
      }

      let result: LanguageModelV3GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('openai-pdf-input-file.1');

        result = await createModel('gpt-4.1-nano').doGenerate({
          prompt: getPdfPrompt(),
        });
      });

      it('should send input_file in request body', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "What text does this PDF contain? Reply with just the text content, nothing else.",
                    "type": "input_text",
                  },
                  {
                    "file_url": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
                    "type": "input_file",
                  },
                ],
                "role": "user",
                "type": "message",
              },
            ],
            "model": "gpt-4.1-nano",
          }
        `);
      });

      it('should produce correct content', async () => {
        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "text": "Dummy PDF file",
              "type": "text",
            },
          ]
        `);
      });

      it('should extract usage correctly', async () => {
        expect(result.usage).toMatchInlineSnapshot(`
          {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": undefined,
              "noCache": 44,
              "total": 44,
            },
            "outputTokens": {
              "reasoning": 0,
              "text": 4,
              "total": 4,
            },
            "raw": {
              "input_tokens": 44,
              "input_tokens_details": {
                "cached_tokens": 0,
              },
              "output_tokens": 4,
              "output_tokens_details": {
                "reasoning_tokens": 0,
              },
              "total_tokens": 48,
            },
          }
        `);
      });
    });
  });

  describe('doStream', () => {
    function prepareChunksFixtureResponse(filename: string) {
      const chunks = fs
        .readFileSync(
          `src/responses/__fixtures__/${filename}.chunks.txt`,
          'utf8',
        )
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => `data: ${line}\n\n`);
      chunks.push('data: [DONE]\n\n');

      server.urls[URL].response = {
        type: 'stream-chunks',
        chunks,
      };
    }

    describe('basic generation', () => {
      it('should stream content', async () => {
        prepareChunksFixtureResponse('lmstudio-basic.1');

        const result = await createModel().doStream({
          prompt: TEST_PROMPT,
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });

    describe('reasoning with tool call', () => {
      it('should stream reasoning and tool call content', async () => {
        prepareChunksFixtureResponse('lmstudio-tool-call.2');

        const result = await createModel().doStream({
          prompt: TEST_PROMPT,
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });

    describe('pdf input file', () => {
      it('should stream content from pdf input', async () => {
        prepareChunksFixtureResponse('openai-pdf-input-file.1');

        const result = await createModel('gpt-4.1-nano').doStream({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'What text does this PDF contain?',
                },
                {
                  type: 'file',
                  data: {
                    type: 'url',
                    url: new globalThis.URL(
                      'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                    ),
                  },
                  mediaType: 'application/pdf',
                },
              ],
            },
          ],
        });

        expect(await convertReadableStreamToArray(result.stream))
          .toMatchInlineSnapshot(`
          [
            {
              "type": "stream-start",
              "warnings": [],
            },
            {
              "id": "msg_051ebd7ab60063870069d4fe8c1b7c8194b701e22f1ef094dd",
              "type": "text-start",
            },
            {
              "delta": "Dummy",
              "id": "msg_051ebd7ab60063870069d4fe8c1b7c8194b701e22f1ef094dd",
              "type": "text-delta",
            },
            {
              "delta": " PDF",
              "id": "msg_051ebd7ab60063870069d4fe8c1b7c8194b701e22f1ef094dd",
              "type": "text-delta",
            },
            {
              "delta": " file",
              "id": "msg_051ebd7ab60063870069d4fe8c1b7c8194b701e22f1ef094dd",
              "type": "text-delta",
            },
            {
              "id": "msg_051ebd7ab60063870069d4fe8c1b7c8194b701e22f1ef094dd",
              "type": "text-end",
            },
            {
              "finishReason": {
                "raw": undefined,
                "unified": "stop",
              },
              "providerMetadata": undefined,
              "type": "finish",
              "usage": {
                "inputTokens": {
                  "cacheRead": 0,
                  "cacheWrite": undefined,
                  "noCache": 44,
                  "total": 44,
                },
                "outputTokens": {
                  "reasoning": 0,
                  "text": 4,
                  "total": 4,
                },
                "raw": {
                  "input_tokens": 44,
                  "input_tokens_details": {
                    "cached_tokens": 0,
                  },
                  "output_tokens": 4,
                  "output_tokens_details": {
                    "reasoning_tokens": 0,
                  },
                  "total_tokens": 48,
                },
              },
            },
          ]
        `);
      });
    });
  });
});
