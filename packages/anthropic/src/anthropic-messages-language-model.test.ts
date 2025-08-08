import {
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  JSONValue,
} from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  createTestServer,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { AnthropicProviderOptions } from './anthropic-messages-options';
import { createAnthropic } from './anthropic-provider';
import { type DocumentCitation } from './anthropic-messages-language-model';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createAnthropic({ apiKey: 'test-api-key' });
const model = provider('claude-3-haiku-20240307');

describe('AnthropicMessagesLanguageModel', () => {
  const server = createTestServer({
    'https://api.anthropic.com/v1/messages': {},
  });

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
            citations?: Array<DocumentCitation>;
          }
        | { type: 'thinking'; thinking: string; signature: string }
        | { type: 'tool_use'; id: string; name: string; input: unknown }
      >;
      usage?: Record<string, JSONValue> & {
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

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          temperature: 0.5,
          topP: 0.7,
          topK: 0.1,
          providerOptions: {
            anthropic: {
              thinking: { type: 'enabled', budgetTokens: 1000 },
            } satisfies AnthropicProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'claude-3-haiku-20240307',
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
            },
          ],
          max_tokens: 4096 + 1000,
          thinking: { type: 'enabled', budget_tokens: 1000 },
        });

        expect(result.warnings).toStrictEqual([
          {
            type: 'unsupported-setting',
            setting: 'temperature',
            details: 'temperature is not supported when thinking is enabled',
          },
          {
            type: 'unsupported-setting',
            details: 'topK is not supported when thinking is enabled',
            setting: 'topK',
          },
          {
            type: 'unsupported-setting',
            details: 'topP is not supported when thinking is enabled',
            setting: 'topP',
          },
        ]);
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

    describe('json schema response format', () => {
      let result: Awaited<ReturnType<typeof model.doGenerate>>;

      beforeEach(async () => {
        prepareJsonResponse({
          content: [
            { type: 'text', text: 'Some text\n\n' },
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'json',
              input: { name: 'example value' },
            },
          ],
          stopReason: 'tool_use',
        });

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
              "name": "json",
              "type": "tool",
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
              "text": "{"name":"example value"}",
              "type": "text",
            },
          ]
        `);
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
    });

    it('should send the model id and settings', async () => {
      prepareJsonResponse({});

      await model.doGenerate({
        prompt: TEST_PROMPT,
        temperature: 0.5,
        maxOutputTokens: 100,
        topP: 0.9,
        topK: 0.1,
        stopSequences: ['abc', 'def'],
        frequencyPenalty: 0.15,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,
        stop_sequences: ['abc', 'def'],
        temperature: 0.5,
        top_k: 0.1,
        top_p: 0.9,
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
      });
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
              },
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
        headers: {
          'anthropic-beta': 'extended-cache-ttl-2025-04-11',
        },
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            providerOptions: {
              anthropic: {
                cacheControl: { type: 'ephemeral', ttl: '1h' },
              },
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
      // Create a model with a predictable generateId function
      const mockProvider = createAnthropic({
        apiKey: 'test-api-key',
        generateId: () => 'test-citation-id',
      });
      const modelWithMockId = mockProvider('claude-3-haiku-20240307');

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

      const result = await modelWithMockId.doGenerate({
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
            "id": "test-citation-id",
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

    describe('web search', () => {
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
              type: 'provider-defined',
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
              type: 'provider-defined',
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
              type: 'provider-defined',
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
              type: 'provider-defined',
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
              type: 'provider-defined',
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
              type: 'provider-defined',
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
              "providerExecuted": true,
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
              type: 'provider-defined',
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
              "providerExecuted": true,
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
              type: 'provider-defined',
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

    it('should throw an api error when the server is overloaded', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'error',
        status: 529,
        body: '{"type":"error","error":{"details":null,"type":"overloaded_error","message":"Overloaded"}}',
      };

      await expect(
        model.doGenerate({
          prompt: TEST_PROMPT,
        }),
      ).rejects.toThrow('Overloaded');
    });
  });

  describe('doStream', () => {
    describe('json schema response format', () => {
      let result: Array<LanguageModelV2StreamPart>;

      beforeEach(async () => {
        server.urls['https://api.anthropic.com/v1/messages'].response = {
          type: 'stream-chunks',
          chunks: [
            `data: {"type":"message_start","message":{"id":"msg_01GouTqNCGXzrj5LQ5jEkw67","type":"message","role":"assistant","model":"claude-3-haiku-20240307","stop_sequence":null,"usage":{"input_tokens":441,"output_tokens":2},"content":[],"stop_reason":null}            }\n\n`,
            `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}      }\n\n`,
            `data: {"type": "ping"}\n\n`,
            `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Okay"}    }\n\n`,
            `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"!"}   }\n\n`,
            `data: {"type":"content_block_stop","index":0    }\n\n`,
            `data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_01DBsB4vvYLnBDzZ5rBSxSLs","name":"json","input":{}}      }\n\n`,
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
              "name": "json",
              "type": "tool",
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
        expect(result).toMatchInlineSnapshot(`
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
              "id": "0",
              "type": "text-end",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "delta": "",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": "{"value",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": "":",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": ""Spark",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": "le",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": " Day"}",
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
                  "usage": {
                    "input_tokens": 441,
                    "output_tokens": 2,
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
                "usage": {
                  "input_tokens": 17,
                  "output_tokens": 1,
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
                "usage": {
                  "input_tokens": 17,
                  "output_tokens": 1,
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
                "usage": {
                  "input_tokens": 17,
                  "output_tokens": 1,
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
                "usage": {
                  "input_tokens": 17,
                  "output_tokens": 1,
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
            "delta": "",
            "id": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "type": "tool-input-delta",
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
            "toolCallId": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "toolName": "test-tool",
            "type": "tool-call",
          },
          {
            "finishReason": "tool-calls",
            "providerMetadata": {
              "anthropic": {
                "cacheCreationInputTokens": null,
                "usage": {
                  "input_tokens": 441,
                  "output_tokens": 2,
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
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "custom-provider-header": "provider-header-value",
          "custom-request-header": "request-header-value",
          "x-api-key": "test-api-key",
        }
      `);
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
                "usage": {
                  "cache_creation_input_tokens": 10,
                  "cache_read_input_tokens": 5,
                  "input_tokens": 17,
                  "output_tokens": 1,
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
        headers: {
          'anthropic-beta': 'extended-cache-ttl-2025-04-11',
        },
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
                "usage": {
                  "cache_creation": {
                    "ephemeral_1h_input_tokens": 10,
                    "ephemeral_5m_input_tokens": 0,
                  },
                  "cache_creation_input_tokens": 10,
                  "cache_read_input_tokens": 5,
                  "input_tokens": 17,
                  "output_tokens": 1,
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
                  "usage": {
                    "input_tokens": 17,
                    "output_tokens": 1,
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

      describe('web search', () => {
        it('should stream sources and tool calls', async () => {
          server.urls['https://api.anthropic.com/v1/messages'].response = {
            type: 'stream-chunks',
            headers: { 'test-header': 'test-value' },
            chunks: [
              `data: {"type":"message_start","message":{"id":"msg_01SZs8CgARn2ixN9VnpjE6WH","type":"message","role":"assistant","model":"claude-3-5-sonnet-20241022","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":2688,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":2,"service_tier":"standard"}}}\n\n`,
              `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
              `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"I'll search for the latest stock market trends and financial news"}}\n\n`,
              `data: {"type":"content_block_stop","index":0}\n\n`,
              `data: {"type":"content_block_start","index":1,"content_block":{"type":"server_tool_use","id":"srvtoolu_01WLwJ9AzAmNar5vFyc4ye6X","name":"web_search","input":{}}}\n\n`,
              `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":""}}\n\n`,
              `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\""}}\n\n`,
              `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"query\\": \\"latest stock "}}\n\n`,
              `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"mar"}}\n\n`,
              `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"ket trends financial"}}\n\n`,
              `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":" news June 20 2025\\"}"}}\n\n`,
              `data: {"type":"content_block_stop","index":1}\n\n`,
              `data: {"type":"content_block_start","index":2,"content_block":{"type":"web_search_tool_result","tool_use_id":"srvtoolu_01WLwJ9AzAmNar5vFyc4ye6X","content":[{"type":"web_search_result","title":"Stock market news for June 18, 2025","url":"https://www.cnbc.com/2025/06/17/stock-market-today-live-updates.html","encrypted_content":"Ep4KCioIBBgCIiRiY2JjZWJjMy1lYTFhLTRmNjktYTUwMy01YzgwNWU1Y2U0NzESDADUUNu4L313Df41ORoMeuawBfXo3gRCOLlHIjCrwqH7eyUcTYYzK3uGMir+55P+7F3DVFvMlpWza8wxKlGxFe8SEzZvK8sliu7L6toqoQmPOqy8Ovlf58WF7WiqWgo8K9zk0OZPm3k7xiIMJSS7jfk+VTAD+oS7zGeyiyxFXz6tJ/ehQ4h+ioIl07T+gMtnzvItR0QHlM8V+DcmpTDlYT0+/HqF7DD01Y1Vb5rq+XPTSpeT3zZKlUT5kcdnJib5uiBjbg85Duj2tNTg1PlxOmr8WMgpfM0rqhzclh4O7Hws6bAcTIYHwrFy3XrFFZjV4BrIKzAV9pjGfRnSYcUluLZ9b1rdOP/Rraeyql7/qVVsR9iOeiHVJXAIwy+fGDbamEZMNdCSfrqKXR59+kNxyF5WQ8QgVH0qLqzKBEmzwHkhtB4PuWp/kotLbtA8/nIUdNqi2EWYIcHZ/KPQq6b9MXnDFPvyzjEKAnCRHQUbKWfM9TLayLvZja2E0CYbck3YbezBpYYfyhf+euatxFmVv00X1i1GEd4fb/PrnP+4EtvDHYpLgcTzzakSpi/E0rEZf7wh1Bj8IFlmxoZeP75aJxvt3w43qEXC6aB4PuLZlYY4dFygS63ijxHvPHleXTSVVYjJJZyN1MvVudgvTw9sTSzC47PIPwJNXTN+JkSYcajaq+UfEviPE5qDvqRqorRwIeaY3791D2vhOb/YMCmQEIRV2D0zRAh0t9GJNBVG9o9EBujURJobrW0cEVRsc/dfi4nQsM7jZ6cgUR9uoqPtaP8dpk67CUiUTfTNyIBMhr8aXlk5hdY/iK7Pu+JyStkplMDl3IPdXdhP3jz3xH9KcduHlPtXnhW37IizPlx8wlaQcUxG8bDLyHyH9SF/3SkYP9SWwT3hU10/qrsJq2ka3+YUkqu5EIdOv4ytFRYJbJGF1BhS/dj+Rh3UYRhuZCBxx3o4xghboFCamMhrg75AqZwimgv4ouo7SXzZSoW06l6DAZJFB1QgIia0LvuUDCc8MiS79cpWGIjg029yvUx1mefHIpbqbCVOwECmLj2doEL/gqxnajD7KK3RGYuDobT2GTwO1+YwWWZABWm4KIAGuB9LcPz9k30K+KaVquN51GWR0h97p9HtG5sFbDhLkl91DNQ1eWI4GGEFoUM2Xzg/2k9rpg4eh5MQvvZVSuFMRDih4/MLYFVl4yDsBfehoZ8niEXCV/ObPgUDy6enIsdQhp8uFI67TVTCYH+EddwsQ6z8yRPQChxNnrTsUcTY9msqRXQj5lMU4p/heWh1LU+Dc/FwsaJkj+luq4ziounR8fFI1O+S8iiN+2Fh1s+zoMknaKtXCqzf7FybviFcPXahHVHfmeyg7DhhDAjpJouva7XoYkCpvCgh8TML4h9HynNfKDQEpPFqpGzt360ndbEKKEZx1R7D/yW3EA+mlR78gAv4AHzf4dwqqyqH6jOOVwwTl6sB+zID7ItNPyk30t9YKIjCoLfzaYwOicZA/RWyzzxWmHpUBC7NaBnY+LFMge08e/AKqzluxcN/mdtYMLDOqBweXvPUMWWkwR8aA7pFH6NYsllOm34MOgLm+Z+pclrkNOsGpV/DrOmP5uCSkJgJX1e3EMWCsOhHVUtPqXMkeLpxNbEKNzDG8aIsmA9DblZoXuCtWfmOOE+L7Yse4KfmY2cYAw==","page_age":"1 day ago"},{"type":"web_search_result","title":"Markets News, June 18, 2025: Stocks Close Little Changed After Fed Holds Rates Steady as Investors Monitor News on Israel-Iran Conflict","url":"https://www.investopedia.com/dow-jones-today-06182025-11756849","encrypted_content":"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","page_age":null},{"type":"web_search_result","title":"Weekly Stock Market Update | Edward Jones","url":"https://www.edwardjones.com/us-en/market-news-insights/stock-market-news/stock-market-weekly-update","encrypted_content":"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","page_age":"October 26, 2020"},{"type":"web_search_result","title":"June 2025 US Stock Market Outlook: Has the Storm Passed? | Morningstar","url":"https://www.morningstar.com/markets/june-2025-us-stock-market-outlook-has-storm-passed","encrypted_content":"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","page_age":"2 weeks ago"},{"type":"web_search_result","title":"Stock market today: Dow, S&P 500, Nasdaq stall as Fed holds rates steady, forecasts 2 cuts in 2025","url":"https://finance.yahoo.com/news/live/stock-market-today-dow-sp-500-nasdaq-stall-as-fed-holds-rates-steady-forecasts-2-cuts-in-2025-180946600.html","encrypted_content":"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","page_age":"2 days ago"},{"type":"web_search_result","title":"June 2025 stock market outlook | Fidelity","url":"https://www.fidelity.com/learning-center/trading-investing/stock-market-outlook","encrypted_content":"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","page_age":"2 weeks ago"},{"type":"web_search_result","title":"Markets News, June 10, 2025: Stocks Rise for 3rd Straight Day as Investors Await News on US-China Trade Talks; Tesla, Intel Surge to Pace S&P 500","url":"https://www.investopedia.com/dow-jones-today-06102025-11751328","encrypted_content":"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","page_age":null},{"type":"web_search_result","title":"Markets News, June 3, 2025: Major Indexes Rise as Nvidia Leads Big Gains for Chip Stocks; Nasdaq Back in Positive Territory for 2025","url":"https://www.investopedia.com/dow-jones-today-06032025-11747070","encrypted_content":"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","page_age":null},{"type":"web_search_result","title":"US Markets, Company Earnings, Stock Market Trends, Market News | Morningstar","url":"https://www.morningstar.com/markets","encrypted_content":"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","page_age":null},{"type":"web_search_result","title":"Markets News, June 9, 2025: Stocks Rise as Investors Await News on US-China Trade Talks; S&P 500, Nasdaq Trading at Highest Levels Since February","url":"https://www.investopedia.com/dow-jones-today-06092025-11750420","encrypted_content":"EpIhCioIBBgCIiRiY2JjZWJjMy1lYTFhLTRmNjktYTUwMy01YzgwNWU1Y2U0NzESDIQ0jz/ulBIATIUxshoMKOUiQek4i7Ja8C1DIjB/fentxdWOZIXcGXJs6iHTmfCW9bDK6IOEiboHWhBXU0WlMeW9Z4AXpRQfN2xYORAqlSDuGiqN203b24YfVzvbX+0aN+sU9SV0AyY4lG5k07OmorwzIBezgjd9KO9g6kWeZC4hzTRF5eAkJPCgasmKiqcf8HvVxTq8pMPpZknHTcLU5sO1+s3EIPe1DWXnPZ4huweyKDRxlB8PhY3gMHDQnAoxj1WaAHSOhfdxmhJGwQy3r7fxJtbJ5JRRTbjZIkOQKc8o7NSe2sBE1k4hLCo3swU5c3lFJdDX+HzGraHR3AWbWEgtf0Y4KJGoTSutbH7yI3LyHiiaHWq0S4XWCSfn52E4H5tpABbidQVXKfHKml7+1VxnyxgxnPJSuSm1J4Xw8fzGCRj2NBRC8Y1c+LjyjZIqQiCVc5yTliwCXTh4Rf8VlBwF9+2+fk2COvSqNvVJ/u4KT1X3oqcDwGf/M4bEdVMlZvqArJMC/bTbloGur/ohLFKwRBJsNb777SS8cuzqPRaGI0RYT6f99hH/dSHNNX1okrk56FxiYnZxlwLEbKCmZdF9Q2Mvvb8h9LBvWY6kBXgdiUkZcSBFKCwaRdTle89cOzdk3JRg4owtqO0aT12MAqfLkIJDNwRh7ZOthi+NJeLDaSdnD80aEfC8eicsDpxkXPG5+2UNU2g/F/LrVPgwYCqZ2/vqv4UrPlN4btSOWMpbe5f0G2LU27+awaHqufiI5Oo5Ovg9eTrIMt7dwm30MaWYdTDcPtxNyr6ZmiI6tJVGffKIUhasXz0MmkYxpzbPzrzP13wtpBsysG+SYodklMa3AP8V1bmitfN/ljFjTsZnW7mIvb+Uq3kSgIO4168vgo78va6DMMK4SxMY2T2Sth1zASjh7+m0Y4Kj04/pnZcHTlzmm7lUt2kVtLHElj2DOHMlB5k0w92aoRI2LeKKOVmwjL1zMhBbAf1boynfKUmxyMhR6vF/E7/USZV8tt4vvO/u2lyytwJZCU47s9yE8WlzjsOdbU3OdecXw7fiOlvqij0LPcjSyxjSLr+bW/wkZ+4QUtcbQGG80C1KOs1B4gA2ohPrANWOeB4NiQ+IzJR+d26hrXSMaKUWEcYV3ZuNR1N+jDEWlBi8Z5rfjhB/TG4BCzJNjCYIhFLIOAd6USI/OVIgA+J56fFg8PcE4izRsiA840mc5N9P/5rd7NoeT26n+NRKYjny1HOlePALrzpwJ4Yrq6iW3y0kFujL4Vl1RW2GFf0d4SWaI8nmAHhNvBElSgSqfqc05L2S49i+ZLJ0ht8qQB+Le0Kku3SEVFxTOCMgO26WXkVP2d9Yle9IPR6uaOxfC/8qXm0joECotNeYEcaEsd3au+/lLlXfcCQIrJR8AzJlg2pJNUaWTSCshtoiVf/qVVmDi7xKjUTUGnUvTXwjv15P+nWxN6vnWKYxazj+y6N6HRrJxolZwGDT8dr23KOFPJroLg4Bfzx9HgusS7aZ0UjXJNvxHt/1FmRsmu4Ztj/hn7UrsFuetYhq6fEK3J30aS79qn605tAb4hWeVf1t8Mhdujm1Yg8Q4r4N5SHrqs+qeCYNXdKyvsUSQRDnsjWirduSxyy+q2Kpz5uXT14YHu+UIkshhowxJPYNfH6SbfbEVxupRTsODe9e5K0UbKcbXvq3z8sZS7SUJFl4+umgJUrj2tR56rcpYJKO+5Mr+LLuq4aF9VBkQTUhBvaLuvSezAMjeUUxK5kyJTEY7Pt2A3maU2UxJHIlMRm/F6KvreDDLFJoJrsW77iWK10PG0k3uBAg1VNVCF9y63kI4+yUDpsmhtuvEDw8Wg1N4eS1Ogvxn+YGtmh6rlLp5RAPvnVl47xFZSbRS+NVMh3cNsmU1wDOeekWDMut4HDFyzW1USHyNtmKSCNF9RSsq2ALpEdsTAtb9SlL+dA25ChAbxugbIaSdvRQOVuq8pfDMgtjT7iR5HRbcX2fevcxTl9giTDylNS1EsNTSi2dXPIUVCvLPoqMabhSjFu8WeGMbr1WopCs6XVQD3vtsIhAPKvbKd9sTk78mU3hwcKhqqSRsOfQXSTA2D6N0kRn5BgwgiETxVXw3t0K3rzCOd91//Y+g/25x3+vCZY36BVuSG+06i5aBAA4HvdE9MRBpXe3zU4tgtSAF8ScDA0OPphS4mDPhtR8GSbIGPxMW+tjs9/JgxeCOoK1heweTACKXCjtSKFEP8AMSdTsor5v64tNi0FpH0Vqh3XZp+tGJOdWQYiPL3ZzOhGhPxJnuiZFb0uKALF1w+QUusnhzV07QGt32uRdTt7V/5/L2U6i7FK2KvzwUgzbWkm4v7e2X8vaP8f+w0xWZCCyXxZvUdVnC8HBs+i0P8guv2ob1x7HO83BsPfgYaaYtngzGO0wlDaALCIgW7QrryC92XE+e1mRFSJnoqsBF/z+51q+Hpm4CGdyj/8GBBTSZF+SgBgzuZav0R0APTfisktHTL9Q4KwrhQr5OLuZ8yeBXyUwJkg/ZiBU7SGMzZZsUnhwz51AgxWiB63ITazFzSfcuwuumeQM3BUIcx8Z/KjPnhzWqyyLIw7pLeLar5qYenXySTotxa4oNUsukkrh5DYlF/TDWvN6PX/prWV66vfxkUIdtYaxx9OrVdL5xdTmFMBpxZNaHloch/KGnN/MZacCNMu3vX3GrxPXrEB7fnV61c1Z22MN/UFJTG3ulhh8+xbAuSQuzVpaaCUy5PKhugSxqTALGIzWF1yxq9mG2NgXivnmN9Ju+jRJBMVzGmZMpmPC076yhRvOFPZYHVTSoPl/5ApqbNHLIhCTwjo6L/vyfUekeK7rB4y6iQJ1ymiQcRUZbe1VW78gYJ2LVhhrlQEqkhgzr1XEnv0qXLSiXrbo7WXQ1ENOnOfonDulRTyMieJ4DVB1cnLQlFkzwAzIOwUj2PgiOzL94G/fTwOeOfcFmghK2pFDFnltm43o/4LOtl2Nv52Rmh4PhNZn+eb51R/DjTZuEVt8x1Y4WMttp3QlrCKcYFLL/P5ytS1WYAA2QkBaH/CAWyhfY1CpcMb1u2L67GQ3erXn05+VlBElasIIvSchQMwlbDS5lKE8TP3/x7buwgZJNpTnZBAORulNNceYIx2iQilK8aiCKW2DXwJ/Gj9P9NUzTfSOpc/H5HbjgqGrqCMW8YNaK7XFjbl7MZmrOoxNXkDO63HcaqlbGsPcmG/Wpsi1v7KmvGJGRvYGQ5lIvZ2WGKip/UpgJhCRiamjgN0DGxNJ6j+rD+wXRBrq1aoHCMcxmAcxxTs9rSdgB33XenYWLFrYJz+Xd4QStoYJqj17pbnoPsc5o4DJkOtiDo5FgDs41KoEYs8dbxpltdocXYnSIBvqhBf2iNZNdWX60a58DZK7rv3Oh5w2dzgUhzlP3J/ZskPGeyjH+XO+5+bEXEauLVOzI4MtzSaXGR0dTdoPk4DJsjGmiVuVESqb/Q3Avy1+DQWA7mJ/nTjPtuqAlfgiCgiGvLCIgrcSEtqCahs4w6AXeoLz91PMbAygyJenoRdAT7f6S0btFgX4ivltP5Yi3ITegVCLif+tby+jRXxq4J/5a+8PrBGO6qLnQvEe+dPelP815A6NKA5RvgaFMW0YSgKGwpTnXw8Q3zwU32BjtjOtNS3esEWcS5rAmx0Mfu1ym67cd1g05Ns4dA867z5AMqvwnDuUQcpt6mtXxmv+oaFsWNDTsNC8M+0V7I82eSxdvG2aE/5nqm1m/QbaiyT7mvUKlQGAoZ07brKZe4vaeAy1iSmKzLTUCfEUvwLzFW4cVHydeAOmM+VoKHX+tS68Vakl7/oyu1MURLXrQhO8lWddKMiTYMelhcMBqRz4WNqKeFEFuDTOtiQl+2zEyIcEENf/ixb7MIzoIxoC7WSnzBm8p5YsqNCG/+3DpPMToFDFnyne0+5qWlCqqPjO2zW/XbBM6phUc0iGoZiNtG0u5mgqJFCKA6+6gAAvrSszVvMT6NJphOShjhd0NbH7vZ5nRLtaVKPq9etAVYFi7MrN0d1RuaKBz4VcR84zDs/0HISNUHxXBh0vIRfUTZ264j/HMoKmx4lmYSc8XZ6FkEKFpObgDOZW3A+URFkEUxYV1a2agLUZwWhICDfYgk4VgcUIdp2o49LlP+dRoC/P1x8dM+JvU036Rk9jjdAu/ZwDPPZXeiiQwZiu2ytKpGfYq2bBU7Q1PlEqP+9b+UfXp5Jf/JSfnPTTPz2QKOsY4vMDc6TyJTNV23GR6RzgtqoUlWmzE4GFoEtvmjyEhluj0S/qcIACzWKVr/IvKI9TFeo+1Ds+FXVadNdQh8DlPqkAQMKrYPwkxc8HwK8DOndYeouPBZReKehwpd0aAst2oy5ytDYGBDJ4W1RpS4q/4PxTwffwwsA0B1hE9WcwrqH06pcY1zu4XBIWZwbUg3nASexRax66YV1b6b5TfQqrCJzLTE0r2YfcHqwO19vH1pi7JVEe7/HvH/nV2QEFAFvjKgyFojEUHq4eya0YB/GhqwlLBGsY/91oFMHLwgEtquLuv7UK/ZU4Wrh2ZXtxHer+CFiCEuuuOxVIX+Fu02Wwl23SdM6BtWEnv0EhtYu7EgnJa1ybRJYW+1QsJND/tInImyA7/BD6be9q4DVMFGflcgW/mdtulWVUxS9CKtPX9lbpcpjkobI7lDc2YrVdVhJD9EiFWm21tkhixod9tiebSnP82TwMnylTX0C+tbYKvbL/Ztlz4OS1mXiUemB/ircwIJYBqTa2QSQUJeYZzVt7pvbfBnvV/pGcY7ZMtGizO5ZeRodVm4SpDc2/rH+qYkjJmZhkkjpAFmW/nGguhfyHO4uOat/ITIyqEW6D2z7riIwDgxLUBp8JqZDJzcddpQGy4Tba2rTJrd4C5UkU/G/Tv7ZgVT7FMIVOdjrsBgeLKAGVVcYRDi4EgP8ym9FPmgG5SMWXI2qL4TMwqqyYQwWvC0iI41dh5f/wiogF+QgaivyfPP21qpVcWyx3FIvt8jOu2kJgKWo8+XXZg3HoFqRXaywJXZuzvCTOKSYN6bXVPqNc4+CBaD2DkwdK8wSVYv6gyurLbu4vCGg68iGPnxI1DT5TxGjQT2yxAth5bhYCxIto1CNpwJrErwhtVn8SVXsCR3v/QmpsxTalaIwT8bUQj5Yvcz/dutrpSF+oyEI6q+Er8JimZCCXwpAUzQXijlrt9uPbcpCBFSLLq57b4Z0bynTn/qD2HMLLY3/gNCaCfLUrKEmZ+/Xo+D6FU36CQwOKoXvXoFt4cGL9WAEXMmLijiE9XwbvrYvsp8K0WcrPVK6n0ohx4tUYBhJ7sDAi9umwvQw+HoeiIa+O6fGtQqYs9Iz8RztMQAY1CR6oIY5psC8ui9BMDfh+IH9SYdhyjdx4LIQtk1hA+UMMl8YCnkFutrRDeXpkAvCv6GbskmQLAnOjVdS2vXZhdCX1RxJLW/yWIdaqE73FWUmggg9sHHW53UK2XiRD/pAWMDJs2a75wwNDFN6WufqW4gN5Lz0Ti1LwRHuLpUcUFBhMpOA6GFJ6dXhpVpkUMSPH0HkavS4dJ4uy0ELnFQWJqJhQolfZ585BGAM=","page_age":null}]}}\n\n`,
              `data: {"type":"content_block_stop","index":2}\n\n`,
              `data: {"type":"content_block_start","index":3,"content_block":{"type":"text","text":""}}\n\n`,
              `data: {"type":"content_block_delta","index":3,"delta":{"type":"text_delta","text":"Based on the search results,"}}\n\n`,
              `data: {"type":"content_block_delta","index":3,"delta":{"type":"text_delta","text":" here's a comprehensive overview of current"}}\n\n`,
              `data: {"type":"content_block_delta","index":3,"delta":{"type":"text_delta","text":" stock market trends: \\n\\nMarket Performance:"}}\n\n`,
              `data: {"type":"content_block_stop","index":3}\n\n`,
              `data: {"type":"content_block_start","index":4,"content_block":{"citations":[],"type":"text","text":""}}\n\n`,
              `data: {"type":"content_block_delta","index":4,"delta":{"type":"citations_delta","citation":{"type":"web_search_result_location","cited_text":"Through Friday's close, the S&P 500 was up up 2% since the start of the year, while the Nasdaq Composite had gained 1.1% and the Dow Jones Industrial ...","url":"https://www.investopedia.com/dow-jones-today-06092025-11750420","title":"Markets News, June 9, 2025: Stocks Rise as Investors Await News on US-China Trade Talks; S&P 500, Nasdaq Trading at Highest Levels Since February","encrypted_index":"EpEBCioIBBgCIiRiY2JjZWJjMy1lYTFhLTRmNjktYTUwMy01YzgwNWU1Y2U0NzESDGJyCJ7HnEGjHLeB8hoMsaQDATkym4QTF6g9IjCnRoiZ2XE66u8kx6lBEwocXiyHus1/YL2l9cPwS8Zs/PL9uplW+u0XlETlS0z1ZtYqFQ/TIKRThFDiYozcZ8zgG4IN8pCHLhgE"}}}\n\n`,
              `data: {"type":"content_block_delta","index":4,"delta":{"type":"text_delta","text":"Through recent trading, the major indexes are showing modest gains for 2025:"}}\n\n`,
              `data: {"type":"content_block_stop","index":4}\n\n`,
              `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":19455,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":829,"server_tool_use":{"web_search_requests":1}}}\n\n`,
              `data: {"type":"message_stop"}\n\n`,
            ],
          };

          // Create a model with a predictable generateId function
          const mockProvider = createAnthropic({
            apiKey: 'test-api-key',
            generateId: mockId(),
          });
          const modelWithMockId = mockProvider('claude-3-haiku-20240307');

          const { stream } = await modelWithMockId.doStream({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider-defined',
                id: 'anthropic.web_search_20250305',
                name: 'web_search',
                args: {},
              },
            ],
          });

          expect(await convertReadableStreamToArray(stream)).toMatchSnapshot();
        });
      });
    });

    it('should throw an api error when the server is overloaded', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'error',
        status: 529,
        body: '{"type":"error","error":{"details":null,"type":"overloaded_error","message":"Overloaded"}}',
      };

      await expect(model.doStream({ prompt: TEST_PROMPT })).rejects.toThrow(
        'Overloaded',
      );
    });

    it('should forward overloaded error during streaming', async () => {
      server.urls['https://api.anthropic.com/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"type":"message_start","message":{"id":"msg_01KfpJoAEabmH2iHRRFjQMAG","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
          `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n`,
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
