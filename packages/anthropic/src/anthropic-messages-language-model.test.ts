import {
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  createTestServer,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { AnthropicProviderOptions } from './anthropic-messages-options';
import { createAnthropic } from './anthropic-provider';
import { type DocumentCitation } from './anthropic-messages-language-model';
import { APICallError } from '@ai-sdk/provider';

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
      usage?: {
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
            "toolCallType": "function",
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

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
        'x-api-key': 'test-api-key',
      });
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

    describe('Anthropic Web Search Server-Side Tool', () => {
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
              type: 'provider-defined-server',
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
              type: 'provider-defined-server',
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
              type: 'provider-defined-server',
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
              type: 'provider-defined-server',
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
              type: 'provider-defined-server',
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
              type: 'provider-defined-server',
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
              "toolCallId": "tool_1",
              "toolCallType": "function",
              "toolName": "web_search",
              "type": "tool-call",
            },
            {
              "id": "id-0",
              "providerMetadata": {
                "anthropic": {
                  "encryptedContent": "encrypted_content_123",
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

        await expect(() =>
          model.doGenerate({
            prompt: TEST_PROMPT,
            tools: [
              {
                type: 'provider-defined-server',
                id: 'anthropic.web_search_20250305',
                name: 'web_search',
                args: {
                  maxUses: 1,
                },
              },
            ],
          }),
        ).rejects.toThrow(APICallError);
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
              type: 'provider-defined-server',
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
          includeRawChunks: false,
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
              "text": "",
              "type": "text",
            },
            {
              "text": "{"value",
              "type": "text",
            },
            {
              "text": "":",
              "type": "text",
            },
            {
              "text": ""Spark",
              "type": "text",
            },
            {
              "text": "le",
              "type": "text",
            },
            {
              "text": " Day"}",
              "type": "text",
            },
            {
              "finishReason": "stop",
              "providerMetadata": {
                "anthropic": {
                  "cacheCreationInputTokens": null,
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
        includeRawChunks: false,
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
            "text": "Hello",
            "type": "text",
          },
          {
            "text": ", ",
            "type": "text",
          },
          {
            "text": "World!",
            "type": "text",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "anthropic": {
                "cacheCreationInputTokens": null,
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
        includeRawChunks: false,
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
            "text": "I am",
            "type": "reasoning",
          },
          {
            "text": "thinking...",
            "type": "reasoning",
          },
          {
            "providerMetadata": {
              "anthropic": {
                "signature": "1234567890",
              },
            },
            "text": "",
            "type": "reasoning",
          },
          {
            "type": "reasoning-part-finish",
          },
          {
            "text": "Hello, World!",
            "type": "text",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "anthropic": {
                "cacheCreationInputTokens": null,
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
        includeRawChunks: false,
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
            "providerMetadata": {
              "anthropic": {
                "redactedData": "redacted-thinking-data",
              },
            },
            "text": "",
            "type": "reasoning",
          },
          {
            "type": "reasoning-part-finish",
          },
          {
            "text": "Hello, World!",
            "type": "text",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "anthropic": {
                "cacheCreationInputTokens": null,
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
        includeRawChunks: false,
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
            "text": "Hello, World!",
            "type": "text",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "anthropic": {
                "cacheCreationInputTokens": null,
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
        includeRawChunks: false,
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
            "text": "Okay",
            "type": "text",
          },
          {
            "text": "!",
            "type": "text",
          },
          {
            "inputTextDelta": "",
            "toolCallId": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "toolCallType": "function",
            "toolName": "test-tool",
            "type": "tool-call-delta",
          },
          {
            "inputTextDelta": "{"value",
            "toolCallId": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "toolCallType": "function",
            "toolName": "test-tool",
            "type": "tool-call-delta",
          },
          {
            "inputTextDelta": "":",
            "toolCallId": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "toolCallType": "function",
            "toolName": "test-tool",
            "type": "tool-call-delta",
          },
          {
            "inputTextDelta": ""Spark",
            "toolCallId": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "toolCallType": "function",
            "toolName": "test-tool",
            "type": "tool-call-delta",
          },
          {
            "inputTextDelta": "le",
            "toolCallId": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "toolCallType": "function",
            "toolName": "test-tool",
            "type": "tool-call-delta",
          },
          {
            "inputTextDelta": " Day"}",
            "toolCallId": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "toolCallType": "function",
            "toolName": "test-tool",
            "type": "tool-call-delta",
          },
          {
            "input": "{"value":"Sparkle Day"}",
            "toolCallId": "toolu_01DBsB4vvYLnBDzZ5rBSxSLs",
            "toolCallType": "function",
            "toolName": "test-tool",
            "type": "tool-call",
          },
          {
            "finishReason": "tool-calls",
            "providerMetadata": {
              "anthropic": {
                "cacheCreationInputTokens": null,
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
        includeRawChunks: false,
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
        includeRawChunks: false,
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
        includeRawChunks: false,
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
        'x-api-key': 'test-api-key',
      });
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
        includeRawChunks: false,
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
            "text": "Hello",
            "type": "text",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "anthropic": {
                "cacheCreationInputTokens": 10,
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
        includeRawChunks: false,
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
        includeRawChunks: false,
      });

      const chunks = await convertReadableStreamToArray(stream);
      expect(chunks.filter(chunk => chunk.type === 'raw')).toHaveLength(0);
    });

    it('should process PDF citation responses in streaming', async () => {
      // Create a model with predictable ID generation for testing
      const mockProvider = createAnthropic({
        apiKey: 'test-api-key',
        generateId: () => 'test-citation-id-stream',
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
        includeRawChunks: false,
      });

      const result = await convertReadableStreamToArray(stream);

      // Verify we get the expected streaming parts
      expect(result).toHaveLength(6);

      // Verify text content
      expect(result[2]).toMatchInlineSnapshot(`
        {
          "text": "Based on the document",
          "type": "text",
        }
      `);

      expect(result[3]).toMatchInlineSnapshot(`
        {
          "text": ", results show growth.",
          "type": "text",
        }
      `);

      // Verify citation source
      expect(result[4]).toMatchInlineSnapshot(`
        {
          "filename": "financial-report.pdf",
          "id": "test-citation-id-stream",
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
        }
      `);
    });
  });
});
