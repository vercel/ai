import {
  LanguageModelV3FunctionTool,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { OpenAICompatibleResponsesLanguageModel } from './openai-compatible-responses-language-model';

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const TEST_TOOLS: Array<LanguageModelV3FunctionTool> = [
  {
    type: 'function',
    name: 'getWeather',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string' },
        unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
      },
      required: ['location'],
      additionalProperties: false,
    },
  },
];

function createModel(
  modelId: string,
  provider = 'xai',
  baseUrl = 'https://api.x.ai/v1',
) {
  return new OpenAICompatibleResponsesLanguageModel(modelId, {
    provider,
    url: ({ path }) => `${baseUrl}${path}`,
    headers: () => ({ Authorization: `Bearer TEST_API_KEY` }),
  });
}

describe('OpenAICompatibleResponsesLanguageModel', () => {
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
      .filter(line => line.trim())
      .map(line => `data: ${line}\n\n`);
    chunks.push('data: [DONE]\n\n');

    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'stream-chunks',
      chunks,
    };
  }

  describe('doGenerate', () => {
    describe('basic text response', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('basic-text.1');
      });

      it('should generate text', async () => {
        const result = await createModel('grok-3-mini').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": {
                "xai": {
                  "itemId": "msg_29d7c0b4-e047-9016-cc6a-e60b5d9dd0ba_us-east-1",
                },
              },
              "text": "Code flows like a stream,
          Logic weaves through lines of text,
          Debugging, a dream.",
              "type": "text",
            },
          ]
        `);
      });

      it('should extract usage', async () => {
        const result = await createModel('grok-3-mini').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.usage).toMatchInlineSnapshot(`
          {
            "cachedInputTokens": 0,
            "inputTokens": 23,
            "outputTokens": 19,
            "reasoningTokens": 0,
            "totalTokens": 42,
          }
        `);
      });

      it('should extract response id metadata', async () => {
        const result = await createModel('grok-3-mini').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.providerMetadata).toStrictEqual({
          xai: {
            responseId: '29d7c0b4-e047-9016-cc6a-e60b5d9dd0ba_us-east-1',
          },
        });
      });

      it('should send model id, settings, and input', async () => {
        const { warnings } = await createModel('grok-3-mini').doGenerate({
          prompt: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
          temperature: 0.5,
          topP: 0.3,
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
            "model": "grok-3-mini",
            "temperature": 0.5,
            "top_p": 0.3,
          }
        `);

        expect(warnings).toStrictEqual([]);
      });

      it('should extract finish reason', async () => {
        const result = await createModel('grok-3-mini').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.finishReason).toBe('stop');
      });
    });

    describe('tool call', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('tool-call.1');
      });

      it('should generate tool call', async () => {
        const result = await createModel('grok-3-mini').doGenerate({
          prompt: TEST_PROMPT,
          tools: TEST_TOOLS,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "input": "{"location":"San Francisco"}",
              "providerMetadata": {
                "xai": {
                  "itemId": "fc_36f3a0f5-6911-7bde-f6c3-4c53150aad60_us-east-1_0",
                },
              },
              "toolCallId": "call_19494542",
              "toolName": "getWeather",
              "type": "tool-call",
            },
          ]
        `);
      });

      it('should extract finish reason as tool-calls', async () => {
        const result = await createModel('grok-3-mini').doGenerate({
          prompt: TEST_PROMPT,
          tools: TEST_TOOLS,
        });

        expect(result.finishReason).toBe('tool-calls');
      });
    });

    describe('reasoning', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('reasoning.1');
      });

      it('should generate reasoning and message', async () => {
        const result = await createModel('grok-3-mini').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            xai: {
              reasoningEffort: 'medium',
              reasoningSummary: 'auto',
            },
          },
        });

        expect(result.content).toMatchSnapshot();
      });

      it('should extract reasoning tokens from usage', async () => {
        const result = await createModel('grok-3-mini').doGenerate({
          prompt: TEST_PROMPT,
        });

        // Real xAI response has 346 reasoning tokens
        expect(result.usage.reasoningTokens).toBe(346);
      });

      it('should include encrypted content in metadata', async () => {
        const result = await createModel('grok-3-mini').doGenerate({
          prompt: TEST_PROMPT,
        });

        const reasoningContent = result.content.find(
          c => c.type === 'reasoning',
        );
        // Verify exact values from fixture (null encrypted content because store=true)
        expect(reasoningContent?.providerMetadata?.xai).toStrictEqual({
          itemId: 'rs_b50b3034-2737-1dbf-ea5c-27c7d05188ee_us-east-1',
          reasoningEncryptedContent: null,
        });
      });
    });
  });

  describe('doStream', () => {
    describe('basic text stream', () => {
      beforeEach(() => {
        prepareChunksFixtureResponse('basic-text.1');
      });

      it('should stream text deltas', async () => {
        const result = await createModel('grok-3-mini').doStream({
          prompt: TEST_PROMPT,
        });

        const stream = convertReadableStreamToArray(result.stream);

        expect(await stream).toMatchSnapshot();
      });

      it('should extract usage from stream', async () => {
        const result = await createModel('grok-3-mini').doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(result.stream);
        const finishPart = parts.find(p => p.type === 'finish');

        expect(finishPart?.usage).toMatchInlineSnapshot(`
          {
            "cachedInputTokens": 0,
            "inputTokens": 23,
            "outputTokens": 19,
            "reasoningTokens": 0,
            "totalTokens": 42,
          }
        `);
      });
    });

    describe('tool call stream', () => {
      beforeEach(() => {
        prepareChunksFixtureResponse('tool-call.1');
      });

      it('should stream tool call with argument deltas', async () => {
        const result = await createModel('grok-3-mini').doStream({
          prompt: TEST_PROMPT,
          tools: TEST_TOOLS,
        });

        const stream = convertReadableStreamToArray(result.stream);

        expect(await stream).toMatchSnapshot();
      });
    });

    describe('reasoning stream', () => {
      beforeEach(() => {
        prepareChunksFixtureResponse('reasoning.1');
      });

      it('should stream reasoning and text', async () => {
        const result = await createModel('grok-3-mini').doStream({
          prompt: TEST_PROMPT,
          providerOptions: {
            xai: {
              reasoningEffort: 'medium',
              reasoningSummary: 'auto',
            },
          },
        });

        const stream = convertReadableStreamToArray(result.stream);

        expect(await stream).toMatchSnapshot();
      });
    });
  });

  describe('provider metadata', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('basic-text.1');
    });

    it('should use xai provider name in metadata', async () => {
      const result = await createModel('grok-3-mini').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.providerMetadata).toStrictEqual({
        xai: {
          responseId: '29d7c0b4-e047-9016-cc6a-e60b5d9dd0ba_us-east-1',
        },
      });

      const textContent = result.content.find(c => c.type === 'text');
      expect(textContent?.providerMetadata).toStrictEqual({
        xai: {
          itemId: 'msg_29d7c0b4-e047-9016-cc6a-e60b5d9dd0ba_us-east-1',
        },
      });
    });
  });
});
