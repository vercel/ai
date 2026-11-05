import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import {
  convertReadableStreamToArray,
  isNodeVersion,
} from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { createCohere } from './cohere-provider';
import { describe, it, expect, vi } from 'vitest';

const TEST_PROMPT: LanguageModelV2Prompt = [
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
  function prepareJsonResponse({
    content = [],
    tool_calls,
    finish_reason = 'COMPLETE',
    tokens = {
      input_tokens: 4,
      output_tokens: 30,
    },
    generation_id = 'dad0c7cd-7982-42a7-acfb-706ccf598291',
    headers,
  }: {
    content?: Array<
      { type: 'text'; text: string } | { type: 'thinking'; thinking: string }
    >;
    tool_calls?: any;
    finish_reason?: string;
    tokens?: {
      input_tokens: number;
      output_tokens: number;
    };
    generation_id?: string;
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://api.cohere.com/v2/chat'].response = {
      type: 'json-value',
      headers,
      body: {
        response_id: '0cf61ae0-1f60-4c18-9802-be7be809e712',
        generation_id,
        message: {
          role: 'assistant',
          content,
          ...(tool_calls ? { tool_calls } : {}),
        },
        finish_reason,
        usage: {
          billed_units: { input_tokens: 9, output_tokens: 415 },
          tokens,
        },
      },
    };
  }

  it('should extract text response', async () => {
    prepareJsonResponse({ content: [{ type: 'text', text: 'Hello, World!' }] });

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
      content: [{ type: 'text', text: 'Hello, World!' }],
      tool_calls: [
        {
          id: 'test-id-1',
          type: 'function',
          function: {
            name: 'test-tool',
            arguments: '{"value":"example value"}',
          },
        },
      ],
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
          "text": "Hello, World!",
          "type": "text",
        },
        {
          "input": "{"value":"example value"}",
          "toolCallId": "test-id-1",
          "toolName": "test-tool",
          "type": "tool-call",
        },
      ]
    `);
    expect(finishReason).toStrictEqual('stop');
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      tokens: { input_tokens: 20, output_tokens: 5 },
    });

    const { usage } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(usage).toMatchInlineSnapshot(`
      {
        "inputTokens": 20,
        "outputTokens": 5,
        "totalTokens": 25,
      }
    `);
  });

  it('should send additional response information', async () => {
    prepareJsonResponse({
      content: [{ type: 'text', text: '' }],
      generation_id: 'test-id',
    });

    const { response } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(response).toMatchInlineSnapshot(`
      {
        "body": {
          "finish_reason": "COMPLETE",
          "generation_id": "test-id",
          "message": {
            "content": [
              {
                "text": "",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
          "response_id": "0cf61ae0-1f60-4c18-9802-be7be809e712",
          "usage": {
            "billed_units": {
              "input_tokens": 9,
              "output_tokens": 415,
            },
            "tokens": {
              "input_tokens": 4,
              "output_tokens": 30,
            },
          },
        },
        "headers": {
          "content-length": "287",
          "content-type": "application/json",
        },
        "id": "test-id",
      }
    `);
  });

  it('should extract finish reason', async () => {
    prepareJsonResponse({
      finish_reason: 'MAX_TOKENS',
    });

    const { finishReason } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(finishReason).toStrictEqual('length');
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse({
      content: [{ type: 'text', text: '' }],
      headers: { 'test-header': 'test-value' },
    });

    const { response } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(response?.headers).toStrictEqual({
      // default headers:
      'content-length': '316',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should pass model and messages', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'command-r-plus',
      messages: [
        { role: 'system', content: 'you are a friendly bot!' },
        { role: 'user', content: 'Hello' },
      ],
    });
  });

  describe('should pass tools', async () => {
    it('should support "none" tool choice', async () => {
      prepareJsonResponse();

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

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'command-r-plus',
        messages: [
          {
            role: 'system',
            content: 'you are a friendly bot!',
          },
          { role: 'user', content: 'Hello' },
        ],
        tool_choice: 'NONE',
        tools: [
          {
            type: 'function',
            function: {
              name: 'test-tool',
              parameters: {
                type: 'object',
                properties: {
                  value: { type: 'string' },
                },
                required: ['value'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          },
        ],
      });
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

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

    expect(server.calls[0].requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
  });

  it('should pass response format', async () => {
    prepareJsonResponse();

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

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'command-r-plus',
      messages: [
        { role: 'system', content: 'you are a friendly bot!' },
        { role: 'user', content: 'Hello' },
      ],
      response_format: {
        type: 'json_object',
        json_schema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
          },
          required: ['text'],
        },
      },
    });
  });

  it('should send request body', async () => {
    prepareJsonResponse({ content: [{ type: 'text', text: '' }] });

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

  it('should handle string "null" tool call arguments', async () => {
    prepareJsonResponse({
      content: [],
      tool_calls: [
        {
          id: 'test-id-1',
          type: 'function',
          function: {
            name: 'currentTime',
            arguments: 'null',
          },
        },
      ],
    });

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

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "input": "{}",
          "toolCallId": "test-id-1",
          "toolName": "currentTime",
          "type": "tool-call",
        },
      ]
    `);
  });

  describe('citations', () => {
    it('should extract text documents and send to API', async () => {
      prepareJsonResponse({
        content: [{ type: 'text', text: 'Hello, World!' }],
      });

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
      prepareJsonResponse({
        content: [{ type: 'text', text: 'Hello, World!' }],
      });

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
      prepareJsonResponse({
        content: [{ type: 'text', text: 'Hello, World!' }],
      });

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
      prepareJsonResponse({
        content: [{ type: 'text', text: 'Hello, World!' }],
      });

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
      prepareJsonResponse({
        content: [{ type: 'text', text: 'Hello, World!' }],
      });

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

    it('should extract citations from response', async () => {
      const mockGenerateId = vi.fn().mockReturnValue('test-citation-id');
      const testProvider = createCohere({
        apiKey: 'test-api-key',
        generateId: mockGenerateId,
      });
      const testModel = testProvider('command-r-plus');

      server.urls['https://api.cohere.com/v2/chat'].response = {
        type: 'json-value',
        body: {
          response_id: '0cf61ae0-1f60-4c18-9802-be7be809e712',
          generation_id: 'dad0c7cd-7982-42a7-acfb-706ccf598291',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'AI has many benefits including automation.',
              },
            ],
            citations: [
              {
                start: 31,
                end: 41,
                text: 'automation',
                type: 'TEXT_CONTENT',
                sources: [
                  {
                    type: 'document',
                    id: 'doc:0',
                    document: {
                      id: 'doc:0',
                      text: 'AI provides automation and efficiency.',
                      title: 'ai-benefits.txt',
                    },
                  },
                ],
              },
            ],
          },
          finish_reason: 'COMPLETE',
          usage: {
            billed_units: { input_tokens: 9, output_tokens: 415 },
            tokens: { input_tokens: 4, output_tokens: 30 },
          },
        },
      };

      const { content } = await testModel.doGenerate({
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

      expect(content).toMatchInlineSnapshot(`
        [
          {
            "text": "AI has many benefits including automation.",
            "type": "text",
          },
          {
            "id": "test-citation-id",
            "mediaType": "text/plain",
            "providerMetadata": {
              "cohere": {
                "citationType": "TEXT_CONTENT",
                "end": 41,
                "sources": [
                  {
                    "document": {
                      "id": "doc:0",
                      "text": "AI provides automation and efficiency.",
                      "title": "ai-benefits.txt",
                    },
                    "id": "doc:0",
                    "type": "document",
                  },
                ],
                "start": 31,
                "text": "automation",
              },
            },
            "sourceType": "document",
            "title": "ai-benefits.txt",
            "type": "source",
          },
        ]
      `);
    });

    it('should not include documents parameter when no files present', async () => {
      prepareJsonResponse({
        content: [{ type: 'text', text: 'Hello, World!' }],
      });

      await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.documents).toBeUndefined();
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
  });

  describe('usage', () => {
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
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
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
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
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
          },
        },
      };

      const { usage } = await model.doGenerate({ prompt: TEST_PROMPT });

      // billed units measure something else than tokens, so no token counts
      // are reported.
      expect(usage).toStrictEqual({
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
      });
    });
  });

  it('should extract reasoning from response', async () => {
    prepareJsonResponse({
      content: [
        { type: 'text', text: '42' },
        { type: 'thinking', thinking: 'So I was thinking ...' },
      ],
    });

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "text": "42",
          "type": "text",
        },
        {
          "text": "So I was thinking ...",
          "type": "reasoning",
        },
      ]
    `);
  });
});

describe('doStream', () => {
  function prepareStreamResponse({
    content = [],
    usage = {
      input_tokens: 17,
      output_tokens: 244,
    },
    finish_reason = 'COMPLETE',
    headers,
  }: {
    content?: Array<
      | { type: 'text'; deltas: string[] }
      | { type: 'thinking'; deltas: string[] }
    >;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
    finish_reason?: string;
    headers?: Record<string, string>;
  } = {}) {
    const allEvents: string[] = [];

    content.forEach(contentItem => {
      if (contentItem.type === 'thinking') {
        allEvents.push(
          `event: content-start\ndata: {"type":"content-start","index":0,"delta":{"message":{"content":{"type":"thinking","thinking":""}}}}\n\n`,
          ...contentItem.deltas.map(
            text =>
              `event: content-delta\ndata: {"type":"content-delta","index":0,"delta":{"message":{"content":{"thinking":"${text}"}}}}\n\n`,
          ),
          `event: content-end\ndata: {"type":"content-end","index":0}\n\n`,
        );
      } else if (contentItem.type === 'text') {
        allEvents.push(
          `event: content-start\ndata: {"type":"content-start","index":0,"delta":{"message":{"content":{"type":"text","text":""}}}}\n\n`,
          ...contentItem.deltas.map(
            text =>
              `event: content-delta\ndata: {"type":"content-delta","index":0,"delta":{"message":{"content":{"text":"${text}"}}}}\n\n`,
          ),
          `event: content-end\ndata: {"type":"content-end","index":0}\n\n`,
        );
      }
    });

    server.urls['https://api.cohere.com/v2/chat'].response = {
      type: 'stream-chunks',
      headers,
      chunks: [
        `event: message-start\ndata: {"type":"message-start","id":"586ac33f-9c64-452c-8f8d-e5890e73b6fb","delta":{"message":{"role":"assistant","content":[],"tool_plan":"","tool_calls":[],"citations":[]}}}\n\n`,
        ...allEvents,
        `event: message-end\ndata: {"type":"message-end","delta":` +
          `{"finish_reason":"${finish_reason}",` +
          `"usage":{"tokens":{"input_tokens":${usage.input_tokens},"output_tokens":${usage.output_tokens}}}}}\n\n`,
        `data: [DONE]\n\n`,
      ],
    };
  }

  it('should stream text deltas', async () => {
    prepareStreamResponse({
      content: [{ type: 'text', deltas: ['Hello', ', ', 'World!'] }],
      finish_reason: 'COMPLETE',
      usage: {
        input_tokens: 34,
        output_tokens: 12,
      },
    });

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "586ac33f-9c64-452c-8f8d-e5890e73b6fb",
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
          "type": "finish",
          "usage": {
            "inputTokens": 34,
            "outputTokens": 12,
            "totalTokens": 46,
          },
        },
      ]
    `);
  });

  it('should stream reasoning deltas', async () => {
    prepareStreamResponse({
      content: [
        { type: 'thinking', deltas: ['So', 'I ', 'was ', 'thinking ', '...'] },
        { type: 'text', deltas: ['Hello', ', ', 'World!'] },
      ],
      finish_reason: 'COMPLETE',
      usage: {
        input_tokens: 34,
        output_tokens: 12,
      },
    });

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "586ac33f-9c64-452c-8f8d-e5890e73b6fb",
          "type": "response-metadata",
        },
        {
          "id": "0",
          "type": "reasoning-start",
        },
        {
          "delta": "So",
          "id": "0",
          "type": "reasoning-delta",
        },
        {
          "delta": "I ",
          "id": "0",
          "type": "reasoning-delta",
        },
        {
          "delta": "was ",
          "id": "0",
          "type": "reasoning-delta",
        },
        {
          "delta": "thinking ",
          "id": "0",
          "type": "reasoning-delta",
        },
        {
          "delta": "...",
          "id": "0",
          "type": "reasoning-delta",
        },
        {
          "id": "0",
          "type": "reasoning-end",
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
          "type": "finish",
          "usage": {
            "inputTokens": 34,
            "outputTokens": 12,
            "totalTokens": 46,
          },
        },
      ]
    `);
  });

  it('should stream tool deltas', async () => {
    server.urls['https://api.cohere.com/v2/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        `event: message-start\ndata: {"type":"message-start","id":"29f14a5a-11de-4cae-9800-25e4747408ea","delta":{"message":{"role":"assistant","content":[],"tool_plan":"","tool_calls":[],"citations":[]}}}\n\n`,
        `event: tool-call-start\ndata: {"type":"tool-call-start","delta":{"message":{"tool_calls":{"id":"test-id-1","type":"function","function":{"name":"test-tool","arguments":""}}}}}\n\n`,
        `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"{\\n    \\""}}}}}\n\n`,
        `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"ticker"}}}}}\n\n`,
        `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"_"}}}}}\n\n`,
        `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"symbol"}}}}}\n\n`,
        `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"\\":"}}}}}\n\n`,
        `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":" \\""}}}}}\n\n`,
        `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"AAPL"}}}}}\n\n`,
        `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"\\""}}}}}\n\n`,
        `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"\\n"}}}}}\n\n`,
        `event: tool-call-delta\ndata: {"type":"tool-call-delta","delta":{"message":{"tool_calls":{"function":{"arguments":"}"}}}}}\n\n`,
        `event: tool-call-end\ndata: {"type":"tool-call-end"}\n\n`,
        `event: message-end\ndata: {"type":"message-end","delta":{"finish_reason":"COMPLETE","usage":{"tokens":{"input_tokens":893,"output_tokens":62}}}}\n\n`,
        `data: [DONE]\n\n`,
      ],
    };

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

    expect(responseArray).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "29f14a5a-11de-4cae-9800-25e4747408ea",
          "type": "response-metadata",
        },
        {
          "id": "test-id-1",
          "toolName": "test-tool",
          "type": "tool-input-start",
        },
        {
          "delta": "{
          "",
          "id": "test-id-1",
          "type": "tool-input-delta",
        },
        {
          "delta": "ticker",
          "id": "test-id-1",
          "type": "tool-input-delta",
        },
        {
          "delta": "_",
          "id": "test-id-1",
          "type": "tool-input-delta",
        },
        {
          "delta": "symbol",
          "id": "test-id-1",
          "type": "tool-input-delta",
        },
        {
          "delta": "":",
          "id": "test-id-1",
          "type": "tool-input-delta",
        },
        {
          "delta": " "",
          "id": "test-id-1",
          "type": "tool-input-delta",
        },
        {
          "delta": "AAPL",
          "id": "test-id-1",
          "type": "tool-input-delta",
        },
        {
          "delta": """,
          "id": "test-id-1",
          "type": "tool-input-delta",
        },
        {
          "delta": "
      ",
          "id": "test-id-1",
          "type": "tool-input-delta",
        },
        {
          "delta": "}",
          "id": "test-id-1",
          "type": "tool-input-delta",
        },
        {
          "id": "test-id-1",
          "type": "tool-input-end",
        },
        {
          "input": "{"ticker_symbol":"AAPL"}",
          "toolCallId": "test-id-1",
          "toolName": "test-tool",
          "type": "tool-call",
        },
        {
          "finishReason": "stop",
          "type": "finish",
          "usage": {
            "inputTokens": 893,
            "outputTokens": 62,
            "totalTokens": 955,
          },
        },
      ]
    `);

    // Check if the tool call ID is the same in the tool call delta and the tool call
    const toolCallIds = responseArray
      .filter(
        chunk =>
          chunk.type === 'tool-input-delta' || chunk.type === 'tool-call',
      )
      .map(chunk => (chunk.type === 'tool-call' ? chunk.toolCallId : chunk.id));

    expect(new Set(toolCallIds)).toStrictEqual(new Set(['test-id-1']));
  });

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

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "error": [AI_JSONParseError: JSON parsing failed: Text: {unparsable}.
        Error message: Expected property name or '}' in JSON at position 1 (line 1 column 2)],
            "type": "error",
          },
          {
            "finishReason": "error",
            "type": "finish",
            "usage": {
              "inputTokens": undefined,
              "outputTokens": undefined,
              "totalTokens": undefined,
            },
          },
        ]
      `);
    },
  );

  it('should expose the raw response headers', async () => {
    prepareStreamResponse({
      content: [],
      headers: { 'test-header': 'test-value' },
    });

    const { response } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
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
    prepareStreamResponse();

    await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      stream: true,
      model: 'command-r-plus',
      messages: [
        {
          role: 'system',
          content: 'you are a friendly bot!',
        },
        {
          role: 'user',
          content: 'Hello',
        },
      ],
    });
  });

  it('should pass headers', async () => {
    prepareStreamResponse();

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

    expect(server.calls[0].requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
  });

  it('should send request body', async () => {
    prepareStreamResponse();

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

  it('should handle empty tool call arguments', async () => {
    server.urls['https://api.cohere.com/v2/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        `event: message-start\ndata: {"type":"message-start","id":"test-id","delta":{"message":{"role":"assistant","content":[],"tool_plan":"","tool_calls":[],"citations":[]}}}\n\n`,
        `event: tool-call-start\ndata: {"type":"tool-call-start","delta":{"message":{"tool_calls":{"id":"test-id-1","type":"function","function":{"name":"test-tool","arguments":""}}}}}\n\n`,
        `event: tool-call-end\ndata: {"type":"tool-call-end"}\n\n`,
        `event: message-end\ndata: {"type":"message-end","delta":{"finish_reason":"COMPLETE","usage":{"tokens":{"input_tokens":10,"output_tokens":5}}}}\n\n`,
        `data: [DONE]\n\n`,
      ],
    };

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

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "test-id",
          "type": "response-metadata",
        },
        {
          "id": "test-id-1",
          "toolName": "test-tool",
          "type": "tool-input-start",
        },
        {
          "id": "test-id-1",
          "type": "tool-input-end",
        },
        {
          "input": "{}",
          "toolCallId": "test-id-1",
          "toolName": "test-tool",
          "type": "tool-call",
        },
        {
          "finishReason": "stop",
          "type": "finish",
          "usage": {
            "inputTokens": 10,
            "outputTokens": 5,
            "totalTokens": 15,
          },
        },
      ]
    `);
  });

  it('should include raw chunks when includeRawChunks is enabled', async () => {
    prepareStreamResponse({
      content: [{ type: 'text', deltas: ['Hello', ' World!'] }],
    });

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: true,
    });

    const chunks = await convertReadableStreamToArray(stream);

    expect(chunks.filter(chunk => chunk.type === 'raw')).toMatchInlineSnapshot(`
      [
        {
          "rawValue": {
            "delta": {
              "message": {
                "citations": [],
                "content": [],
                "role": "assistant",
                "tool_calls": [],
                "tool_plan": "",
              },
            },
            "id": "586ac33f-9c64-452c-8f8d-e5890e73b6fb",
            "type": "message-start",
          },
          "type": "raw",
        },
        {
          "rawValue": {
            "delta": {
              "message": {
                "content": {
                  "text": "",
                  "type": "text",
                },
              },
            },
            "index": 0,
            "type": "content-start",
          },
          "type": "raw",
        },
        {
          "rawValue": {
            "delta": {
              "message": {
                "content": {
                  "text": "Hello",
                },
              },
            },
            "index": 0,
            "type": "content-delta",
          },
          "type": "raw",
        },
        {
          "rawValue": {
            "delta": {
              "message": {
                "content": {
                  "text": " World!",
                },
              },
            },
            "index": 0,
            "type": "content-delta",
          },
          "type": "raw",
        },
        {
          "rawValue": {
            "index": 0,
            "type": "content-end",
          },
          "type": "raw",
        },
        {
          "rawValue": {
            "delta": {
              "finish_reason": "COMPLETE",
              "usage": {
                "tokens": {
                  "input_tokens": 17,
                  "output_tokens": 244,
                },
              },
            },
            "type": "message-end",
          },
          "type": "raw",
        },
      ]
    `);
  });

  it('should not include raw chunks when includeRawChunks is false', async () => {
    prepareStreamResponse({
      content: [{ type: 'text', deltas: ['Hello', ' World!'] }],
    });

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const chunks = await convertReadableStreamToArray(stream);

    expect(chunks.filter(chunk => chunk.type === 'raw')).toHaveLength(0);
  });

  it('should return undefined token counts when message-end has no tokens', async () => {
    prepareChunkLinesResponse([
      {
        type: 'message-end',
        delta: {
          finish_reason: 'COMPLETE',
          usage: {
            billed_units: { input_tokens: 88, output_tokens: 13 },
          },
        },
      },
    ]);

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    expect((await convertReadableStreamToArray(stream)).at(-1)).toStrictEqual({
      type: 'finish',
      finishReason: 'stop',
      usage: {
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
      },
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
        finishReason: 'stop',
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
});
