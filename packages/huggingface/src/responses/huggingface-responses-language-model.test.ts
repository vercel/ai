import { LanguageModelV2Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  createTestServer,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { HuggingFaceResponsesLanguageModel } from './huggingface-responses-language-model';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

function createModel(modelId: string) {
  return new HuggingFaceResponsesLanguageModel(modelId, {
    provider: 'huggingface.responses',
    url: ({ path }) => `https://router.huggingface.co/v1${path}`,
    headers: () => ({ Authorization: `Bearer APIKEY` }),
    generateId: mockId(),
    
  });
}

describe('HuggingFaceResponsesLanguageModel', () => {
  const server = createTestServer({
    'https://router.huggingface.co/v1/responses': {},
  });

  describe('doGenerate', () => {
    describe('basic text response', () => {
      beforeEach(() => {
        server.urls['https://router.huggingface.co/v1/responses'].response = {
          type: 'json-value',
          body: {
            id: 'resp_67c97c0203188190a025beb4a75242bc',
            model: 'deepseek-ai/DeepSeek-V3-0324',
            object: 'response',
            created_at: 1741257730,
            status: 'completed',
            error: null,
            instructions: null,
            max_output_tokens: null,
            metadata: null,
            tool_choice: 'auto',
            tools: [],
            temperature: 1.0,
            top_p: 1.0,
            incomplete_details: null,
            usage: {
              input_tokens: 12,
              output_tokens: 25,
              total_tokens: 37,
            },
            output: [
              {
                id: 'msg_67c97c02656c81908e080dfdf4a03cd1',
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [
                  {
                    type: 'output_text',
                    text: 'Hello! How can I help you today?',
                  },
                ],
              },
            ],
            output_text: 'Hello! How can I help you today?',
          },
        };
      });

      it('should generate text', async () => {
        const result = await createModel(
          'deepseek-ai/DeepSeek-V3-0324',
        ).doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": {
                "huggingface": {
                  "itemId": "msg_67c97c02656c81908e080dfdf4a03cd1",
                },
              },
              "text": "Hello! How can I help you today?",
              "type": "text",
            },
          ]
        `);
      });

      it('should extract usage', async () => {
        const result = await createModel(
          'deepseek-ai/DeepSeek-V3-0324',
        ).doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.usage).toMatchInlineSnapshot(`
          {
            "inputTokens": 12,
            "outputTokens": 25,
            "totalTokens": 37,
          }
        `);
      });

      it('should extract text from output array when output_text is missing', async () => {
        server.urls['https://router.huggingface.co/v1/responses'].response = {
          type: 'json-value',
          body: {
            id: 'resp_test',
            model: 'deepseek-ai/DeepSeek-V3-0324',
            object: 'response',
            created_at: 1741257730,
            status: 'completed',
            error: null,
            instructions: null,
            max_output_tokens: null,
            metadata: null,
            tool_choice: 'auto',
            tools: [],
            temperature: 1.0,
            top_p: 1.0,
            incomplete_details: null,
            usage: null,
            output: [
              {
                id: 'msg_test',
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [
                  {
                    type: 'output_text',
                    text: 'Extracted from output array',
                  },
                ],
              },
            ],
            output_text: null,
          },
        };

        const result = await createModel(
          'deepseek-ai/DeepSeek-V3-0324',
        ).doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": {
                "huggingface": {
                  "itemId": "msg_test",
                },
              },
              "text": "Extracted from output array",
              "type": "text",
            },
          ]
        `);
      });

      it('should handle missing usage gracefully', async () => {
        server.urls['https://router.huggingface.co/v1/responses'].response = {
          type: 'json-value',
          body: {
            id: 'resp_test',
            model: 'deepseek-ai/DeepSeek-V3-0324',
            object: 'response',
            created_at: 1741257730,
            status: 'completed',
            error: null,
            instructions: null,
            max_output_tokens: null,
            metadata: null,
            tool_choice: 'auto',
            tools: [],
            temperature: 1.0,
            top_p: 1.0,
            incomplete_details: null,
            usage: null,
            output: [],
            output_text: 'Test response',
          },
        };

        const result = await createModel(
          'deepseek-ai/DeepSeek-V3-0324',
        ).doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.usage).toMatchInlineSnapshot(`
          {
            "inputTokens": 0,
            "outputTokens": 0,
            "totalTokens": 0,
          }
        `);
      });

      it('should send model id, settings, and input', async () => {
        await createModel('deepseek-ai/DeepSeek-V3-0324').doGenerate({
          prompt: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
          temperature: 0.5,
          topP: 0.3,
          maxOutputTokens: 100,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: 'deepseek-ai/DeepSeek-V3-0324',
          temperature: 0.5,
          top_p: 0.3,
          max_output_tokens: 100,
          stream: false,
          input: [
            { role: 'system', content: 'You are a helpful assistant.' },
            {
              role: 'user',
              content: [{ type: 'input_text', text: 'Hello' }],
            },
          ],
        });
      });

      it('should handle unsupported settings with warnings', async () => {
        const { warnings } = await createModel(
          'deepseek-ai/DeepSeek-V3-0324',
        ).doGenerate({
          prompt: TEST_PROMPT,
          topK: 10,
          seed: 123,
          presencePenalty: 0.5,
          frequencyPenalty: 0.3,
          stopSequences: ['stop'],
        });

        expect(warnings).toMatchInlineSnapshot(`
          [
            {
              "setting": "topK",
              "type": "unsupported-setting",
            },
            {
              "setting": "seed",
              "type": "unsupported-setting",
            },
            {
              "setting": "presencePenalty",
              "type": "unsupported-setting",
            },
            {
              "setting": "frequencyPenalty",
              "type": "unsupported-setting",
            },
            {
              "setting": "stopSequences",
              "type": "unsupported-setting",
            },
          ]
        `);
      });

      it('should generate text and sources from annotations', async () => {
        server.urls['https://router.huggingface.co/v1/responses'].response = {
          type: 'json-value',
          body: {
            id: 'resp_test_annotations',
            model: 'deepseek-ai/DeepSeek-V3-0324',
            object: 'response',
            created_at: 1741257730,
            status: 'completed',
            error: null,
            instructions: null,
            max_output_tokens: null,
            metadata: null,
            tool_choice: 'auto',
            tools: [],
            temperature: 1.0,
            top_p: 1.0,
            incomplete_details: null,
            usage: {
              input_tokens: 20,
              output_tokens: 50,
              total_tokens: 70,
            },
            output: [
              {
                id: 'msg_test_annotations',
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [
                  {
                    type: 'output_text',
                    text: 'Here are some recent articles about AI: The first article discusses new developments ([example.com](https://example.com/article1)). Another piece covers industry trends ([test.com](https://test.com/article2)).',
                    annotations: [
                      {
                        type: 'url_citation',
                        url: 'https://example.com/article1',
                        title: 'AI Developments Article',
                      },
                      {
                        type: 'url_citation',
                        url: 'https://test.com/article2',
                        title: 'Industry Trends Report',
                      },
                    ],
                  },
                ],
              },
            ],
            output_text: null,
          },
        };

        const result = await createModel(
          'deepseek-ai/DeepSeek-V3-0324',
        ).doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "providerMetadata": {
                "huggingface": {
                  "itemId": "msg_test_annotations",
                },
              },
              "text": "Here are some recent articles about AI: The first article discusses new developments ([example.com](https://example.com/article1)). Another piece covers industry trends ([test.com](https://test.com/article2)).",
              "type": "text",
            },
            {
              "id": "id-0",
              "sourceType": "url",
              "title": "AI Developments Article",
              "type": "source",
              "url": "https://example.com/article1",
            },
            {
              "id": "id-1",
              "sourceType": "url",
              "title": "Industry Trends Report",
              "type": "source",
              "url": "https://test.com/article2",
            },
          ]
        `);
      });

      it('should handle MCP tools with annotations', async () => {
        server.urls['https://router.huggingface.co/v1/responses'].response = {
          type: 'json-value',
          body: {
            id: 'resp_mcp_test',
            model: 'deepseek-ai/DeepSeek-V3-0324',
            object: 'response',
            created_at: 1741257730,
            status: 'completed',
            error: null,
            instructions: null,
            max_output_tokens: null,
            metadata: null,
            tool_choice: 'auto',
            tools: [],
            temperature: 1.0,
            top_p: 1.0,
            incomplete_details: null,
            usage: {
              input_tokens: 50,
              output_tokens: 100,
              total_tokens: 150,
            },
            output: [
              {
                id: 'mcp_search_test',
                type: 'mcp_call',
                server_label: 'web_search',
                name: 'search',
                arguments: '{"query": "San Francisco tech events"}',
                output: 'Found 25 tech events in San Francisco',
              },
              {
                id: 'msg_mcp_response',
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [
                  {
                    type: 'output_text',
                    text: 'Based on the search results, here are the latest tech events in San Francisco: There are several AI conferences ([techevents.com](https://techevents.com/sf-ai)) and startup meetups ([eventbrite.com](https://eventbrite.com/sf-startups)) happening this week.',
                    annotations: [
                      {
                        type: 'url_citation',
                        url: 'https://techevents.com/sf-ai',
                        title: 'SF AI Conference 2025',
                      },
                      {
                        type: 'url_citation',
                        url: 'https://eventbrite.com/sf-startups',
                        title: 'SF Startup Meetups',
                      },
                    ],
                  },
                ],
              },
            ],
            output_text: null,
          },
        };

        const result = await createModel(
          'deepseek-ai/DeepSeek-V3-0324',
        ).doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "input": "{"query": "San Francisco tech events"}",
              "providerExecuted": true,
              "toolCallId": "mcp_search_test",
              "toolName": "search",
              "type": "tool-call",
            },
            {
              "providerExecuted": true,
              "result": "Found 25 tech events in San Francisco",
              "toolCallId": "mcp_search_test",
              "toolName": "search",
              "type": "tool-result",
            },
            {
              "providerMetadata": {
                "huggingface": {
                  "itemId": "msg_mcp_response",
                },
              },
              "text": "Based on the search results, here are the latest tech events in San Francisco: There are several AI conferences ([techevents.com](https://techevents.com/sf-ai)) and startup meetups ([eventbrite.com](https://eventbrite.com/sf-startups)) happening this week.",
              "type": "text",
            },
            {
              "id": "id-0",
              "sourceType": "url",
              "title": "SF AI Conference 2025",
              "type": "source",
              "url": "https://techevents.com/sf-ai",
            },
            {
              "id": "id-1",
              "sourceType": "url",
              "title": "SF Startup Meetups",
              "type": "source",
              "url": "https://eventbrite.com/sf-startups",
            },
          ]
        `);
      });
    });
  });

  describe('doStream', () => {
    it('should stream text deltas', async () => {
      server.urls['https://router.huggingface.co/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.created","response":{"id":"resp_test","object":"response","created_at":1741269019,"status":"in_progress","model":"deepseek-ai/DeepSeek-V3-0324"}}\n\n`,
          `data:{"type":"response.in_progress","response":{"id":"resp_test","object":"response","created_at":1741269019,"status":"in_progress"}}\n\n`,
          `data:{"type":"response.output_item.added","output_index":0,"item":{"id":"msg_test","type":"message","role":"assistant","status":"in_progress","content":[]},"sequence_number":1}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_test","output_index":0,"content_index":0,"delta":"Hello,","sequence_number":2}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_test","output_index":0,"content_index":0,"delta":" World!","sequence_number":3}\n\n`,
          `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"msg_test","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"Hello, World!"}]},"sequence_number":4}\n\n`,
          `data:{"type":"response.completed","response":{"id":"resp_test","model":"deepseek-ai/DeepSeek-V3-0324","object":"response","created_at":1741269112,"status":"completed","incomplete_details":null,"usage":{"input_tokens":12,"output_tokens":25,"total_tokens":37},"output":[{"id":"msg_test","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"Hello, World!"}]}]},"sequence_number":5}\n\n`,
        ],
      };

      const { stream } = await createModel(
        'deepseek-ai/DeepSeek-V3-0324',
      ).doStream({
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "resp_test",
            "modelId": "deepseek-ai/DeepSeek-V3-0324",
            "timestamp": 2025-03-06T13:50:19.000Z,
            "type": "response-metadata",
          },
          {
            "id": "msg_test",
            "providerMetadata": {
              "huggingface": {
                "itemId": "msg_test",
              },
            },
            "type": "text-start",
          },
          {
            "delta": "Hello,",
            "id": "msg_test",
            "type": "text-delta",
          },
          {
            "delta": " World!",
            "id": "msg_test",
            "type": "text-delta",
          },
          {
            "id": "msg_test",
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "providerMetadata": {
              "huggingface": {
                "responseId": "resp_test",
              },
            },
            "type": "finish",
            "usage": {
              "inputTokens": 12,
              "outputTokens": 25,
              "totalTokens": 37,
            },
          },
        ]
      `);
    });

    it('should handle streaming without usage', async () => {
      server.urls['https://router.huggingface.co/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.output_item.added","output_index":0,"item":{"id":"msg_test","type":"message","role":"assistant","status":"in_progress"},"sequence_number":1}\n\n`,
          `data:{"type":"response.output_text.delta","item_id":"msg_test","output_index":0,"content_index":0,"delta":"Hi!","sequence_number":2}\n\n`,
          `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"msg_test","type":"message","role":"assistant","status":"completed"},"sequence_number":3}\n\n`,
          `data:{"type":"response.completed","response":{"id":"resp_test","status":"completed","incomplete_details":null,"usage":null},"sequence_number":4}\n\n`,
        ],
      };

      const { stream } = await createModel(
        'deepseek-ai/DeepSeek-V3-0324',
      ).doStream({
        prompt: TEST_PROMPT,
      });

      const chunks = await convertReadableStreamToArray(stream);
      const finishChunk = chunks.find(chunk => chunk.type === 'finish');

      expect(finishChunk?.usage).toMatchInlineSnapshot(`
        {
          "inputTokens": undefined,
          "outputTokens": undefined,
          "totalTokens": undefined,
        }
      `);
    });

    it('should handle non-message item types', async () => {
      server.urls['https://router.huggingface.co/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.output_item.added","output_index":0,"item":{"id":"mcp_test","type":"mcp_list_tools","server_label":"test"},"sequence_number":1}\n\n`,
          `data:{"type":"response.output_item.done","output_index":0,"item":{"id":"mcp_test","type":"mcp_list_tools","server_label":"test"},"sequence_number":2}\n\n`,
          `data:{"type":"response.completed","response":{"id":"resp_test","status":"completed","incomplete_details":null},"sequence_number":3}\n\n`,
        ],
      };

      const { stream } = await createModel(
        'deepseek-ai/DeepSeek-V3-0324',
      ).doStream({
        prompt: TEST_PROMPT,
      });

      const chunks = await convertReadableStreamToArray(stream);

      // Should only have stream-start and finish events (no text events for non-message items)
      expect(chunks.map(chunk => chunk.type)).toEqual([
        'stream-start',
        'finish',
      ]);
    });

    it('should handle streaming errors', async () => {
      server.urls['https://router.huggingface.co/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.output_item.added","output_index":0,"item":{"id":"msg_test","type":"message","role":"assistant"},"sequence_number":1}\n\n`,
          `data:invalid json}\n\n`, // malformed JSON that will cause parsing error
        ],
      };

      const { stream } = await createModel(
        'deepseek-ai/DeepSeek-V3-0324',
      ).doStream({
        prompt: TEST_PROMPT,
      });

      const chunks = await convertReadableStreamToArray(stream);
      const errorChunk = chunks.find(chunk => chunk.type === 'error');
      const finishChunk = chunks.find(chunk => chunk.type === 'finish');

      expect(errorChunk).toBeDefined();
      expect(errorChunk?.type).toBe('error');
      expect(finishChunk?.finishReason).toBe('error');
    });

    it('should send correct streaming request', async () => {
      server.urls['https://router.huggingface.co/v1/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          `data:{"type":"response.completed","response":{"id":"resp_test","status":"completed"},"sequence_number":1}\n\n`,
        ],
      };

      await createModel('deepseek-ai/DeepSeek-V3-0324').doStream({
        prompt: TEST_PROMPT,
        temperature: 0.7,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'deepseek-ai/DeepSeek-V3-0324',
        temperature: 0.7,
        stream: true,
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: 'Hello' }],
          },
        ],
      });
    });
  });

  describe('message conversion', () => {
    beforeEach(() => {
      server.urls['https://router.huggingface.co/v1/responses'].response = {
        type: 'json-value',
        body: {
          id: 'resp_test',
          model: 'moonshotai/Kimi-K2-Instruct',
          object: 'response',
          created_at: 1741257730,
          status: 'completed',
          error: null,
          instructions: null,
          max_output_tokens: null,
          metadata: null,
          tool_choice: 'auto',
          tools: [],
          temperature: 1.0,
          top_p: 1.0,
          incomplete_details: null,
          usage: null,
          output: [],
          output_text: 'Test response',
        },
      };
    });

    it('should convert user messages with images', async () => {
      await createModel('deepseek-ai/DeepSeek-V3-0324').doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What do you see?' },
              {
                type: 'file',
                mediaType: 'image/jpeg',
                data: 'AQIDBA==',
              },
            ],
          },
        ],
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input[0].content).toMatchInlineSnapshot(`
        [
          {
            "text": "What do you see?",
            "type": "input_text",
          },
          {
            "image_url": "data:image/jpeg;base64,AQIDBA==",
            "type": "input_image",
          },
        ]
      `);
    });

    it('should handle assistant messages', async () => {
      await createModel('deepseek-ai/DeepSeek-V3-0324').doGenerate({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
          { role: 'user', content: [{ type: 'text', text: 'How are you?' }] },
        ],
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Hello",
                "type": "input_text",
              },
            ],
            "role": "user",
          },
          {
            "content": [
              {
                "text": "Hi there!",
                "type": "output_text",
              },
            ],
            "role": "assistant",
          },
          {
            "content": [
              {
                "text": "How are you?",
                "type": "input_text",
              },
            ],
            "role": "user",
          },
        ]
      `);
    });

    it('should warn about unsupported assistant content types', async () => {
      const { warnings } = await createModel(
        'deepseek-ai/DeepSeek-V3-0324',
      ).doGenerate({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'test',
                toolName: 'test',
                input: {},
              },
              {
                type: 'tool-result',
                toolCallId: 'test',
                toolName: 'test',
                output: { type: 'text', value: 'test' },
              },
              { type: 'reasoning', text: 'thinking...' },
            ],
          },
        ],
      });

      expect(warnings).toMatchInlineSnapshot(`
        [
          {
            "setting": "tool-calls in assistant messages",
            "type": "unsupported-setting",
          },
          {
            "message": "tool result parts in assistant messages are not supported for HuggingFace responses",
            "type": "other",
          },
          {
            "message": "reasoning parts are not supported for HuggingFace responses",
            "type": "other",
          },
        ]
      `);
    });

    it('should warn about tool messages', async () => {
      const { warnings } = await createModel(
        'deepseek-ai/DeepSeek-V3-0324',
      ).doGenerate({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'test',
                toolName: 'test',
                output: { type: 'text', value: 'test' },
              },
            ],
          },
        ],
      });

      expect(warnings).toMatchInlineSnapshot(`
        [
          {
            "setting": "tool messages",
            "type": "unsupported-setting",
          },
        ]
      `);
    });
  });
});
