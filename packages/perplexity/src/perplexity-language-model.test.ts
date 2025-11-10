// TEST FILE DOES NOT USE THE PROVIDER `createPerplexity`

import { describe, it, expect } from 'vitest';
import { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { z } from 'zod/v4';
import {
  perplexityImageSchema,
  PerplexityLanguageModel,
} from './perplexity-language-model';

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

describe('PerplexityLanguageModel', () => {
  describe('doGenerate', () => {
    const modelId = 'perplexity-001';

    const perplexityModel = new PerplexityLanguageModel(modelId, {
      baseURL: 'https://api.perplexity.ai',
      headers: () => ({
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      }),
      generateId: mockId(),
    });

    // Create a unified test server to handle JSON responses.
    const jsonServer = createTestServer({
      'https://api.perplexity.ai/chat/completions': {
        response: {
          type: 'json-value',
          headers: { 'content-type': 'application/json' },
          body: {},
        },
      },
    });

    // Helper to prepare the JSON response for doGenerate.
    function prepareJsonResponse({
      content = '',
      usage = { prompt_tokens: 10, completion_tokens: 20 },
      id = 'test-id',
      created = 1680000000,
      model = modelId,
      headers = {},
      citations = [],
      images,
    }: {
      content?: string;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        citation_tokens?: number;
        num_search_queries?: number;
      };
      id?: string;
      created?: number;
      model?: string;
      headers?: Record<string, string>;
      citations?: string[];
      images?: z.infer<typeof perplexityImageSchema>[];
    } = {}) {
      jsonServer.urls['https://api.perplexity.ai/chat/completions'].response = {
        type: 'json-value',
        headers: { 'content-type': 'application/json', ...headers },
        body: {
          id,
          created,
          model,
          choices: [
            {
              message: {
                role: 'assistant',
                content,
              },
              finish_reason: 'stop',
            },
          ],
          citations,
          images,
          usage,
        },
      };
    }

    it('should extract content correctly', async () => {
      prepareJsonResponse({ content: 'Hello, World!' });

      const result = await perplexityModel.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "text": "Hello, World!",
            "type": "text",
          },
        ]
      `);

      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });

      expect({
        id: result.response?.id,
        timestamp: result.response?.timestamp,
        modelId: result.response?.modelId,
      }).toStrictEqual({
        id: 'test-id',
        timestamp: new Date(1680000000 * 1000),
        modelId,
      });
    });

    it('should send the correct request body', async () => {
      prepareJsonResponse({ content: '' });
      await perplexityModel.doGenerate({
        prompt: TEST_PROMPT,
      });
      expect(await jsonServer.calls[0].requestBodyJson).toEqual({
        model: modelId,
        messages: [{ role: 'user', content: 'Hello' }],
      });
    });

    it('should pass through perplexity provider options', async () => {
      prepareJsonResponse({ content: '' });
      await perplexityModel.doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          perplexity: {
            search_recency_filter: 'month',
            return_images: true,
          },
        },
      });

      expect(await jsonServer.calls[0].requestBodyJson).toEqual({
        model: modelId,
        messages: [{ role: 'user', content: 'Hello' }],
        search_recency_filter: 'month',
        return_images: true,
      });
    });

    it('should handle PDF files with base64 encoding', async () => {
      const mockPdfData = 'mock-pdf-data';
      const prompt: LanguageModelV3Prompt = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this PDF' },
            {
              type: 'file',
              mediaType: 'application/pdf',
              data: mockPdfData,
              filename: 'test.pdf',
            },
          ],
        },
      ];

      prepareJsonResponse({
        content: 'This is an analysis of the PDF',
      });

      const result = await perplexityModel.doGenerate({ prompt });

      // Verify the request contains the correct PDF format
      const requestBody =
        await jsonServer.calls[jsonServer.calls.length - 1].requestBodyJson;
      expect(requestBody.messages[0].content).toEqual([
        {
          type: 'text',
          text: 'Analyze this PDF',
        },
        {
          type: 'file_url',
          file_url: {
            url: expect.stringContaining(mockPdfData),
          },
          file_name: 'test.pdf',
        },
      ]);

      // Verify the response is processed correctly
      expect(result.content).toEqual([
        {
          type: 'text',
          text: 'This is an analysis of the PDF',
        },
      ]);
    });

    it('should handle PDF files with URLs', async () => {
      const pdfUrl = 'https://example.com/test.pdf';
      const prompt: LanguageModelV3Prompt = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this PDF' },
            {
              type: 'file',
              mediaType: 'application/pdf',
              data: new URL(pdfUrl),
              filename: 'test.pdf',
            },
          ],
        },
      ];

      prepareJsonResponse({
        content: 'This is an analysis of the PDF from URL',
      });

      const result = await perplexityModel.doGenerate({ prompt });

      // Verify the request contains the correct PDF URL format
      const requestBody =
        await jsonServer.calls[jsonServer.calls.length - 1].requestBodyJson;
      expect(requestBody.messages[0].content).toEqual([
        {
          type: 'text',
          text: 'Analyze this PDF',
        },
        {
          type: 'file_url',
          file_url: {
            url: pdfUrl,
          },
          file_name: 'test.pdf',
        },
      ]);

      // Verify the response is processed correctly
      expect(result.content).toEqual([
        {
          type: 'text',
          text: 'This is an analysis of the PDF from URL',
        },
      ]);
    });

    it('should extract citations as sources', async () => {
      prepareJsonResponse({
        citations: ['http://example.com/123', 'https://example.com/456'],
      });

      const result = await perplexityModel.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "id": "id-0",
            "sourceType": "url",
            "type": "source",
            "url": "http://example.com/123",
          },
          {
            "id": "id-1",
            "sourceType": "url",
            "type": "source",
            "url": "https://example.com/456",
          },
        ]
      `);
    });

    it('should extract images', async () => {
      prepareJsonResponse({
        images: [
          {
            image_url: 'https://example.com/image.jpg',
            origin_url: 'https://example.com/image.jpg',
            height: 100,
            width: 100,
          },
        ],
      });

      const result = await perplexityModel.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.providerMetadata).toStrictEqual({
        perplexity: {
          images: [
            {
              imageUrl: 'https://example.com/image.jpg',
              originUrl: 'https://example.com/image.jpg',
              height: 100,
              width: 100,
            },
          ],
          usage: {
            citationTokens: null,
            numSearchQueries: null,
          },
        },
      });
    });

    it('should extract usage', async () => {
      prepareJsonResponse({
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          citation_tokens: 30,
          num_search_queries: 40,
        },
      });

      const result = await perplexityModel.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });

      expect(result.providerMetadata).toEqual({
        perplexity: {
          images: null,
          usage: {
            citationTokens: 30,
            numSearchQueries: 40,
          },
        },
      });
    });

    it('should pass headers from provider and request', async () => {
      prepareJsonResponse({ content: '' });
      const lmWithCustomHeaders = new PerplexityLanguageModel(modelId, {
        baseURL: 'https://api.perplexity.ai',
        headers: () => ({
          authorization: 'Bearer test-api-key',
          'Custom-Provider-Header': 'provider-header-value',
        }),
        generateId: mockId(),
      });

      await lmWithCustomHeaders.doGenerate({
        prompt: TEST_PROMPT,
        headers: { 'Custom-Request-Header': 'request-header-value' },
      });

      expect(jsonServer.calls[0].requestHeaders).toEqual({
        authorization: 'Bearer test-api-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });
  });

  describe('doStream', () => {
    const modelId = 'perplexity-001';

    const streamServer = createTestServer({
      'https://api.perplexity.ai/chat/completions': {
        response: {
          type: 'stream-chunks',
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          },
          chunks: [],
        },
      },
    });

    const perplexityLM = new PerplexityLanguageModel(modelId, {
      baseURL: 'https://api.perplexity.ai',
      headers: () => ({ authorization: 'Bearer test-token' }),
      generateId: mockId(),
    });

    // Helper to prepare the stream response.
    function prepareStreamResponse({
      contents,
      usage = { prompt_tokens: 10, completion_tokens: 20 },
      citations = [],
      images,
    }: {
      contents: string[];
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        citation_tokens?: number;
        num_search_queries?: number;
      };
      citations?: string[];
      images?: z.infer<typeof perplexityImageSchema>[];
    }) {
      const baseChunk = (
        content: string,
        finish_reason: string | null = null,
        includeUsage = false,
      ) => {
        const chunkObj: any = {
          id: 'stream-id',
          created: 1680003600,
          model: modelId,
          images,
          citations,
          choices: [
            {
              delta: { role: 'assistant', content },
              finish_reason,
            },
          ],
        };
        if (includeUsage) {
          chunkObj.usage = usage;
        }
        return `data: ${JSON.stringify(chunkObj)}\n\n`;
      };

      streamServer.urls['https://api.perplexity.ai/chat/completions'].response =
        {
          type: 'stream-chunks',
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          },
          chunks: [
            ...contents.slice(0, -1).map(text => baseChunk(text)),
            // Final chunk: include finish_reason and usage.
            baseChunk(contents[contents.length - 1], 'stop', true),
            'data: [DONE]\n\n',
          ],
        };
    }

    it('should stream text deltas', async () => {
      prepareStreamResponse({ contents: ['Hello', ', ', 'World!'] });

      const { stream } = await perplexityLM.doStream({
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
            "id": "stream-id",
            "modelId": "perplexity-001",
            "timestamp": 2023-03-28T11:40:00.000Z,
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
              "perplexity": {
                "images": null,
                "usage": {
                  "citationTokens": null,
                  "numSearchQueries": null,
                },
              },
            },
            "type": "finish",
            "usage": {
              "inputTokens": 10,
              "outputTokens": 20,
              "totalTokens": undefined,
            },
          },
        ]
      `);
    });

    it('should stream sources', async () => {
      prepareStreamResponse({
        contents: ['Hello', ', ', 'World!'],
        citations: ['http://example.com/123', 'https://example.com/456'],
      });

      const { stream } = await perplexityLM.doStream({
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
            "id": "stream-id",
            "modelId": "perplexity-001",
            "timestamp": 2023-03-28T11:40:00.000Z,
            "type": "response-metadata",
          },
          {
            "id": "id-0",
            "sourceType": "url",
            "type": "source",
            "url": "http://example.com/123",
          },
          {
            "id": "id-1",
            "sourceType": "url",
            "type": "source",
            "url": "https://example.com/456",
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
              "perplexity": {
                "images": null,
                "usage": {
                  "citationTokens": null,
                  "numSearchQueries": null,
                },
              },
            },
            "type": "finish",
            "usage": {
              "inputTokens": 10,
              "outputTokens": 20,
              "totalTokens": undefined,
            },
          },
        ]
      `);
    });

    it('should send the correct streaming request body', async () => {
      prepareStreamResponse({ contents: [] });

      await perplexityLM.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(await streamServer.calls[0].requestBodyJson).toEqual({
        model: modelId,
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      });
    });

    it('should send usage', async () => {
      prepareStreamResponse({
        contents: ['Hello', ', ', 'World!'],
        images: [
          {
            image_url: 'https://example.com/image.jpg',
            origin_url: 'https://example.com/image.jpg',
            height: 100,
            width: 100,
          },
        ],
      });
      const { stream } = await perplexityLM.doStream({
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
            "id": "stream-id",
            "modelId": "perplexity-001",
            "timestamp": 2023-03-28T11:40:00.000Z,
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
              "perplexity": {
                "images": [
                  {
                    "height": 100,
                    "imageUrl": "https://example.com/image.jpg",
                    "originUrl": "https://example.com/image.jpg",
                    "width": 100,
                  },
                ],
                "usage": {
                  "citationTokens": null,
                  "numSearchQueries": null,
                },
              },
            },
            "type": "finish",
            "usage": {
              "inputTokens": 10,
              "outputTokens": 20,
              "totalTokens": undefined,
            },
          },
        ]
      `);
    });

    it('should send images', async () => {
      prepareStreamResponse({
        contents: ['Hello', ', ', 'World!'],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 21,
          citation_tokens: 30,
          num_search_queries: 40,
        },
      });

      const { stream } = await perplexityLM.doStream({
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
            "id": "stream-id",
            "modelId": "perplexity-001",
            "timestamp": 2023-03-28T11:40:00.000Z,
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
              "perplexity": {
                "images": null,
                "usage": {
                  "citationTokens": 30,
                  "numSearchQueries": 40,
                },
              },
            },
            "type": "finish",
            "usage": {
              "inputTokens": 11,
              "outputTokens": 21,
              "totalTokens": undefined,
            },
          },
        ]
      `);
    });

    it('should pass headers', async () => {
      prepareStreamResponse({ contents: [] });
      const lmWithCustomHeaders = new PerplexityLanguageModel(modelId, {
        baseURL: 'https://api.perplexity.ai',
        headers: () => ({
          authorization: 'Bearer test-api-key',
          'Custom-Provider-Header': 'provider-header-value',
        }),
        generateId: mockId(),
      });

      await lmWithCustomHeaders.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
        headers: { 'Custom-Request-Header': 'request-header-value' },
      });

      expect(streamServer.calls[0].requestHeaders).toEqual({
        authorization: 'Bearer test-api-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should stream raw chunks when includeRawChunks is true', async () => {
      streamServer.urls['https://api.perplexity.ai/chat/completions'].response =
        {
          type: 'stream-chunks',
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          },
          chunks: [
            `data: {"id":"ppl-123","object":"chat.completion.chunk","created":1234567890,"model":"perplexity-001","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}],"citations":["https://example.com"]}\n\n`,
            `data: {"id":"ppl-456","object":"chat.completion.chunk","created":1234567890,"model":"perplexity-001","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n`,
            `data: {"id":"ppl-789","object":"chat.completion.chunk","created":1234567890,"model":"perplexity-001","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15,"citation_tokens":2,"num_search_queries":1}}\n\n`,
            'data: [DONE]\n\n',
          ],
        };

      const { stream } = await perplexityLM.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: true,
      });

      const chunks = await convertReadableStreamToArray(stream);

      expect(chunks).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "rawValue": {
              "choices": [
                {
                  "delta": {
                    "content": "Hello",
                    "role": "assistant",
                  },
                  "finish_reason": null,
                  "index": 0,
                },
              ],
              "citations": [
                "https://example.com",
              ],
              "created": 1234567890,
              "id": "ppl-123",
              "model": "perplexity-001",
              "object": "chat.completion.chunk",
            },
            "type": "raw",
          },
          {
            "id": "ppl-123",
            "modelId": "perplexity-001",
            "timestamp": 2009-02-13T23:31:30.000Z,
            "type": "response-metadata",
          },
          {
            "id": "id-2",
            "sourceType": "url",
            "type": "source",
            "url": "https://example.com",
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
            "rawValue": {
              "choices": [
                {
                  "delta": {
                    "content": " world",
                  },
                  "finish_reason": null,
                  "index": 0,
                },
              ],
              "created": 1234567890,
              "id": "ppl-456",
              "model": "perplexity-001",
              "object": "chat.completion.chunk",
            },
            "type": "raw",
          },
          {
            "error": [AI_TypeValidationError: Type validation failed: Value: {"id":"ppl-456","object":"chat.completion.chunk","created":1234567890,"model":"perplexity-001","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}.
        Error message: [
          {
            "code": "invalid_value",
            "values": [
              "assistant"
            ],
            "path": [
              "choices",
              0,
              "delta",
              "role"
            ],
            "message": "Invalid input: expected \\"assistant\\""
          }
        ]],
            "type": "error",
          },
          {
            "rawValue": {
              "choices": [
                {
                  "delta": {},
                  "finish_reason": "stop",
                  "index": 0,
                },
              ],
              "created": 1234567890,
              "id": "ppl-789",
              "model": "perplexity-001",
              "object": "chat.completion.chunk",
              "usage": {
                "citation_tokens": 2,
                "completion_tokens": 5,
                "num_search_queries": 1,
                "prompt_tokens": 10,
                "total_tokens": 15,
              },
            },
            "type": "raw",
          },
          {
            "error": [AI_TypeValidationError: Type validation failed: Value: {"id":"ppl-789","object":"chat.completion.chunk","created":1234567890,"model":"perplexity-001","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15,"citation_tokens":2,"num_search_queries":1}}.
        Error message: [
          {
            "code": "invalid_value",
            "values": [
              "assistant"
            ],
            "path": [
              "choices",
              0,
              "delta",
              "role"
            ],
            "message": "Invalid input: expected \\"assistant\\""
          },
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "choices",
              0,
              "delta",
              "content"
            ],
            "message": "Invalid input: expected string, received undefined"
          }
        ]],
            "type": "error",
          },
          {
            "id": "0",
            "type": "text-end",
          },
          {
            "finishReason": "unknown",
            "providerMetadata": {
              "perplexity": {
                "images": null,
                "usage": {
                  "citationTokens": null,
                  "numSearchQueries": null,
                },
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
});
