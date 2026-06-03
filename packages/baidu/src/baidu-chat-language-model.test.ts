import fs from 'node:fs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createBaidu } from './baidu-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const TEXT_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const IMAGE_PROMPT: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [
      { type: 'text', text: 'Describe this image.' },
      {
        type: 'file',
        mediaType: 'image/png',
        data: {
          type: 'data',
          data: 'AAECAw==',
        },
      },
    ],
  },
];

const CHAT_COMPLETIONS_URL = 'https://qianfan.baidubce.com/v2/chat/completions';

const provider = createBaidu({ apiKey: 'test-api-key' });
const model = provider.chatModel('ernie-4.5-turbo-128k');
const server = createTestServer({
  [CHAT_COMPLETIONS_URL]: {},
});

function normalizeGenerateResult(
  result: Awaited<ReturnType<typeof model.doGenerate>>,
) {
  return {
    ...result,
    response:
      result.response == null
        ? result.response
        : {
            ...result.response,
            timestamp: '<timestamp>',
            headers:
              result.response.headers == null
                ? result.response.headers
                : {
                    'content-type': result.response.headers['content-type'],
                  },
            body:
              result.response.body == null ||
              typeof result.response.body !== 'object'
                ? result.response.body
                : {
                    ...result.response.body,
                    created: '<created>',
                  },
          },
  };
}

function normalizeStreamParts(parts: LanguageModelV4StreamPart[]) {
  return parts.map(part =>
    part.type === 'response-metadata'
      ? { ...part, timestamp: '<timestamp>' }
      : part,
  );
}

function prepareJsonFixtureResponse(filename: string) {
  server.urls[CHAT_COMPLETIONS_URL].response = {
    type: 'json-value',
    body: JSON.parse(
      fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

function prepareChunksFixtureResponse(filename: string) {
  const chunks = fs
    .readFileSync(`src/__fixtures__/${filename}.chunks.txt`, 'utf8')
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => `data: ${line}\n\n`);

  chunks.push('data: [DONE]\n\n');

  server.urls[CHAT_COMPLETIONS_URL].response = {
    type: 'stream-chunks',
    chunks,
  };
}

describe('doGenerate', () => {
  describe('text', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('baidu-text');
    });

    it('should extract text content', async () => {
      const result = await model.doGenerate({
        prompt: TEXT_PROMPT,
      });

      expect(normalizeGenerateResult(result)).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "text": "Hello from Qianfan!",
              "type": "text",
            },
          ],
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "providerMetadata": {
            "baidu": {},
          },
          "request": {
            "body": "{"model":"ernie-4.5-turbo-128k","messages":[{"role":"user","content":"Hello"}]}",
          },
          "response": {
            "body": {
              "choices": [
                {
                  "finish_reason": "stop",
                  "index": 0,
                  "message": {
                    "content": "Hello from Qianfan!",
                    "role": "assistant",
                  },
                },
              ],
              "created": "<created>",
              "id": "chatcmpl-baidu-text-1",
              "model": "ernie-4.5-turbo-128k",
              "object": "chat.completion",
              "usage": {
                "completion_tokens": 7,
                "prompt_tokens": 12,
                "prompt_tokens_details": {
                  "cached_tokens": 2,
                },
                "total_tokens": 19,
              },
            },
            "headers": {
              "content-type": "application/json",
            },
            "id": "chatcmpl-baidu-text-1",
            "modelId": "ernie-4.5-turbo-128k",
            "timestamp": "<timestamp>",
          },
          "usage": {
            "inputTokens": {
              "cacheRead": 2,
              "cacheWrite": undefined,
              "noCache": 10,
              "total": 12,
            },
            "outputTokens": {
              "reasoning": 0,
              "text": 7,
              "total": 7,
            },
            "raw": {
              "completion_tokens": 7,
              "prompt_tokens": 12,
              "prompt_tokens_details": {
                "cached_tokens": 2,
              },
              "total_tokens": 19,
            },
          },
          "warnings": [],
        }
      `);
    });

    it('should send the correct plain-text request body', async () => {
      await model.doGenerate({
        prompt: TEXT_PROMPT,
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "Hello",
              "role": "user",
            },
          ],
          "model": "ernie-4.5-turbo-128k",
        }
      `);
    });
  });

  describe('tool call', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('baidu-tool-call');
    });

    it('should extract tool call content', async () => {
      const result = await model.doGenerate({
        prompt: TEXT_PROMPT,
      });

      expect(normalizeGenerateResult(result)).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "input": "{"location":"Beijing"}",
              "toolCallId": "call_baidu_weather_1",
              "toolName": "weather",
              "type": "tool-call",
            },
          ],
          "finishReason": {
            "raw": "tool_calls",
            "unified": "tool-calls",
          },
          "providerMetadata": {
            "baidu": {},
          },
          "request": {
            "body": "{"model":"ernie-4.5-turbo-128k","messages":[{"role":"user","content":"Hello"}]}",
          },
          "response": {
            "body": {
              "choices": [
                {
                  "finish_reason": "tool_calls",
                  "index": 0,
                  "message": {
                    "content": "",
                    "role": "assistant",
                    "tool_calls": [
                      {
                        "function": {
                          "arguments": "{"location":"Beijing"}",
                          "name": "weather",
                        },
                        "id": "call_baidu_weather_1",
                        "type": "function",
                      },
                    ],
                  },
                },
              ],
              "created": "<created>",
              "id": "chatcmpl-baidu-tool-1",
              "model": "ernie-4.5-turbo-128k",
              "object": "chat.completion",
              "usage": {
                "completion_tokens": 10,
                "prompt_tokens": 30,
                "prompt_tokens_details": {
                  "cached_tokens": 0,
                },
                "total_tokens": 40,
              },
            },
            "headers": {
              "content-type": "application/json",
            },
            "id": "chatcmpl-baidu-tool-1",
            "modelId": "ernie-4.5-turbo-128k",
            "timestamp": "<timestamp>",
          },
          "usage": {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": undefined,
              "noCache": 30,
              "total": 30,
            },
            "outputTokens": {
              "reasoning": 0,
              "text": 10,
              "total": 10,
            },
            "raw": {
              "completion_tokens": 10,
              "prompt_tokens": 30,
              "prompt_tokens_details": {
                "cached_tokens": 0,
              },
              "total_tokens": 40,
            },
          },
          "warnings": [],
        }
      `);
    });
  });

  describe('image input', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('baidu-image-input');
    });

    it('should send image_url parts for inline image input', async () => {
      await model.doGenerate({
        prompt: IMAGE_PROMPT,
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": [
                {
                  "text": "Describe this image.",
                  "type": "text",
                },
                {
                  "image_url": {
                    "url": "data:image/png;base64,AAECAw==",
                  },
                  "type": "image_url",
                },
              ],
              "role": "user",
            },
          ],
          "model": "ernie-4.5-turbo-128k",
        }
      `);
    });
  });
});

describe('doStream', () => {
  describe('text', () => {
    beforeEach(() => {
      prepareChunksFixtureResponse('baidu-text');
    });

    it('should stream text content', async () => {
      const result = await model.doStream({
        prompt: TEXT_PROMPT,
      });

      expect(
        normalizeStreamParts(await convertReadableStreamToArray(result.stream)),
      ).toMatchInlineSnapshot(`
          [
            {
              "type": "stream-start",
              "warnings": [],
            },
            {
              "id": "chatcmpl-baidu-text-stream-1",
              "modelId": "ernie-4.5-turbo-128k",
              "timestamp": "<timestamp>",
              "type": "response-metadata",
            },
            {
              "id": "txt-0",
              "type": "text-start",
            },
            {
              "delta": "Hello",
              "id": "txt-0",
              "type": "text-delta",
            },
            {
              "delta": " from",
              "id": "txt-0",
              "type": "text-delta",
            },
            {
              "delta": " Qianfan!",
              "id": "txt-0",
              "type": "text-delta",
            },
            {
              "id": "txt-0",
              "type": "text-end",
            },
            {
              "finishReason": {
                "raw": "stop",
                "unified": "stop",
              },
              "providerMetadata": {
                "baidu": {},
              },
              "type": "finish",
              "usage": {
                "inputTokens": {
                  "cacheRead": 2,
                  "cacheWrite": undefined,
                  "noCache": 10,
                  "total": 12,
                },
                "outputTokens": {
                  "reasoning": 0,
                  "text": 7,
                  "total": 7,
                },
                "raw": {
                  "completion_tokens": 7,
                  "prompt_tokens": 12,
                  "prompt_tokens_details": {
                    "cached_tokens": 2,
                  },
                  "total_tokens": 19,
                },
              },
            },
          ]
        `);
    });
  });

  describe('tool call', () => {
    beforeEach(() => {
      prepareChunksFixtureResponse('baidu-tool-call');
    });

    it('should stream tool call content', async () => {
      const result = await model.doStream({
        prompt: TEXT_PROMPT,
      });

      expect(
        normalizeStreamParts(await convertReadableStreamToArray(result.stream)),
      ).toMatchInlineSnapshot(`
          [
            {
              "type": "stream-start",
              "warnings": [],
            },
            {
              "id": "chatcmpl-baidu-tool-stream-1",
              "modelId": "ernie-4.5-turbo-128k",
              "timestamp": "<timestamp>",
              "type": "response-metadata",
            },
            {
              "id": "call_baidu_weather_stream_1",
              "toolName": "weather",
              "type": "tool-input-start",
            },
            {
              "delta": "{"location":"Bei",
              "id": "call_baidu_weather_stream_1",
              "type": "tool-input-delta",
            },
            {
              "delta": "jing"}",
              "id": "call_baidu_weather_stream_1",
              "type": "tool-input-delta",
            },
            {
              "id": "call_baidu_weather_stream_1",
              "type": "tool-input-end",
            },
            {
              "input": "{"location":"Beijing"}",
              "toolCallId": "call_baidu_weather_stream_1",
              "toolName": "weather",
              "type": "tool-call",
            },
            {
              "finishReason": {
                "raw": "tool_calls",
                "unified": "tool-calls",
              },
              "providerMetadata": {
                "baidu": {},
              },
              "type": "finish",
              "usage": {
                "inputTokens": {
                  "cacheRead": 0,
                  "cacheWrite": undefined,
                  "noCache": 30,
                  "total": 30,
                },
                "outputTokens": {
                  "reasoning": 0,
                  "text": 10,
                  "total": 10,
                },
                "raw": {
                  "completion_tokens": 10,
                  "prompt_tokens": 30,
                  "prompt_tokens_details": {
                    "cached_tokens": 0,
                  },
                  "total_tokens": 40,
                },
              },
            },
          ]
        `);
    });
  });
});
