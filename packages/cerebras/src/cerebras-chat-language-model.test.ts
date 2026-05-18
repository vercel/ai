import type {
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { createCerebras } from './cerebras-provider';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];
const JSON_RESPONSE_FORMAT = { type: 'json' as const };

async function convertStreamToArray(
  stream: ReadableStream<LanguageModelV4StreamPart>,
) {
  const reader = stream.getReader();
  const chunks: LanguageModelV4StreamPart[] = [];

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(value);
  }

  return chunks;
}

function createJsonFetchMock({
  content,
  finishReason,
  toolCalls,
}: {
  content: string | null;
  finishReason: string;
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}) {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 1711115037,
        model: 'zai-glm-4.7',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content,
              tool_calls: toolCalls,
            },
            finish_reason: finishReason,
          },
        ],
        usage: {
          prompt_tokens: 4,
          completion_tokens: 30,
          total_tokens: 34,
        },
      }),
      {
        headers: { 'content-type': 'application/json' },
      },
    ),
  );
}

function createStreamFetchMock({ chunks }: { chunks: string[] }) {
  return vi.fn().mockResolvedValue(
    new Response(chunks.map(chunk => `data: ${chunk}\n\n`).join(''), {
      headers: { 'content-type': 'text/event-stream' },
    }),
  );
}

describe('doGenerate', () => {
  describe('finish reason normalization', () => {
    it('normalizes final text responses mislabeled as tool calls', async () => {
      const fetch = createJsonFetchMock({
        content: '{"result":"2026"}',
        finishReason: 'tool_calls',
      });
      const model = createCerebras({ apiKey: 'test-api-key', fetch })(
        'zai-glm-4.7',
      );

      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
        responseFormat: JSON_RESPONSE_FORMAT,
      });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "text": "{"result":"2026"}",
            "type": "text",
          },
        ]
      `);
      expect(result.finishReason).toMatchInlineSnapshot(`
        {
          "raw": "tool_calls",
          "unified": "stop",
        }
      `);
    });

    it('drops stray tool calls when final text is present', async () => {
      const fetch = createJsonFetchMock({
        content: '{"result":"2026"}',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'tool-call-id',
            type: 'function',
            function: { name: 'getNumber', arguments: '{}' },
          },
        ],
      });
      const model = createCerebras({ apiKey: 'test-api-key', fetch })(
        'zai-glm-4.7',
      );

      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
        responseFormat: JSON_RESPONSE_FORMAT,
      });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "text": "{"result":"2026"}",
            "type": "text",
          },
        ]
      `);
      expect(result.finishReason).toMatchInlineSnapshot(`
        {
          "raw": "tool_calls",
          "unified": "stop",
        }
      `);
    });

    it('preserves mixed text and tool calls without structured output', async () => {
      const fetch = createJsonFetchMock({
        content: 'The result is 2026.',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'tool-call-id',
            type: 'function',
            function: { name: 'getNumber', arguments: '{}' },
          },
        ],
      });
      const model = createCerebras({ apiKey: 'test-api-key', fetch })(
        'zai-glm-4.7',
      );

      const result = await model.doGenerate({ prompt: TEST_PROMPT });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "text": "The result is 2026.",
            "type": "text",
          },
          {
            "input": "{}",
            "toolCallId": "tool-call-id",
            "toolName": "getNumber",
            "type": "tool-call",
          },
        ]
      `);
      expect(result.finishReason).toMatchInlineSnapshot(`
        {
          "raw": "tool_calls",
          "unified": "tool-calls",
        }
      `);
    });

    it('preserves real tool-call finish reasons', async () => {
      const fetch = createJsonFetchMock({
        content: null,
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'tool-call-id',
            type: 'function',
            function: { name: 'getNumber', arguments: '{}' },
          },
        ],
      });
      const model = createCerebras({ apiKey: 'test-api-key', fetch })(
        'zai-glm-4.7',
      );

      const result = await model.doGenerate({ prompt: TEST_PROMPT });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "input": "{}",
            "toolCallId": "tool-call-id",
            "toolName": "getNumber",
            "type": "tool-call",
          },
        ]
      `);
      expect(result.finishReason).toMatchInlineSnapshot(`
        {
          "raw": "tool_calls",
          "unified": "tool-calls",
        }
      `);
    });
  });
});

describe('doStream', () => {
  describe('finish reason normalization', () => {
    it('normalizes streamed final text responses mislabeled as tool calls', async () => {
      const fetch = createStreamFetchMock({
        chunks: [
          `{"id":"chatcmpl-test","object":"chat.completion.chunk","created":1711115037,"model":"zai-glm-4.7","choices":[{"index":0,"delta":{"role":"assistant","content":"{\\"result\\":\\"2026\\"}"},"finish_reason":null}]}`,
          `{"id":"chatcmpl-test","object":"chat.completion.chunk","created":1711115037,"model":"zai-glm-4.7","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":4,"completion_tokens":30,"total_tokens":34}}`,
          '[DONE]',
        ],
      });
      const model = createCerebras({ apiKey: 'test-api-key', fetch })(
        'zai-glm-4.7',
      );

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        responseFormat: JSON_RESPONSE_FORMAT,
      });
      const chunks = await convertStreamToArray(stream);

      expect(chunks.at(-1)).toMatchInlineSnapshot(`
        {
          "finishReason": {
            "raw": "tool_calls",
            "unified": "stop",
          },
          "providerMetadata": {
            "cerebras": {},
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": undefined,
              "noCache": 4,
              "total": 4,
            },
            "outputTokens": {
              "reasoning": 0,
              "text": 30,
              "total": 30,
            },
            "raw": {
              "completion_tokens": 30,
              "prompt_tokens": 4,
              "total_tokens": 34,
            },
          },
        }
      `);
    });

    it('drops streamed stray tool calls when final text is present', async () => {
      const fetch = createStreamFetchMock({
        chunks: [
          `{"id":"chatcmpl-test","object":"chat.completion.chunk","created":1711115037,"model":"zai-glm-4.7","choices":[{"index":0,"delta":{"role":"assistant","content":"{\\"result\\":\\"2026\\"}"},"finish_reason":null}]}`,
          `{"id":"chatcmpl-test","object":"chat.completion.chunk","created":1711115037,"model":"zai-glm-4.7","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"tool-call-id","type":"function","function":{"name":"getNumber","arguments":"{}"}}]},"finish_reason":null}]}`,
          `{"id":"chatcmpl-test","object":"chat.completion.chunk","created":1711115037,"model":"zai-glm-4.7","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":4,"completion_tokens":30,"total_tokens":34}}`,
          '[DONE]',
        ],
      });
      const model = createCerebras({ apiKey: 'test-api-key', fetch })(
        'zai-glm-4.7',
      );

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        responseFormat: JSON_RESPONSE_FORMAT,
      });
      const chunks = await convertStreamToArray(stream);

      expect(
        chunks.some(
          chunk =>
            chunk.type === 'tool-input-start' ||
            chunk.type === 'tool-input-delta' ||
            chunk.type === 'tool-input-end' ||
            chunk.type === 'tool-call',
        ),
      ).toBe(false);
      expect(chunks.at(-1)).toMatchInlineSnapshot(`
        {
          "finishReason": {
            "raw": "tool_calls",
            "unified": "stop",
          },
          "providerMetadata": {
            "cerebras": {},
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": undefined,
              "noCache": 4,
              "total": 4,
            },
            "outputTokens": {
              "reasoning": 0,
              "text": 30,
              "total": 30,
            },
            "raw": {
              "completion_tokens": 30,
              "prompt_tokens": 4,
              "total_tokens": 34,
            },
          },
        }
      `);
    });
  });
});
