import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  createTestServer,
} from '@ai-sdk/provider-utils/test';
import { createAnthropic } from './anthropic-provider';
import { AnthropicProviderOptions } from './anthropic-messages-language-model';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createAnthropic({ apiKey: 'test-api-key' });
const model = provider('claude-3-haiku-20240307');

describe('AnthropicMessagesLanguageModel', () => {
  const server = createTestServer({
    'https://api.anthropic.com/v1/messages': {},
  });

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
          citations?: Array<{
            type: 'web_search_result_location';
            url: string;
            title: string;
            encrypted_index: string;
            cited_text: string;
          }>;
        }
      | { type: 'thinking'; thinking: string; signature: string }
      | { type: 'tool_use'; id: string; name: string; input: unknown }
      | { type: 'server_tool_use'; id: string; name: string; input: unknown }
      | {
          type: 'web_search_tool_result';
          tool_use_id: string;
          content: Array<{
            type: 'web_search_result';
            url: string;
            title: string;
            encrypted_content: string;
            page_age: string | null;
          }>;
        }
    >;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      server_tool_use?: {
        web_search_requests?: number;
      };
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

  describe('doGenerate', () => {
    describe('reasoning (thinking enabled)', () => {
      it('should pass thinking config; add budget tokens; clear out temperature, top_p, top_k; and return warnings', async () => {
        prepareJsonResponse({
          content: [{ type: 'text', text: 'Hello, World!' }],
        });

        const result = await model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
          temperature: 0.5,
          topP: 0.7,
          topK: 0.1,
          providerMetadata: {
            anthropic: {
              thinking: { type: 'enabled', budgetTokens: 1000 },
            } satisfies AnthropicProviderOptions,
          },
        });

        expect(await server.calls[0].requestBody).toStrictEqual({
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
    });

    it('should extract text response', async () => {
      prepareJsonResponse({
        content: [{ type: 'text', text: 'Hello, World!' }],
      });

      const { text } = await provider('claude-3-haiku-20240307').doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(text).toStrictEqual('Hello, World!');
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

      const { reasoning, text } = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(reasoning).toStrictEqual([
        {
          type: 'text',
          text: 'I am thinking...',
          signature: '1234567890',
        },
      ]);
      expect(text).toStrictEqual('Hello, World!');
    });

    it('should return undefined reasoning when no thinking is present', async () => {
      prepareJsonResponse({
        content: [{ type: 'text', text: 'Hello, World!' }],
      });

      const { reasoning } = await provider(
        'claude-3-haiku-20240307',
      ).doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(reasoning).toBeUndefined();
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

      const { toolCalls, finishReason, text } = await model.doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'regular',
          tools: [
            {
              type: 'function',
              name: 'test-tool',
              parameters: {
                type: 'object',
                properties: { value: { type: 'string' } },
                required: ['value'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          ],
        },
        prompt: TEST_PROMPT,
      });

      expect(toolCalls).toStrictEqual([
        {
          toolCallId: 'toolu_1',
          toolCallType: 'function',
          toolName: 'test-tool',
          args: '{"value":"example value"}',
        },
      ]);
      expect(text).toStrictEqual('Some text\n\n');
      expect(finishReason).toStrictEqual('tool-calls');
    });

    it('should support object-tool mode', async () => {
      prepareJsonResponse({
        content: [
          { type: 'text', text: 'Some text\n\n' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'json',
            input: { value: 'example value' },
          },
        ],
        stopReason: 'tool_use',
      });

      const { toolCalls, finishReason } = await model.doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'object-tool',
          tool: {
            type: 'function',
            name: 'json',
            description: 'Respond with a JSON object.',
            parameters: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        },
        prompt: TEST_PROMPT,
      });

      expect(toolCalls).toStrictEqual([
        {
          toolCallId: 'toolu_1',
          toolCallType: 'function',
          toolName: 'json',
          args: '{"value":"example value"}',
        },
      ]);
      expect(finishReason).toStrictEqual('tool-calls');

      // check request to Anthropic
      expect(await server.calls[0].requestBody).toStrictEqual({
        max_tokens: 4096,
        messages: [
          {
            content: [{ text: 'Hello', type: 'text' }],
            role: 'user',
          },
        ],
        model: 'claude-3-haiku-20240307',
        tool_choice: { name: 'json', type: 'tool' },
        tools: [
          {
            description: 'Respond with a JSON object.',
            input_schema: {
              $schema: 'http://json-schema.org/draft-07/schema#',
              additionalProperties: false,
              properties: { value: { type: 'string' } },
              required: ['value'],
              type: 'object',
            },
            name: 'json',
          },
        ],
      });
    });

    it('should extract usage', async () => {
      prepareJsonResponse({
        usage: { input_tokens: 20, output_tokens: 5 },
      });

      const { usage } = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(usage).toStrictEqual({
        promptTokens: 20,
        completionTokens: 5,
      });
    });

    it('should send additional response information', async () => {
      prepareJsonResponse({
        id: 'test-id',
        model: 'test-model',
      });

      const { response } = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(response).toStrictEqual({
        id: 'test-id',
        modelId: 'test-model',
      });
    });

    it('should expose the raw response headers', async () => {
      prepareJsonResponse({
        headers: {
          'test-header': 'test-value',
        },
      });

      const { rawResponse } = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(rawResponse?.headers).toStrictEqual({
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        temperature: 0.5,
        maxTokens: 100,
        topP: 0.9,
        topK: 0.1,
        stopSequences: ['abc', 'def'],
        frequencyPenalty: 0.15,
      });

      expect(await server.calls[0].requestBody).toStrictEqual({
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
        inputFormat: 'prompt',
        mode: {
          type: 'regular',
          tools: [
            {
              type: 'function',
              name: 'test-tool',
              parameters: {
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
        },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBody).toStrictEqual({
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(await server.calls[0].requestHeaders).toStrictEqual({
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
        mode: { type: 'regular' },
        inputFormat: 'messages',
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            providerMetadata: {
              anthropic: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
        ],
      });

      expect(await server.calls[0].requestBody).toStrictEqual({
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

      expect(result.providerMetadata).toStrictEqual({
        anthropic: {
          cacheCreationInputTokens: 10,
          cacheReadInputTokens: 5,
        },
      });
    });

    it('should send request body', async () => {
      prepareJsonResponse({ content: [] });

      const { request } = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(request).toStrictEqual({
        body: '{"model":"claude-3-haiku-20240307","max_tokens":4096,"messages":[{"role":"user","content":[{"type":"text","text":"Hello"}]}]}',
      });
    });
  });

  describe('doStream', () => {
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toStrictEqual([
        {
          id: 'msg_01KfpJoAEabmH2iHRRFjQMAG',
          modelId: 'claude-3-haiku-20240307',
          type: 'response-metadata',
        },
        { textDelta: 'Hello', type: 'text-delta' },
        { textDelta: ', ', type: 'text-delta' },
        { textDelta: 'World!', type: 'text-delta' },
        {
          finishReason: 'stop',
          providerMetadata: {
            anthropic: {
              cacheCreationInputTokens: null,
              cacheReadInputTokens: null,
            },
          },
          type: 'finish',
          usage: {
            completionTokens: 227,
            promptTokens: 17,
          },
        },
      ]);
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toStrictEqual([
        {
          type: 'response-metadata',
          id: 'msg_01KfpJoAEabmH2iHRRFjQMAG',
          modelId: 'claude-3-haiku-20240307',
        },
        { type: 'reasoning', textDelta: 'I am' },
        { type: 'reasoning', textDelta: 'thinking...' },
        { type: 'reasoning-signature', signature: '1234567890' },
        { type: 'text-delta', textDelta: 'Hello, World!' },
        {
          finishReason: 'stop',
          providerMetadata: {
            anthropic: {
              cacheCreationInputTokens: null,
              cacheReadInputTokens: null,
            },
          },
          type: 'finish',
          usage: {
            completionTokens: 227,
            promptTokens: 17,
          },
        },
      ]);
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toStrictEqual([
        {
          type: 'response-metadata',
          id: 'msg_01KfpJoAEabmH2iHRRFjQMAG',
          modelId: 'claude-3-haiku-20240307',
        },
        { type: 'redacted-reasoning', data: 'redacted-thinking-data' },
        { type: 'text-delta', textDelta: 'Hello, World!' },
        {
          finishReason: 'stop',
          providerMetadata: {
            anthropic: {
              cacheCreationInputTokens: null,
              cacheReadInputTokens: null,
            },
          },
          type: 'finish',
          usage: {
            completionTokens: 227,
            promptTokens: 17,
          },
        },
      ]);
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toStrictEqual([
        {
          type: 'response-metadata',
          id: 'msg_01KfpJoAEabmH2iHRRFjQMAG',
          modelId: 'claude-3-haiku-20240307',
        },
        { type: 'text-delta', textDelta: 'Hello, World!' },
        {
          finishReason: 'stop',
          providerMetadata: {
            anthropic: {
              cacheCreationInputTokens: null,
              cacheReadInputTokens: null,
            },
          },
          type: 'finish',
          usage: {
            completionTokens: 227,
            promptTokens: 17,
          },
        },
      ]);
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
        inputFormat: 'prompt',
        mode: {
          type: 'regular',
          tools: [
            {
              type: 'function',
              name: 'test-tool',
              parameters: {
                type: 'object',
                properties: { value: { type: 'string' } },
                required: ['value'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          ],
        },
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toStrictEqual([
        {
          type: 'response-metadata',
          id: 'msg_01GouTqNCGXzrj5LQ5jEkw67',
          modelId: 'claude-3-haiku-20240307',
        },
        {
          type: 'text-delta',
          textDelta: 'Okay',
        },
        {
          type: 'text-delta',
          textDelta: '!',
        },
        {
          type: 'tool-call-delta',
          toolCallId: 'toolu_01DBsB4vvYLnBDzZ5rBSxSLs',
          toolCallType: 'function',
          toolName: 'test-tool',
          argsTextDelta: '',
        },
        {
          type: 'tool-call-delta',
          toolCallId: 'toolu_01DBsB4vvYLnBDzZ5rBSxSLs',
          toolCallType: 'function',
          toolName: 'test-tool',
          argsTextDelta: '{"value',
        },
        {
          type: 'tool-call-delta',
          toolCallId: 'toolu_01DBsB4vvYLnBDzZ5rBSxSLs',
          toolCallType: 'function',
          toolName: 'test-tool',
          argsTextDelta: '":',
        },
        {
          type: 'tool-call-delta',
          toolCallId: 'toolu_01DBsB4vvYLnBDzZ5rBSxSLs',
          toolCallType: 'function',
          toolName: 'test-tool',
          argsTextDelta: '"Spark',
        },
        {
          type: 'tool-call-delta',
          toolCallId: 'toolu_01DBsB4vvYLnBDzZ5rBSxSLs',
          toolCallType: 'function',
          toolName: 'test-tool',
          argsTextDelta: 'le',
        },
        {
          type: 'tool-call-delta',
          toolCallId: 'toolu_01DBsB4vvYLnBDzZ5rBSxSLs',
          toolCallType: 'function',
          toolName: 'test-tool',
          argsTextDelta: ' Day"}',
        },
        {
          type: 'tool-call',
          toolCallId: 'toolu_01DBsB4vvYLnBDzZ5rBSxSLs',
          toolCallType: 'function',
          toolName: 'test-tool',
          args: '{"value":"Sparkle Day"}',
        },
        {
          finishReason: 'tool-calls',
          providerMetadata: {
            anthropic: {
              cacheCreationInputTokens: null,
              cacheReadInputTokens: null,
            },
          },
          type: 'finish',
          usage: {
            completionTokens: 65,
            promptTokens: 441,
          },
        },
      ]);
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toStrictEqual([
        {
          type: 'response-metadata',
          id: 'msg_01KfpJoAEabmH2iHRRFjQMAG',
          modelId: 'claude-3-haiku-20240307',
        },
        { type: 'error', error: { type: 'error', message: 'test error' } },
      ]);
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

      const { rawResponse } = await model.doStream({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(rawResponse?.headers).toStrictEqual({
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBody).toStrictEqual({
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      // note: space moved to last chunk bc of trimming
      expect(await convertReadableStreamToArray(stream)).toStrictEqual([
        {
          type: 'response-metadata',
          id: 'msg_01KfpJoAEabmH2iHRRFjQMAG',
          modelId: 'claude-3-haiku-20240307',
        },
        { type: 'text-delta', textDelta: 'Hello' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 17, completionTokens: 227 },
          providerMetadata: {
            anthropic: {
              cacheCreationInputTokens: 10,
              cacheReadInputTokens: 5,
            },
          },
        },
      ]);
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
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(request).toStrictEqual({
        body: '{"model":"claude-3-haiku-20240307","max_tokens":4096,"messages":[{"role":"user","content":[{"type":"text","text":"Hello"}]}],"stream":true}',
      });
    });
  });

  describe('web search functionality', () => {
    describe('doGenerate', () => {
      it('should extract server_tool_use calls', async () => {
        prepareJsonResponse({
          content: [
            {
              type: 'text',
              text: "I'll search for information about Claude Shannon.",
            },
            {
              type: 'server_tool_use',
              id: 'srvtoolu_01WYG3ziw53XMcoyKL4XcZmE',
              name: 'web_search',
              input: { query: 'claude shannon birth date' },
            },
            {
              type: 'web_search_tool_result',
              tool_use_id: 'srvtoolu_01WYG3ziw53XMcoyKL4XcZmE',
              content: [
                {
                  type: 'web_search_result',
                  url: 'https://en.wikipedia.org/wiki/Claude_Shannon',
                  title: 'Claude Shannon - Wikipedia',
                  encrypted_content:
                    'EqgfCioIARgBIiQ3YTAwMjY1Mi1mZjM5LTQ1NGUtODgxNC1kNjNjNTk1ZWI3Y...',
                  page_age: 'April 30, 2025',
                },
              ],
            },
            { type: 'text', text: 'Based on the search results, ' },
            {
              type: 'text',
              text: 'Claude Shannon was born on April 30, 1916.',
              citations: [
                {
                  type: 'web_search_result_location',
                  url: 'https://en.wikipedia.org/wiki/Claude_Shannon',
                  title: 'Claude Shannon - Wikipedia',
                  encrypted_index: 'Eo8BCioIAhgBIiQyYjQ0OWJmZi1lNm..',
                  cited_text:
                    'Claude Elwood Shannon (April 30, 1916 – February 24, 2001) was an American mathematician...',
                },
              ],
            },
          ],
          stopReason: 'end_turn',
          usage: {
            input_tokens: 6039,
            output_tokens: 931,
            server_tool_use: {
              web_search_requests: 1,
            },
          },
        });

        const { toolCalls, finishReason, text, usage } = await model.doGenerate(
          {
            inputFormat: 'prompt',
            mode: { type: 'regular' },
            prompt: TEST_PROMPT,
          },
        );

        expect(toolCalls).toStrictEqual([
          {
            toolCallId: 'srvtoolu_01WYG3ziw53XMcoyKL4XcZmE',
            toolCallType: 'function',
            toolName: 'web_search',
            args: '{"query":"claude shannon birth date"}',
          },
        ]);
        expect(text).toStrictEqual(
          "I'll search for information about Claude Shannon.Based on the search results, Claude Shannon was born on April 30, 1916.",
        );
        expect(finishReason).toStrictEqual('stop');
        expect(usage.promptTokens).toStrictEqual(6039);
        expect(usage.completionTokens).toStrictEqual(931);
      });

      it('should handle web search results with null page_age', async () => {
        prepareJsonResponse({
          content: [
            {
              type: 'server_tool_use',
              id: 'srvtoolu_01test',
              name: 'web_search',
              input: { query: 'test query' },
            },
            {
              type: 'web_search_tool_result',
              tool_use_id: 'srvtoolu_01test',
              content: [
                {
                  type: 'web_search_result',
                  url: 'https://example.com',
                  title: 'Test Result',
                  encrypted_content: 'encrypted_content_here',
                  page_age: null,
                },
              ],
            },
            { type: 'text', text: 'Found some results!' },
          ],
        });

        const { toolCalls, text } = await model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        expect(toolCalls).toStrictEqual([
          {
            toolCallId: 'srvtoolu_01test',
            toolCallType: 'function',
            toolName: 'web_search',
            args: '{"query":"test query"}',
          },
        ]);
        expect(text).toStrictEqual('Found some results!');
      });

      it('should extract sources from web search results', async () => {
        prepareJsonResponse({
          content: [
            {
              type: 'server_tool_use',
              id: 'srvtoolu_01test',
              name: 'web_search',
              input: { query: 'test query' },
            },
            {
              type: 'web_search_tool_result',
              tool_use_id: 'srvtoolu_01test',
              content: [
                {
                  type: 'web_search_result',
                  url: 'https://example.com',
                  title: 'Example Title',
                  encrypted_content: 'content',
                  page_age: '1 day ago',
                },
                {
                  type: 'web_search_result',
                  url: 'https://test.com',
                  title: 'Test Title',
                  encrypted_content: 'test content',
                  page_age: null,
                },
              ],
            },
            { type: 'text', text: 'Found results!' },
          ],
        });

        const { sources } = await model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        expect(sources).toHaveLength(2);
        expect(sources[0]).toMatchObject({
          sourceType: 'url',
          url: 'https://example.com',
          title: 'Example Title',
        });
        expect(sources[0].id).toBeDefined();
        expect(sources[1]).toMatchObject({
          sourceType: 'url',
          url: 'https://test.com',
          title: 'Test Title',
        });
        expect(sources[1].id).toBeDefined();
      });

      it('should extract sources from citations in text', async () => {
        prepareJsonResponse({
          content: [
            {
              type: 'text',
              text: 'Claude Shannon founded information theory.',
              citations: [
                {
                  type: 'web_search_result_location',
                  url: 'https://en.wikipedia.org/wiki/Claude_Shannon',
                  title: 'Claude Shannon - Wikipedia',
                  encrypted_index: 'test_index',
                  cited_text:
                    'Shannon founded the field of information theory...',
                },
              ],
            },
          ],
        });

        const { sources } = await model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        expect(sources).toHaveLength(1);
        expect(sources[0]).toMatchObject({
          sourceType: 'url',
          url: 'https://en.wikipedia.org/wiki/Claude_Shannon',
          title: 'Claude Shannon - Wikipedia',
        });
        expect(sources[0].id).toBeDefined();
      });

      it('should handle text with citations', async () => {
        prepareJsonResponse({
          content: [
            {
              type: 'text',
              text: 'Shannon founded information theory.',
              citations: [
                {
                  type: 'web_search_result_location',
                  url: 'https://en.wikipedia.org/wiki/Claude_Shannon',
                  title: 'Claude Shannon - Wikipedia',
                  encrypted_index: 'test_index',
                  cited_text:
                    'Shannon founded the field of information theory...',
                },
                {
                  type: 'web_search_result_location',
                  url: 'https://example.com/shannon',
                  title: 'Shannon Biography',
                  encrypted_index: 'test_index_2',
                  cited_text: 'Claude Shannon was a pioneer...',
                },
              ],
            },
          ],
        });

        const { text } = await model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        expect(text).toStrictEqual('Shannon founded information theory.');
      });

      it('should handle multiple web searches', async () => {
        prepareJsonResponse({
          content: [
            {
              type: 'server_tool_use',
              id: 'srvtoolu_01first',
              name: 'web_search',
              input: { query: 'first search' },
            },
            {
              type: 'web_search_tool_result',
              tool_use_id: 'srvtoolu_01first',
              content: [
                {
                  type: 'web_search_result',
                  url: 'https://first.com',
                  title: 'First Result',
                  encrypted_content: 'first_content',
                  page_age: '1 day ago',
                },
              ],
            },
            {
              type: 'server_tool_use',
              id: 'srvtoolu_02second',
              name: 'web_search',
              input: { query: 'second search' },
            },
            {
              type: 'web_search_tool_result',
              tool_use_id: 'srvtoolu_02second',
              content: [
                {
                  type: 'web_search_result',
                  url: 'https://second.com',
                  title: 'Second Result',
                  encrypted_content: 'second_content',
                  page_age: null,
                },
              ],
            },
            { type: 'text', text: 'Found multiple results!' },
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 200,
            server_tool_use: {
              web_search_requests: 2,
            },
          },
        });

        const { toolCalls, text, usage } = await model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        expect(toolCalls).toStrictEqual([
          {
            toolCallId: 'srvtoolu_01first',
            toolCallType: 'function',
            toolName: 'web_search',
            args: '{"query":"first search"}',
          },
          {
            toolCallId: 'srvtoolu_02second',
            toolCallType: 'function',
            toolName: 'web_search',
            args: '{"query":"second search"}',
          },
        ]);
        expect(text).toStrictEqual('Found multiple results!');
        expect(usage.promptTokens).toStrictEqual(100);
        expect(usage.completionTokens).toStrictEqual(200);
      });

      it('should handle mixed regular and server tool calls', async () => {
        prepareJsonResponse({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_01regular',
              name: 'calculate',
              input: { expression: '2 + 2' },
            },
            {
              type: 'server_tool_use',
              id: 'srvtoolu_01search',
              name: 'web_search',
              input: { query: 'math calculator' },
            },
            {
              type: 'web_search_tool_result',
              tool_use_id: 'srvtoolu_01search',
              content: [
                {
                  type: 'web_search_result',
                  url: 'https://calculator.com',
                  title: 'Calculator',
                  encrypted_content: 'calc_content',
                  page_age: '2 hours ago',
                },
              ],
            },
            { type: 'text', text: 'I can help with math!' },
          ],
          stopReason: 'tool_use',
        });

        const { toolCalls, finishReason } = await model.doGenerate({
          inputFormat: 'prompt',
          mode: {
            type: 'regular',
            tools: [
              {
                type: 'function',
                name: 'calculate',
                parameters: {
                  type: 'object',
                  properties: { expression: { type: 'string' } },
                  required: ['expression'],
                  additionalProperties: false,
                  $schema: 'http://json-schema.org/draft-07/schema#',
                },
              },
            ],
          },
          prompt: TEST_PROMPT,
        });

        expect(toolCalls).toStrictEqual([
          {
            toolCallId: 'toolu_01regular',
            toolCallType: 'function',
            toolName: 'calculate',
            args: '{"expression":"2 + 2"}',
          },
          {
            toolCallId: 'srvtoolu_01search',
            toolCallType: 'function',
            toolName: 'web_search',
            args: '{"query":"math calculator"}',
          },
        ]);
        expect(finishReason).toStrictEqual('tool-calls');
      });
    });

    describe('doStream', () => {
      it('should handle streaming web search events', async () => {
        server.urls['https://api.anthropic.com/v1/messages'].response = {
          type: 'stream-chunks',
          headers: {},
          chunks: [
            `data: {"type":"message_start","message":{"id":"msg_01test","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":20,"output_tokens":1}}}\n\n`,
            `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
            `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"I'll search for information."}}\n\n`,
            `data: {"type":"content_block_stop","index":0}\n\n`,
            `data: {"type":"content_block_start","index":1,"content_block":{"type":"server_tool_use","id":"srvtoolu_01test","name":"web_search"}}\n\n`,
            `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"query\\":\\""}}\n\n`,
            `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"test search\\"}"}}\n\n`,
            `data: {"type":"content_block_stop","index":1}\n\n`,
            `data: {"type":"content_block_start","index":2,"content_block":{"type":"web_search_tool_result","tool_use_id":"srvtoolu_01test","content":[{"type":"web_search_result","url":"https://example.com","title":"Test","encrypted_content":"content","page_age":null}]}}\n\n`,
            `data: {"type":"content_block_stop","index":2}\n\n`,
            `data: {"type":"content_block_start","index":3,"content_block":{"type":"text","text":""}}\n\n`,
            `data: {"type":"content_block_delta","index":3,"delta":{"type":"text_delta","text":"Found results!"}}\n\n`,
            `data: {"type":"content_block_stop","index":3}\n\n`,
            `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":50}}\n\n`,
            `data: {"type":"message_stop"}\n\n`,
          ],
        };

        const { stream } = await model.doStream({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        const events = await convertReadableStreamToArray(stream);

        // Check for text deltas
        expect(events).toContainEqual({
          type: 'text-delta',
          textDelta: "I'll search for information.",
        });
        expect(events).toContainEqual({
          type: 'text-delta',
          textDelta: 'Found results!',
        });

        // Check for tool call
        expect(events).toContainEqual({
          type: 'tool-call',
          toolCallType: 'function',
          toolCallId: 'srvtoolu_01test',
          toolName: 'web_search',
          args: '{"query":"test search"}',
        });

        // Check for finish event
        expect(events).toContainEqual({
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 20, completionTokens: 50 },
          providerMetadata: expect.any(Object),
        });
      });

      it('should handle citations_delta events', async () => {
        server.urls['https://api.anthropic.com/v1/messages'].response = {
          type: 'stream-chunks',
          headers: {},
          chunks: [
            `data: {"type":"message_start","message":{"id":"msg_01test","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":20,"output_tokens":1}}}\n\n`,
            `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
            `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Shannon was born in 1916"}}\n\n`,
            `data: {"type":"content_block_delta","index":0,"delta":{"type":"citations_delta","citation":{"type":"web_search_result_location","cited_text":"Claude Elwood Shannon (April 30, 1916...","url":"https://en.wikipedia.org/wiki/Claude_Shannon","title":"Claude Shannon - Wikipedia","encrypted_index":"test123"}}}\n\n`,
            `data: {"type":"content_block_stop","index":0}\n\n`,
            `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":25}}\n\n`,
            `data: {"type":"message_stop"}\n\n`,
          ],
        };

        const { stream } = await model.doStream({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        const events = await convertReadableStreamToArray(stream);

        // Should handle citations_delta without errors
        expect(events).toContainEqual({
          type: 'text-delta',
          textDelta: 'Shannon was born in 1916',
        });

        expect(events).toContainEqual({
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 20, completionTokens: 25 },
          providerMetadata: expect.any(Object),
        });
      });

      it('should handle server_tool_use without content_block tracking errors', async () => {
        server.urls['https://api.anthropic.com/v1/messages'].response = {
          type: 'stream-chunks',
          headers: {},
          chunks: [
            `data: {"type":"message_start","message":{"id":"msg_01test","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":20,"output_tokens":1}}}\n\n`,
            `data: {"type":"content_block_start","index":0,"content_block":{"type":"server_tool_use","id":"srvtoolu_01test","name":"web_search"}}\n\n`,
            `data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"query\\":\\"test\\"}"}}\n\n`,
            `data: {"type":"content_block_stop","index":0}\n\n`,
            `data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":10}}\n\n`,
            `data: {"type":"message_stop"}\n\n`,
          ],
        };

        const { stream } = await model.doStream({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        const events = await convertReadableStreamToArray(stream);

        // Should emit tool call
        expect(events).toContainEqual({
          type: 'tool-call',
          toolCallType: 'function',
          toolCallId: 'srvtoolu_01test',
          toolName: 'web_search',
          args: '{"query":"test"}',
        });

        expect(events).toContainEqual({
          type: 'finish',
          finishReason: 'tool-calls',
          usage: { promptTokens: 20, completionTokens: 10 },
          providerMetadata: expect.any(Object),
        });
      });

      it('should emit source events from web search results', async () => {
        server.urls['https://api.anthropic.com/v1/messages'].response = {
          type: 'stream-chunks',
          headers: {},
          chunks: [
            `data: {"type":"message_start","message":{"id":"msg_01test","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":20,"output_tokens":1}}}\n\n`,
            `data: {"type":"content_block_start","index":0,"content_block":{"type":"server_tool_use","id":"srvtoolu_01test","name":"web_search"}}\n\n`,
            `data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"query\\":\\"test search\\"}"}}\n\n`,
            `data: {"type":"content_block_stop","index":0}\n\n`,
            `data: {"type":"content_block_start","index":1,"content_block":{"type":"web_search_tool_result","tool_use_id":"srvtoolu_01test","content":[{"type":"web_search_result","url":"https://example.com","title":"Example Result","encrypted_content":"content","page_age":"1 day ago"}]}}\n\n`,
            `data: {"type":"content_block_stop","index":1}\n\n`,
            `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":25}}\n\n`,
            `data: {"type":"message_stop"}\n\n`,
          ],
        };

        const { stream } = await model.doStream({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        const events = await convertReadableStreamToArray(stream);

        // Should emit source event for web search result
        expect(events).toContainEqual({
          type: 'source',
          source: {
            sourceType: 'url',
            id: expect.any(String),
            url: 'https://example.com',
            title: 'Example Result',
          },
        });

        expect(events).toContainEqual({
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 20, completionTokens: 25 },
          providerMetadata: expect.any(Object),
        });
      });

      it('should emit source events from citations_delta', async () => {
        server.urls['https://api.anthropic.com/v1/messages'].response = {
          type: 'stream-chunks',
          headers: {},
          chunks: [
            `data: {"type":"message_start","message":{"id":"msg_01test","type":"message","role":"assistant","content":[],"model":"claude-3-haiku-20240307","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":20,"output_tokens":1}}}\n\n`,
            `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
            `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Shannon was born in 1916"}}\n\n`,
            `data: {"type":"content_block_delta","index":0,"delta":{"type":"citations_delta","citation":{"type":"web_search_result_location","cited_text":"Claude Elwood Shannon (April 30, 1916...","url":"https://en.wikipedia.org/wiki/Claude_Shannon","title":"Claude Shannon - Wikipedia","encrypted_index":"test123"}}}\n\n`,
            `data: {"type":"content_block_stop","index":0}\n\n`,
            `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":25}}\n\n`,
            `data: {"type":"message_stop"}\n\n`,
          ],
        };

        const { stream } = await model.doStream({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        const events = await convertReadableStreamToArray(stream);

        // Should emit source event for citation
        expect(events).toContainEqual({
          type: 'source',
          source: {
            sourceType: 'url',
            id: expect.any(String),
            url: 'https://en.wikipedia.org/wiki/Claude_Shannon',
            title: 'Claude Shannon - Wikipedia',
          },
        });

        expect(events).toContainEqual({
          type: 'text-delta',
          textDelta: 'Shannon was born in 1916',
        });
      });
    });
  });
});
