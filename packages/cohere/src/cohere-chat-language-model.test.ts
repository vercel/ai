import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import {
  convertReadableStreamToArray,
  isNodeVersion,
} from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { createCohere } from './cohere-provider';
import { beforeEach, describe, it, expect, vi } from 'vitest';

const TEST_PROMPT: LanguageModelV3Prompt = [
  {
    role: 'system',
    content: 'you are a friendly bot!',
  },
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createCohere({
  apiKey: 'test-api-key',
});
const model = provider('command-r-plus');

const server = createTestServer({
  'https://api.cohere.com/v2/chat': {},
});

function prepareJsonFixtureResponse(
  filename: string,
  headers?: Record<string, string>,
) {
  server.urls['https://api.cohere.com/v2/chat'].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

function prepareJsonValueResponse(body: Record<string, unknown>) {
  server.urls['https://api.cohere.com/v2/chat'].response = {
    type: 'json-value',
    body,
  };
}

function prepareChunksFixtureResponse(
  filename: string,
  headers?: Record<string, string>,
) {
  const chunks = fs
    .readFileSync(`src/__fixtures__/${filename}.chunks.txt`, 'utf8')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      const parsed = JSON.parse(line);
      return `event: ${parsed.type}\ndata: ${line}\n\n`;
    });

  server.urls['https://api.cohere.com/v2/chat'].response = {
    type: 'stream-chunks',
    headers,
    chunks,
  };
}

function prepareChunkLinesResponse(chunks: Array<Record<string, unknown>>) {
  server.urls['https://api.cohere.com/v2/chat'].response = {
    type: 'stream-chunks',
    chunks: chunks.map(chunk => {
      const line = JSON.stringify(chunk);
      return `event: ${chunk.type}\ndata: ${line}\n\n`;
    }),
  };
}

describe('doGenerate', () => {
  describe('text', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('cohere-text');
    });

    it('should extract text response', async () => {
      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result).toMatchSnapshot();
    });
  });

  describe('response id', () => {
    it('should use the id from the response', async () => {
      prepareJsonFixtureResponse('cohere-text');

      const { response } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(response?.id).toBe('e7592632-1e3d-424f-b129-bd5f9f980f7b');
    });

    it('should prefer id over generation_id', async () => {
      prepareJsonValueResponse({
        id: 'response-id',
        generation_id: 'legacy-generation-id',
        message: { role: 'assistant', content: [] },
        finish_reason: 'COMPLETE',
      });

      const { response } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(response?.id).toBe('response-id');
    });

    it('should fall back to generation_id', async () => {
      prepareJsonValueResponse({
        generation_id: 'legacy-generation-id',
        message: { role: 'assistant', content: [] },
        finish_reason: 'COMPLETE',
      });

      const { response } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(response?.id).toBe('legacy-generation-id');
    });

    it('should leave the id undefined when the response has neither', async () => {
      prepareJsonValueResponse({
        message: { role: 'assistant', content: [] },
        finish_reason: 'COMPLETE',
      });

      const { response } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(response?.id).toBeUndefined();
    });
  });

  describe('max tokens', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('cohere-max-tokens');
    });

    it('should map MAX_TOKENS finish reason to length', async () => {
      const { finishReason } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(finishReason).toMatchInlineSnapshot(`
        {
          "raw": "MAX_TOKENS",
          "unified": "length",
        }
      `);
    });
  });

  describe('tool call', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('cohere-tool-call');
    });

    it('should extract tool calls', async () => {
      const result = await model.doGenerate({
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

      expect(result).toMatchSnapshot();
    });
  });

  describe('null tool call arguments', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('cohere-null-args');
    });

    it('should handle string "null" tool call arguments', async () => {
      const { content } = await model.doGenerate({
        tools: [
          {
            type: 'function',
            name: 'currentTime',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'What is the current time?' }],
          },
        ],
      });

      expect(content).toMatchSnapshot();
    });
  });

  describe('reasoning', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('cohere-reasoning');
    });

    it('should extract reasoning from response', async () => {
      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result).toMatchSnapshot();
    });
  });

  describe('citations', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('cohere-citations');
    });

    it('should extract citations from response', async () => {
      const mockGenerateId = vi.fn().mockReturnValue('test-citation-id');
      const testProvider = createCohere({
        apiKey: 'test-api-key',
        generateId: mockGenerateId,
      });
      const testModel = testProvider('command-r-plus');

      const result = await testModel.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What are AI benefits?' },
              {
                type: 'file',
                data: 'AI provides automation and efficiency.',
                mediaType: 'text/plain',
                filename: 'ai-benefits.txt',
              },
            ],
          },
        ],
      });

      expect(result).toMatchSnapshot();
    });

    it('should map document citations without title and with missing fields', async () => {
      const testProvider = createCohere({
        apiKey: 'test-api-key',
        generateId: () => 'test-citation-id',
      });

      server.urls['https://api.cohere.com/v2/chat'].response = {
        type: 'json-value',
        body: {
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Automation of tasks' }],
            citations: [
              {
                text: 'Automation of tasks',
                sources: [
                  {
                    type: 'document',
                    id: 'doc:0',
                    document: {
                      id: 'doc:0',
                      text: 'AI provides automation of tasks.',
                      extra_field: 'passed through',
                    },
                  },
                ],
                type: 'TEXT_CONTENT',
              },
            ],
          },
          finish_reason: 'COMPLETE',
          usage: {
            tokens: { input_tokens: 10, output_tokens: 5 },
          },
        },
      };

      const result = await testProvider('command-r-plus').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toStrictEqual([
        { type: 'text', text: 'Automation of tasks' },
        {
          type: 'source',
          sourceType: 'document',
          id: 'test-citation-id',
          mediaType: 'text/plain',
          title: 'Document',
          providerMetadata: {
            cohere: {
              text: 'Automation of tasks',
              sources: [
                {
                  type: 'document',
                  id: 'doc:0',
                  document: {
                    id: 'doc:0',
                    text: 'AI provides automation of tasks.',
                    extra_field: 'passed through',
                  },
                },
              ],
              citationType: 'TEXT_CONTENT',
            },
          },
        },
      ]);
    });

    it('should not emit sources for tool-sourced citations', async () => {
      server.urls['https://api.cohere.com/v2/chat'].response = {
        type: 'json-value',
        body: {
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'It is sunny in Berlin.' }],
            citations: [
              {
                start: 6,
                end: 11,
                text: 'sunny',
                sources: [
                  {
                    type: 'tool',
                    id: 'getWeather:0',
                    tool_output: { city: 'Berlin', condition: 'sunny' },
                  },
                ],
                type: 'TEXT_CONTENT',
              },
              {
                start: 0,
                end: 5,
                text: 'It is',
                sources: null,
              },
            ],
          },
          finish_reason: 'COMPLETE',
          usage: {
            tokens: { input_tokens: 10, output_tokens: 5 },
          },
        },
      };

      const result = await model.doGenerate({ prompt: TEST_PROMPT });

      expect(result.content).toStrictEqual([
        { type: 'text', text: 'It is sunny in Berlin.' },
      ]);
    });

    it('should extract text documents and send to API', async () => {
      await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What does this say?' },
              {
                type: 'file',
                data: 'This is a test document.',
                mediaType: 'text/plain',
                filename: 'test.txt',
              },
            ],
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "documents": [
            {
              "data": {
                "text": "This is a test document.",
                "title": "test.txt",
              },
            },
          ],
          "messages": [
            {
              "content": "What does this say?",
              "role": "user",
            },
          ],
          "model": "command-r-plus",
        }
      `);
    });

    it('should extract multiple text documents', async () => {
      await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What do these documents say?' },
              {
                type: 'file',
                data: Buffer.from('First document content'),
                mediaType: 'text/plain',
                filename: 'doc1.txt',
              },
              {
                type: 'file',
                data: Buffer.from('Second document content'),
                mediaType: 'text/plain',
                filename: 'doc2.txt',
              },
            ],
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "documents": [
            {
              "data": {
                "text": "First document content",
                "title": "doc1.txt",
              },
            },
            {
              "data": {
                "text": "Second document content",
                "title": "doc2.txt",
              },
            },
          ],
          "messages": [
            {
              "content": "What do these documents say?",
              "role": "user",
            },
          ],
          "model": "command-r-plus",
        }
      `);
    });

    it('should support JSON files', async () => {
      await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this JSON?' },
              {
                type: 'file',
                data: Buffer.from('{"key": "value"}'),
                mediaType: 'application/json',
                filename: 'data.json',
              },
            ],
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "documents": [
            {
              "data": {
                "text": "{"key": "value"}",
                "title": "data.json",
              },
            },
          ],
          "messages": [
            {
              "content": "What is in this JSON?",
              "role": "user",
            },
          ],
          "model": "command-r-plus",
        }
      `);
    });

    it('should throw error for unsupported file types', async () => {
      await expect(
        model.doGenerate({
          prompt: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'What is this?' },
                {
                  type: 'file',
                  data: Buffer.from('PDF binary data'),
                  mediaType: 'application/pdf',
                  filename: 'document.pdf',
                },
              ],
            },
          ],
        }),
      ).rejects.toThrow(
        "Media type 'application/pdf' is not supported. Supported media types are: text/* and application/json.",
      );
    });

    it('should successfully process supported text media types', async () => {
      await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is this?' },
              {
                type: 'file',
                data: Buffer.from('This is plain text content'),
                mediaType: 'text/plain',
                filename: 'text.txt',
              },
              {
                type: 'file',
                data: Buffer.from('# Markdown Header\nContent'),
                mediaType: 'text/markdown',
                filename: 'doc.md',
              },
            ],
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        documents: [
          {
            data: {
              text: 'This is plain text content',
              title: 'text.txt',
            },
          },
          {
            data: {
              text: '# Markdown Header\nContent',
              title: 'doc.md',
            },
          },
        ],
      });
    });

    it('should not include documents parameter when no files present', async () => {
      await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.documents).toBeUndefined();
    });
  });

  describe('usage', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('cohere-text');
    });

    it('should return undefined token counts when usage is absent', async () => {
      server.urls['https://api.cohere.com/v2/chat'].response = {
        type: 'json-value',
        body: {
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello' }],
          },
          finish_reason: 'COMPLETE',
        },
      };

      const { usage } = await model.doGenerate({ prompt: TEST_PROMPT });

      expect(usage).toStrictEqual({
        inputTokens: {
          total: undefined,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: undefined,
          text: undefined,
          reasoning: undefined,
        },
        raw: undefined,
      });
    });

    it('should return undefined token counts for an empty usage object', async () => {
      server.urls['https://api.cohere.com/v2/chat'].response = {
        type: 'json-value',
        body: {
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello' }],
          },
          finish_reason: 'COMPLETE',
          usage: {},
        },
      };

      const { usage } = await model.doGenerate({ prompt: TEST_PROMPT });

      expect(usage).toStrictEqual({
        inputTokens: {
          total: undefined,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: undefined,
          text: undefined,
          reasoning: undefined,
        },
        raw: {},
      });
    });

    it('should not treat billed units as token counts', async () => {
      server.urls['https://api.cohere.com/v2/chat'].response = {
        type: 'json-value',
        body: {
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello' }],
          },
          finish_reason: 'COMPLETE',
          usage: {
            billed_units: { input_tokens: 12, output_tokens: 7 },
            cached_tokens: 448,
          },
        },
      };

      const { usage } = await model.doGenerate({ prompt: TEST_PROMPT });

      // billed units measure something else than tokens, so no token counts are
      // reported. Cached tokens are not reported either on this branch.
      expect(usage).toStrictEqual({
        inputTokens: {
          total: undefined,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: undefined,
          text: undefined,
          reasoning: undefined,
        },
        raw: {
          billed_units: { input_tokens: 12, output_tokens: 7 },
          cached_tokens: 448,
        },
      });
    });
  });

  describe('request', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('cohere-text');
    });

    it('should pass model and messages', async () => {
      await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "you are a friendly bot!",
              "role": "system",
            },
            {
              "content": "Hello",
              "role": "user",
            },
          ],
          "model": "command-r-plus",
        }
      `);
    });

    it('should pass tools', async () => {
      await model.doGenerate({
        toolChoice: { type: 'none' },
        tools: [
          {
            type: 'function',
            name: 'test-tool',
            inputSchema: {
              type: 'object',
              properties: {
                value: { type: 'string' },
              },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "you are a friendly bot!",
              "role": "system",
            },
            {
              "content": "Hello",
              "role": "user",
            },
          ],
          "model": "command-r-plus",
          "tool_choice": "NONE",
          "tools": [
            {
              "function": {
                "name": "test-tool",
                "parameters": {
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
              },
              "type": "function",
            },
          ],
        }
      `);
    });

    it('should pass headers', async () => {
      const provider = createCohere({
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider('command-r-plus').doGenerate({
        prompt: TEST_PROMPT,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
        {
          "authorization": "Bearer test-api-key",
          "content-type": "application/json",
          "custom-provider-header": "provider-header-value",
          "custom-request-header": "request-header-value",
        }
      `);
    });

    it('should pass response format', async () => {
      await model.doGenerate({
        prompt: TEST_PROMPT,
        responseFormat: {
          type: 'json',
          schema: {
            type: 'object',
            properties: {
              text: { type: 'string' },
            },
            required: ['text'],
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "you are a friendly bot!",
              "role": "system",
            },
            {
              "content": "Hello",
              "role": "user",
            },
          ],
          "model": "command-r-plus",
          "response_format": {
            "json_schema": {
              "properties": {
                "text": {
                  "type": "string",
                },
              },
              "required": [
                "text",
              ],
              "type": "object",
            },
            "type": "json_object",
          },
        }
      `);
    });

    it('should send request body', async () => {
      const { request } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(request).toMatchInlineSnapshot(`
        {
          "body": {
            "frequency_penalty": undefined,
            "k": undefined,
            "max_tokens": undefined,
            "messages": [
              {
                "content": "you are a friendly bot!",
                "role": "system",
              },
              {
                "content": "Hello",
                "role": "user",
              },
            ],
            "model": "command-r-plus",
            "p": undefined,
            "presence_penalty": undefined,
            "response_format": undefined,
            "seed": undefined,
            "stop_sequences": undefined,
            "temperature": undefined,
            "tool_choice": undefined,
            "tools": undefined,
          },
        }
      `);
    });

    it('should expose the raw response headers', async () => {
      prepareJsonFixtureResponse('cohere-text', {
        'test-header': 'test-value',
      });

      const { response } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(response?.headers).toMatchInlineSnapshot(`
        {
          "content-length": "304",
          "content-type": "application/json",
          "test-header": "test-value",
        }
      `);
    });

    it('should extract usage', async () => {
      prepareJsonFixtureResponse('cohere-text');

      const { usage } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(usage).toMatchInlineSnapshot(`
        {
          "inputTokens": {
            "cacheRead": undefined,
            "cacheWrite": undefined,
            "noCache": 507,
            "total": 507,
          },
          "outputTokens": {
            "reasoning": undefined,
            "text": 10,
            "total": 10,
          },
          "raw": {
            "billed_units": {
              "input_tokens": 12,
              "output_tokens": 7,
            },
            "cached_tokens": 448,
            "tokens": {
              "input_tokens": 507,
              "output_tokens": 10,
            },
          },
        }
      `);
    });

    it('should preserve extra top-level and nested fields in raw usage', async () => {
      server.urls['https://api.cohere.com/v2/chat'].response = {
        type: 'json-value',
        body: {
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello' }],
          },
          finish_reason: 'COMPLETE',
          usage: {
            billed_units: {
              input_tokens: 12,
              output_tokens: 7,
              billing_tier: 'standard',
            },
            tokens: {
              input_tokens: 507,
              output_tokens: 10,
              tokenizer: 'command',
            },
            cached_tokens: 448,
            provider_usage_id: 'usage-123',
          },
        },
      };

      const { usage } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(usage).toStrictEqual({
        inputTokens: {
          total: 507,
          noCache: 507,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 10,
          text: 10,
          reasoning: undefined,
        },
        raw: {
          billed_units: {
            input_tokens: 12,
            output_tokens: 7,
            billing_tier: 'standard',
          },
          tokens: {
            input_tokens: 507,
            output_tokens: 10,
            tokenizer: 'command',
          },
          cached_tokens: 448,
          provider_usage_id: 'usage-123',
        },
      });
    });

    it('should validate cached token usage', async () => {
      server.urls['https://api.cohere.com/v2/chat'].response = {
        type: 'json-value',
        body: {
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello' }],
          },
          finish_reason: 'COMPLETE',
          usage: {
            billed_units: {
              input_tokens: 12,
              output_tokens: 7,
            },
            tokens: {
              input_tokens: 507,
              output_tokens: 10,
            },
            cached_tokens: '448',
          },
        },
      };

      await expect(
        model.doGenerate({
          prompt: TEST_PROMPT,
        }),
      ).rejects.toThrow();
    });

    it('should send additional response information', async () => {
      prepareJsonFixtureResponse('cohere-text');

      const { response } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect({
        id: response?.id,
        timestamp: response?.timestamp,
        modelId: response?.modelId,
      }).toMatchInlineSnapshot(`
        {
          "id": "e7592632-1e3d-424f-b129-bd5f9f980f7b",
          "modelId": undefined,
          "timestamp": undefined,
        }
      `);
    });
  });
});

describe('doStream', () => {
  describe('text', () => {
    beforeEach(() => {
      prepareChunksFixtureResponse('cohere-text');
    });

    it('should stream text deltas', async () => {
      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchSnapshot();
    });

    it('should include raw chunks when includeRawChunks is enabled', async () => {
      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: true,
      });

      const chunks = await convertReadableStreamToArray(stream);

      expect(chunks.filter(chunk => chunk.type === 'raw')).toMatchSnapshot();
    });

    it('should not include raw chunks when includeRawChunks is false', async () => {
      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      const chunks = await convertReadableStreamToArray(stream);

      expect(chunks.filter(chunk => chunk.type === 'raw')).toHaveLength(0);
    });

    it('should preserve extra top-level and nested fields in raw usage', async () => {
      const rawUsage = {
        billed_units: {
          input_tokens: 12,
          output_tokens: 7,
          billing_tier: 'standard',
        },
        tokens: {
          input_tokens: 507,
          output_tokens: 10,
          tokenizer: 'command',
        },
        cached_tokens: 448,
        provider_usage_id: 'usage-123',
      };
      prepareChunkLinesResponse([
        {
          type: 'message-end',
          delta: {
            finish_reason: 'COMPLETE',
            usage: rawUsage,
          },
        },
      ]);

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect((await convertReadableStreamToArray(stream)).at(-1)).toStrictEqual(
        {
          type: 'finish',
          finishReason: {
            unified: 'stop',
            raw: 'COMPLETE',
          },
          usage: {
            inputTokens: {
              total: 507,
              noCache: 507,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 10,
              text: 10,
              reasoning: undefined,
            },
            raw: rawUsage,
          },
        },
      );
    });

    it('should finish successfully when billed units are absent', async () => {
      const rawUsage = {
        tokens: {
          input_tokens: 507,
          output_tokens: 10,
        },
      };
      prepareChunkLinesResponse([
        {
          type: 'message-end',
          delta: {
            finish_reason: 'COMPLETE',
            usage: rawUsage,
          },
        },
      ]);

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect((await convertReadableStreamToArray(stream)).at(-1)).toStrictEqual(
        {
          type: 'finish',
          finishReason: {
            unified: 'stop',
            raw: 'COMPLETE',
          },
          usage: {
            inputTokens: {
              total: 507,
              noCache: 507,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 10,
              text: 10,
              reasoning: undefined,
            },
            raw: rawUsage,
          },
        },
      );
    });

    it('should return undefined token counts when message-end has no tokens', async () => {
      const rawUsage = {
        billed_units: { input_tokens: 88, output_tokens: 13 },
        cached_tokens: 128,
      };
      prepareChunkLinesResponse([
        {
          type: 'message-end',
          delta: {
            finish_reason: 'COMPLETE',
            usage: rawUsage,
          },
        },
      ]);

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect((await convertReadableStreamToArray(stream)).at(-1)).toStrictEqual(
        {
          type: 'finish',
          finishReason: {
            unified: 'stop',
            raw: 'COMPLETE',
          },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
            raw: rawUsage,
          },
        },
      );
    });

    it.each([
      {
        field: 'billed input tokens',
        usage: {
          billed_units: {
            input_tokens: '12',
            output_tokens: 7,
          },
          tokens: {
            input_tokens: 507,
            output_tokens: 10,
          },
          cached_tokens: 448,
        },
      },
      {
        field: 'cached tokens',
        usage: {
          billed_units: {
            input_tokens: 12,
            output_tokens: 7,
          },
          tokens: {
            input_tokens: 507,
            output_tokens: 10,
          },
          cached_tokens: '448',
        },
      },
    ])('should validate streamed $field', async ({ usage }) => {
      prepareChunkLinesResponse([
        {
          type: 'message-end',
          delta: {
            finish_reason: 'COMPLETE',
            usage,
          },
        },
      ]);

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(await convertReadableStreamToArray(stream)).toEqual([
        {
          type: 'stream-start',
          warnings: [],
        },
        {
          type: 'error',
          error: expect.any(Error),
        },
        {
          type: 'finish',
          finishReason: {
            unified: 'error',
            raw: undefined,
          },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
      ]);
    });
  });

  describe('citations', () => {
    it('should stream sources for citations', async () => {
      prepareChunksFixtureResponse('cohere-citations');

      const mockGenerateId = vi.fn().mockReturnValue('test-citation-id');
      const testProvider = createCohere({
        apiKey: 'test-api-key',
        generateId: mockGenerateId,
      });
      const testModel = testProvider('command-a-03-2025');

      const { stream } = await testModel.doStream({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is the capital of Zephyria?' },
              {
                type: 'file',
                data: Buffer.from(
                  'Zephyria is a fictional country. Its capital city is Marrowdale, a coastal city known for its lighthouses.',
                ).toString('base64'),
                mediaType: 'text/plain',
                filename: 'zephyria.txt',
              },
            ],
          },
        ],
        includeRawChunks: false,
      });

      expect(
        (await convertReadableStreamToArray(stream)).filter(
          part => part.type === 'source',
        ),
      ).toStrictEqual([
        {
          type: 'source',
          sourceType: 'document',
          id: 'test-citation-id',
          mediaType: 'text/plain',
          title: 'zephyria.txt',
          providerMetadata: {
            cohere: {
              start: 49,
              end: 60,
              text: 'Marrowdale.',
              sources: [
                {
                  type: 'document',
                  id: 'doc:0',
                  document: {
                    id: 'doc:0',
                    text: 'Zephyria is a fictional country. Its capital city is Marrowdale, a coastal city known for its lighthouses.',
                    title: 'zephyria.txt',
                  },
                },
              ],
              citationType: 'TEXT_CONTENT',
            },
          },
        },
      ]);
    });

    it('should stream a source for each citation in a citation-start event', async () => {
      const citation = {
        start: 0,
        end: 4,
        text: 'text',
        sources: [
          {
            type: 'document',
            id: 'doc:0',
            document: { id: 'doc:0', text: 'text', title: 'test.txt' },
          },
        ],
        type: 'TEXT_CONTENT',
      };
      prepareChunkLinesResponse([
        {
          type: 'citation-start',
          index: 0,
          delta: { message: { citations: [citation, citation] } },
        },
        { type: 'citation-end', index: 0 },
      ]);

      const mockGenerateId = vi
        .fn()
        .mockReturnValueOnce('test-citation-id-1')
        .mockReturnValueOnce('test-citation-id-2');
      const testProvider = createCohere({
        apiKey: 'test-api-key',
        generateId: mockGenerateId,
      });
      const testModel = testProvider('command-a-03-2025');

      const { stream } = await testModel.doStream({ prompt: TEST_PROMPT });

      expect(
        (await convertReadableStreamToArray(stream)).filter(
          part => part.type === 'source',
        ),
      ).toStrictEqual([
        {
          type: 'source',
          sourceType: 'document',
          id: 'test-citation-id-1',
          mediaType: 'text/plain',
          title: 'test.txt',
          providerMetadata: {
            cohere: {
              start: 0,
              end: 4,
              text: 'text',
              sources: citation.sources,
              citationType: 'TEXT_CONTENT',
            },
          },
        },
        {
          type: 'source',
          sourceType: 'document',
          id: 'test-citation-id-2',
          mediaType: 'text/plain',
          title: 'test.txt',
          providerMetadata: {
            cohere: {
              start: 0,
              end: 4,
              text: 'text',
              sources: citation.sources,
              citationType: 'TEXT_CONTENT',
            },
          },
        },
      ]);
    });

    it('should tolerate citations without optional fields', async () => {
      prepareChunkLinesResponse([
        {
          type: 'citation-start',
          index: 0,
          delta: {
            message: {
              citations: { sources: [{ type: 'document', document: {} }] },
            },
          },
        },
        { type: 'citation-end', index: 0 },
      ]);

      const mockGenerateId = vi.fn().mockReturnValue('test-citation-id');
      const testProvider = createCohere({
        apiKey: 'test-api-key',
        generateId: mockGenerateId,
      });
      const testModel = testProvider('command-a-03-2025');

      const { stream } = await testModel.doStream({ prompt: TEST_PROMPT });
      const parts = await convertReadableStreamToArray(stream);

      expect(parts.some(part => part.type === 'error')).toBe(false);
      expect(parts.filter(part => part.type === 'source')).toStrictEqual([
        {
          type: 'source',
          sourceType: 'document',
          id: 'test-citation-id',
          mediaType: 'text/plain',
          title: 'Document',
          providerMetadata: {
            cohere: {
              sources: [{ type: 'document', document: {} }],
            },
          },
        },
      ]);
    });

    it('should tolerate a citation-start event without citations', async () => {
      prepareChunkLinesResponse([
        { type: 'citation-start', index: 0 },
        { type: 'citation-end', index: 0 },
        {
          type: 'message-end',
          delta: {
            finish_reason: 'COMPLETE',
            usage: { tokens: { input_tokens: 5, output_tokens: 2 } },
          },
        },
      ]);

      const testProvider = createCohere({ apiKey: 'test-api-key' });
      const testModel = testProvider('command-a-03-2025');

      const { stream } = await testModel.doStream({ prompt: TEST_PROMPT });
      const parts = await convertReadableStreamToArray(stream);

      expect(parts.some(part => part.type === 'error')).toBe(false);
      expect(parts.some(part => part.type === 'source')).toBe(false);
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: { unified: 'stop' },
      });
    });

    it('should skip tool-only citations', async () => {
      prepareChunkLinesResponse([
        {
          type: 'citation-start',
          index: 0,
          delta: {
            message: {
              citations: {
                start: 6,
                end: 11,
                text: 'sunny',
                sources: [
                  {
                    type: 'tool',
                    id: 'getWeather:0',
                    tool_output: { city: 'Berlin', condition: 'sunny' },
                  },
                ],
                type: 'TEXT_CONTENT',
              },
            },
          },
        },
        { type: 'citation-end', index: 0 },
      ]);

      const testProvider = createCohere({ apiKey: 'test-api-key' });
      const testModel = testProvider('command-a-03-2025');

      const { stream } = await testModel.doStream({ prompt: TEST_PROMPT });
      const parts = await convertReadableStreamToArray(stream);

      expect(parts.some(part => part.type === 'error')).toBe(false);
      expect(parts.some(part => part.type === 'source')).toBe(false);
    });

    it('should emit a source with a distinct id for each citation-start event', async () => {
      const citation = {
        start: 49,
        end: 60,
        text: 'Marrowdale.',
        sources: [
          {
            type: 'document',
            id: 'doc:0',
            document: {
              id: 'doc:0',
              text: 'Zephyria is a fictional country.',
              title: 'zephyria.txt',
            },
          },
        ],
        type: 'TEXT_CONTENT',
      };
      prepareChunkLinesResponse([
        {
          type: 'citation-start',
          index: 0,
          delta: { message: { citations: citation } },
        },
        { type: 'citation-end', index: 0 },
        {
          type: 'citation-start',
          index: 0,
          delta: { message: { citations: citation } },
        },
        { type: 'citation-end', index: 0 },
      ]);

      const mockGenerateId = vi
        .fn()
        .mockReturnValueOnce('test-citation-id-1')
        .mockReturnValueOnce('test-citation-id-2');
      const testProvider = createCohere({
        apiKey: 'test-api-key',
        generateId: mockGenerateId,
      });
      const testModel = testProvider('command-a-03-2025');

      const { stream } = await testModel.doStream({ prompt: TEST_PROMPT });
      const sources = (await convertReadableStreamToArray(stream)).filter(
        part => part.type === 'source',
      );

      expect(
        sources.map(source => (source as { id: string }).id),
      ).toStrictEqual(['test-citation-id-1', 'test-citation-id-2']);
      expect(sources).toMatchObject([
        { sourceType: 'document', title: 'zephyria.txt' },
        { sourceType: 'document', title: 'zephyria.txt' },
      ]);
    });

    it('should use a fallback title for untitled documents', async () => {
      prepareChunkLinesResponse([
        {
          type: 'citation-start',
          index: 0,
          delta: {
            message: {
              citations: {
                start: 0,
                end: 4,
                text: 'text',
                sources: [
                  {
                    type: 'document',
                    id: 'doc:0',
                    document: { id: 'doc:0', text: 'text' },
                  },
                ],
                type: 'TEXT_CONTENT',
              },
            },
          },
        },
        { type: 'citation-end', index: 0 },
      ]);

      const testProvider = createCohere({
        apiKey: 'test-api-key',
        generateId: () => 'test-citation-id',
      });
      const testModel = testProvider('command-a-03-2025');

      const { stream } = await testModel.doStream({ prompt: TEST_PROMPT });
      const sources = (await convertReadableStreamToArray(stream)).filter(
        part => part.type === 'source',
      );

      expect(sources).toMatchObject([{ title: 'Document' }]);
    });
  });

  describe('reasoning', () => {
    beforeEach(() => {
      prepareChunksFixtureResponse('cohere-reasoning');
    });

    it('should stream reasoning deltas', async () => {
      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchSnapshot();
    });
  });

  describe('tool call', () => {
    beforeEach(() => {
      prepareChunksFixtureResponse('cohere-tool-call');
    });

    it('should stream tool deltas', async () => {
      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
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
        includeRawChunks: false,
      });

      const responseArray = await convertReadableStreamToArray(stream);

      expect(responseArray).toMatchSnapshot();

      const toolCallIds = responseArray
        .filter(
          chunk =>
            chunk.type === 'tool-input-delta' || chunk.type === 'tool-call',
        )
        .map(chunk =>
          chunk.type === 'tool-call' ? chunk.toolCallId : chunk.id,
        );
    });

    it('rejects prototype keys in streamed tool call arguments', async () => {
      prepareChunkLinesResponse([
        {
          type: 'tool-call-start',
          index: 0,
          delta: {
            message: {
              tool_calls: {
                id: 'test-tool-call',
                type: 'function',
                function: { name: 'test-tool', arguments: '' },
              },
            },
          },
        },
        {
          type: 'tool-call-delta',
          index: 0,
          delta: {
            message: {
              tool_calls: {
                function: {
                  arguments: '{"__proto__":{"polluted":true}}',
                },
              },
            },
          },
        },
        {
          type: 'tool-call-end',
          index: 0,
        },
      ]);

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'function',
            name: 'test-tool',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: true,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        includeRawChunks: false,
      });

      await expect(convertReadableStreamToArray(stream)).rejects.toThrow(
        'Object contains forbidden prototype property',
      );
    });
  });

  describe('empty tool call', () => {
    beforeEach(() => {
      prepareChunksFixtureResponse('cohere-empty-tool-call');
    });

    it('should handle empty tool call arguments', async () => {
      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'function',
            name: 'test-tool',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        includeRawChunks: false,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchSnapshot();
    });
  });

  describe('error handling', () => {
    it.skipIf(isNodeVersion(20))(
      'should handle unparsable stream parts',
      async () => {
        server.urls['https://api.cohere.com/v2/chat'].response = {
          type: 'stream-chunks',
          chunks: [`event: foo-message\ndata: {unparsable}\n\n`],
        };

        const { stream } = await model.doStream({
          prompt: TEST_PROMPT,
          includeRawChunks: false,
        });

        expect(await convertReadableStreamToArray(stream)).toMatchSnapshot();
      },
    );
  });

  describe('request', () => {
    beforeEach(() => {
      prepareChunksFixtureResponse('cohere-text');
    });

    it('should pass the messages and the model', async () => {
      await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "you are a friendly bot!",
              "role": "system",
            },
            {
              "content": "Hello",
              "role": "user",
            },
          ],
          "model": "command-r-plus",
          "stream": true,
        }
      `);
    });

    it('should pass headers', async () => {
      const provider = createCohere({
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider('command-r-plus').doStream({
        prompt: TEST_PROMPT,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
        includeRawChunks: false,
      });

      expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
        {
          "authorization": "Bearer test-api-key",
          "content-type": "application/json",
          "custom-provider-header": "provider-header-value",
          "custom-request-header": "request-header-value",
        }
      `);
    });

    it('should send request body', async () => {
      const { request } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(request).toMatchInlineSnapshot(`
        {
          "body": {
            "frequency_penalty": undefined,
            "k": undefined,
            "max_tokens": undefined,
            "messages": [
              {
                "content": "you are a friendly bot!",
                "role": "system",
              },
              {
                "content": "Hello",
                "role": "user",
              },
            ],
            "model": "command-r-plus",
            "p": undefined,
            "presence_penalty": undefined,
            "response_format": undefined,
            "seed": undefined,
            "stop_sequences": undefined,
            "stream": true,
            "temperature": undefined,
            "tool_choice": undefined,
            "tools": undefined,
          },
        }
      `);
    });

    it('should expose the raw response headers', async () => {
      prepareChunksFixtureResponse('cohere-text', {
        'test-header': 'test-value',
      });

      const { response } = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      expect(response?.headers).toMatchInlineSnapshot(`
        {
          "cache-control": "no-cache",
          "connection": "keep-alive",
          "content-type": "text/event-stream",
          "test-header": "test-value",
        }
      `);
    });
  });
});
