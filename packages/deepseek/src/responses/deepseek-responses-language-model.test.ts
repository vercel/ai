import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createDeepSeek } from '../deepseek-provider';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createDeepSeek({ apiKey: 'test-api-key' });

const server = createTestServer({
  'https://api.deepseek.com/responses': {},
});

const webSearchTool = {
  type: 'provider' as const,
  id: 'deepseek.web_search' as const,
  name: 'web_search',
  args: {},
};

const webSearchCall = {
  type: 'web_search_call',
  id: 'ws_1',
  status: 'completed',
  action: { type: 'search', query: 'python official website' },
};

describe('DeepSeekResponsesLanguageModel', () => {
  describe('request', () => {
    it('sends a Responses request with mapped options', async () => {
      prepareJsonResponse();

      const { warnings } = await provider
        .responses('deepseek-v4-pro')
        .doGenerate({
          prompt: [{ role: 'system', content: 'Be brief.' }, ...TEST_PROMPT],
          maxOutputTokens: 100,
          temperature: 0.5,
          stopSequences: ['END'],
          responseFormat: {
            type: 'json',
            name: 'answer',
            schema: { type: 'object', properties: { a: { type: 'string' } } },
          },
          tools: [
            webSearchTool,
            {
              type: 'function',
              name: 'lookup',
              description: 'Look something up',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
          toolChoice: { type: 'required' },
          providerOptions: {
            deepseek: { reasoningEffort: 'max', topLogprobs: 2, userId: 'u_1' },
          },
        });

      expect(await server.calls[0].requestBodyJson).toEqual({
        model: 'deepseek-v4-pro',
        input: [
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
        ],
        max_output_tokens: 100,
        temperature: 0.5,
        top_logprobs: 2,
        reasoning: { effort: 'max' },
        text: {
          format: {
            type: 'json_schema',
            name: 'answer',
            schema: { type: 'object', properties: { a: { type: 'string' } } },
          },
        },
        tools: [
          { type: 'web_search' },
          {
            type: 'function',
            name: 'lookup',
            description: 'Look something up',
            parameters: { type: 'object', properties: {} },
          },
        ],
        tool_choice: 'required',
        user: 'u_1',
      });
      expect(warnings).toEqual([
        { type: 'unsupported', feature: 'stopSequences' },
      ]);
    });

    it('disables thinking with reasoning effort none', async () => {
      prepareJsonResponse();

      await provider.responses('deepseek-flash').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: { deepseek: { thinking: { type: 'disabled' } } },
      });

      expect((await server.calls[0].requestBodyJson).reasoning).toEqual({
        effort: 'none',
      });
    });

    it('maps top-level reasoning to DeepSeek effort', async () => {
      prepareJsonResponse();

      await provider.responses('deepseek-flash').doGenerate({
        prompt: TEST_PROMPT,
        reasoning: 'medium',
      });

      expect((await server.calls[0].requestBodyJson).reasoning).toEqual({
        effort: 'high',
      });
    });

    it('replays reasoning, function calls, web search calls and tool outputs', async () => {
      prepareJsonResponse();

      await provider.responses('deepseek-v4-pro').doGenerate({
        prompt: [
          ...TEST_PROMPT,
          {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'thinking',
                providerOptions: { deepseek: { itemId: 'rs_1' } },
              },
              {
                type: 'tool-call',
                toolCallId: 'ws_1',
                toolName: 'web_search',
                input: {},
                providerExecuted: true,
                providerOptions: { deepseek: { webSearchCall } },
              },
              {
                type: 'tool-result',
                toolCallId: 'ws_1',
                toolName: 'web_search',
                output: { type: 'json', value: {} },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_1',
                toolName: 'lookup',
                input: { q: 'x' },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_1',
                toolName: 'lookup',
                output: { type: 'json', value: { ok: true } },
              },
            ],
          },
        ],
      });

      expect((await server.calls[0].requestBodyJson).input).toEqual([
        { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
        {
          type: 'reasoning',
          id: 'rs_1',
          content: [{ type: 'reasoning_text', text: 'thinking' }],
        },
        webSearchCall,
        {
          type: 'function_call',
          call_id: 'call_1',
          name: 'lookup',
          arguments: '{"q":"x"}',
        },
        {
          type: 'function_call_output',
          call_id: 'call_1',
          output: '{"ok":true}',
        },
      ]);
    });

    it('sends images as input_image parts', async () => {
      prepareJsonResponse();

      await provider.responses('deepseek-flash').doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: {
                  type: 'url',
                  url: new URL('https://example.com/a.png'),
                },
                providerOptions: { deepseek: { imageDetail: 'low' } },
              },
              {
                type: 'file',
                mediaType: 'image/png',
                data: {
                  type: 'reference',
                  reference: { deepseek: 'file-api-1' },
                },
              },
            ],
          },
        ],
      });

      expect((await server.calls[0].requestBodyJson).input).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: 'https://example.com/a.png',
              detail: 'low',
            },
            { type: 'input_image', file_id: 'file-api-1' },
          ],
        },
      ]);
    });
  });

  describe('doGenerate', () => {
    it('maps reasoning, text, web search, function calls and usage', async () => {
      prepareJsonResponse({
        output: [
          {
            type: 'reasoning',
            id: 'rs_1',
            content: [{ type: 'reasoning_text', text: 'Let me search.' }],
          },
          webSearchCall,
          {
            type: 'message',
            id: 'msg_1',
            content: [{ type: 'output_text', text: 'https://python.org' }],
          },
          {
            type: 'function_call',
            id: 'fc_1',
            call_id: 'call_1',
            name: 'lookup',
            arguments: '{"q":"x"}',
          },
        ],
        usage: {
          input_tokens: 3475,
          input_tokens_details: { cached_tokens: 512 },
          output_tokens: 54,
          output_tokens_details: { reasoning_tokens: 10 },
          total_tokens: 3529,
          server_tool_use: { tool_search: 1, tool_fetch: 2 },
        },
      });

      const result = await provider.responses('deepseek-v4-pro').doGenerate({
        prompt: TEST_PROMPT,
        tools: [webSearchTool],
      });

      expect(result.content).toEqual([
        {
          type: 'reasoning',
          text: 'Let me search.',
          providerMetadata: { deepseek: { itemId: 'rs_1' } },
        },
        {
          type: 'tool-call',
          toolCallId: 'ws_1',
          toolName: 'web_search',
          input: '{}',
          providerExecuted: true,
          providerMetadata: { deepseek: { webSearchCall } },
        },
        {
          type: 'tool-result',
          toolCallId: 'ws_1',
          toolName: 'web_search',
          result: { status: 'completed', action: webSearchCall.action },
        },
        { type: 'text', text: 'https://python.org' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'lookup',
          input: '{"q":"x"}',
        },
      ]);
      expect(result.finishReason).toEqual({
        unified: 'tool-calls',
        raw: 'completed',
      });
      expect(result.usage.inputTokens).toEqual({
        total: 3475,
        noCache: 2963,
        cacheRead: 512,
        cacheWrite: undefined,
      });
      expect(result.usage.outputTokens).toEqual({
        total: 54,
        text: 44,
        reasoning: 10,
      });
      expect(result.providerMetadata).toEqual({
        deepseek: {
          responseId: 'resp_1',
          serverToolUse: { toolSearch: 1, toolFetch: 2 },
        },
      });
    });

    it('maps incomplete max_output_tokens to length', async () => {
      prepareJsonResponse({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
      });

      const result = await provider
        .responses('deepseek-flash')
        .doGenerate({ prompt: TEST_PROMPT });

      expect(result.finishReason).toEqual({
        unified: 'length',
        raw: 'max_output_tokens',
      });
    });
  });

  describe('doStream', () => {
    it('streams reasoning, text, function calls, web search and usage', async () => {
      server.urls['https://api.deepseek.com/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          {
            type: 'response.created',
            response: {
              id: 'resp_1',
              created_at: 1793084908,
              model: 'deepseek-v4-pro',
              status: 'in_progress',
              output: [],
              usage: null,
            },
          },
          {
            type: 'response.output_item.added',
            output_index: 0,
            item: { type: 'reasoning', id: 'rs_1', content: [] },
          },
          {
            type: 'response.reasoning_text.delta',
            item_id: 'rs_1',
            delta: 'Hmm',
          },
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'reasoning',
              id: 'rs_1',
              content: [{ type: 'reasoning_text', text: 'Hmm' }],
            },
          },
          {
            type: 'response.web_search_call.completed',
            item_id: 'ws_1',
          },
          {
            type: 'response.output_item.done',
            output_index: 1,
            item: webSearchCall,
          },
          {
            type: 'response.output_item.added',
            output_index: 2,
            item: { type: 'message', id: 'msg_1', content: [] },
          },
          {
            type: 'response.output_text.delta',
            item_id: 'msg_1',
            delta: 'Hi',
            logprobs: [],
          },
          {
            type: 'response.output_item.done',
            output_index: 2,
            item: { type: 'message', id: 'msg_1', content: [] },
          },
          {
            type: 'response.output_item.added',
            output_index: 3,
            item: {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'lookup',
              arguments: '',
            },
          },
          {
            type: 'response.function_call_arguments.delta',
            item_id: 'fc_1',
            delta: '{"q":',
          },
          {
            type: 'response.function_call_arguments.delta',
            item_id: 'fc_1',
            delta: '"x"}',
          },
          {
            type: 'response.output_item.done',
            output_index: 3,
            item: {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'lookup',
              arguments: '{"q":"x"}',
            },
          },
          {
            type: 'response.completed',
            response: {
              id: 'resp_1',
              status: 'completed',
              output: [],
              usage: {
                input_tokens: 10,
                output_tokens: 5,
                total_tokens: 15,
                server_tool_use: { tool_search: 1, tool_fetch: 0 },
              },
            },
          },
        ].map(chunk => `data: ${JSON.stringify(chunk)}\n\n`),
      };

      const { stream } = await provider.responses('deepseek-v4-pro').doStream({
        prompt: TEST_PROMPT,
        tools: [webSearchTool],
      });

      const parts = await convertReadableStreamToArray(stream);

      expect(parts).toEqual([
        { type: 'stream-start', warnings: [] },
        {
          type: 'response-metadata',
          id: 'resp_1',
          modelId: 'deepseek-v4-pro',
          timestamp: new Date(1793084908 * 1000),
        },
        {
          type: 'reasoning-start',
          id: 'rs_1',
          providerMetadata: { deepseek: { itemId: 'rs_1' } },
        },
        { type: 'reasoning-delta', id: 'rs_1', delta: 'Hmm' },
        {
          type: 'reasoning-end',
          id: 'rs_1',
          providerMetadata: { deepseek: { itemId: 'rs_1' } },
        },
        {
          type: 'tool-call',
          toolCallId: 'ws_1',
          toolName: 'web_search',
          input: '{}',
          providerExecuted: true,
          providerMetadata: { deepseek: { webSearchCall } },
        },
        {
          type: 'tool-result',
          toolCallId: 'ws_1',
          toolName: 'web_search',
          result: { status: 'completed', action: webSearchCall.action },
        },
        { type: 'text-start', id: 'msg_1' },
        { type: 'text-delta', id: 'msg_1', delta: 'Hi' },
        { type: 'text-end', id: 'msg_1' },
        { type: 'tool-input-start', id: 'call_1', toolName: 'lookup' },
        { type: 'tool-input-delta', id: 'call_1', delta: '{"q":' },
        { type: 'tool-input-delta', id: 'call_1', delta: '"x"}' },
        { type: 'tool-input-end', id: 'call_1' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'lookup',
          input: '{"q":"x"}',
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'completed' },
          usage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: 0,
              cacheWrite: undefined,
            },
            outputTokens: { total: 5, text: 5, reasoning: 0 },
            raw: {
              input_tokens: 10,
              output_tokens: 5,
              total_tokens: 15,
              server_tool_use: { tool_search: 1, tool_fetch: 0 },
            },
          },
          providerMetadata: {
            deepseek: {
              responseId: 'resp_1',
              serverToolUse: { toolSearch: 1, toolFetch: 0 },
            },
          },
        },
      ]);
      expect((await server.calls[0].requestBodyJson).stream).toBe(true);
    });

    it('surfaces response.failed as an error', async () => {
      server.urls['https://api.deepseek.com/responses'].response = {
        type: 'stream-chunks',
        chunks: [
          {
            type: 'response.failed',
            response: {
              id: 'resp_1',
              status: 'failed',
              error: { code: 'server_error', message: 'boom' },
              output: [],
            },
          },
        ].map(chunk => `data: ${JSON.stringify(chunk)}\n\n`),
      };

      const { stream } = await provider
        .responses('deepseek-flash')
        .doStream({ prompt: TEST_PROMPT });
      const parts = await convertReadableStreamToArray(stream);

      expect(parts.find(part => part.type === 'error')).toBeDefined();
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: { unified: 'error', raw: 'failed' },
      });
    });
  });
});

function prepareJsonResponse(overrides: Record<string, unknown> = {}) {
  server.urls['https://api.deepseek.com/responses'].response = {
    type: 'json-value',
    body: {
      id: 'resp_1',
      object: 'response',
      created_at: 1793084842,
      model: 'deepseek-flash',
      status: 'completed',
      output: [],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      ...overrides,
    },
  };
}
