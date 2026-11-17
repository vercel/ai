import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDeepSeek } from '../deepseek-provider';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const REASONING_PROMPT: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [
      { type: 'text', text: 'Why is the sky blue? Answer in one sentence.' },
    ],
  },
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
  action: {
    type: 'search',
    queries: ['python official website', 'ws_call_id=ws_1'],
  },
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
    it('maps a recorded reasoning response', async () => {
      prepareJsonFixtureResponse('deepseek-responses');

      const result = await provider.responses('deepseek-flash').doGenerate({
        prompt: REASONING_PROMPT,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "providerMetadata": {
                "deepseek": {
                  "itemId": "ce3fcfc1-5896-44c8-aea0-4b70bcb7b61e",
                },
              },
              "text": "We need answer one sentence. Need explain Rayleigh scattering. Concise.",
              "type": "reasoning",
            },
            {
              "text": "The sky appears blue because air molecules scatter shorter-wavelength blue light from the Sun more strongly than longer-wavelength red light.",
              "type": "text",
            },
          ],
          "finishReason": {
            "raw": "completed",
            "unified": "stop",
          },
          "providerMetadata": {
            "deepseek": {
              "responseId": "2eb56558-d132-4164-9b25-855b14ab2dab",
            },
          },
          "request": {
            "body": {
              "input": [
                {
                  "content": [
                    {
                      "text": "Why is the sky blue? Answer in one sentence.",
                      "type": "input_text",
                    },
                  ],
                  "role": "user",
                },
              ],
              "max_output_tokens": undefined,
              "model": "deepseek-flash",
              "temperature": undefined,
              "tool_choice": undefined,
              "tools": undefined,
              "top_p": undefined,
            },
          },
          "response": {
            "body": {
              "background": false,
              "completed_at": 1794263126,
              "content_filters": null,
              "created_at": 1794263125,
              "error": null,
              "frequency_penalty": 0,
              "id": "2eb56558-d132-4164-9b25-855b14ab2dab",
              "incomplete_details": null,
              "instructions": null,
              "max_output_tokens": null,
              "max_tool_calls": null,
              "metadata": {},
              "model": "deepseek-flash",
              "moderation": null,
              "object": "response",
              "output": [
                {
                  "content": [
                    {
                      "text": "We need answer one sentence. Need explain Rayleigh scattering. Concise.",
                      "type": "reasoning_text",
                    },
                  ],
                  "encrypted_content": "2eb56558-d132-4164-9b25-855b14ab2dab-0",
                  "id": "ce3fcfc1-5896-44c8-aea0-4b70bcb7b61e",
                  "status": "completed",
                  "summary": [],
                  "type": "reasoning",
                },
                {
                  "content": [
                    {
                      "annotations": [],
                      "logprobs": [],
                      "text": "The sky appears blue because air molecules scatter shorter-wavelength blue light from the Sun more strongly than longer-wavelength red light.",
                      "type": "output_text",
                    },
                  ],
                  "id": "c597782f-3383-48de-8637-161d61d584f7",
                  "phase": "final_answer",
                  "role": "assistant",
                  "status": "completed",
                  "type": "message",
                },
              ],
              "parallel_tool_calls": true,
              "presence_penalty": 0,
              "previous_response_id": null,
              "prompt_cache_key": null,
              "prompt_cache_retention": null,
              "reasoning": {
                "effort": null,
                "summary": null,
              },
              "safety_identifier": null,
              "service_tier": "default",
              "status": "completed",
              "store": false,
              "temperature": 1,
              "text": {
                "format": {
                  "type": "text",
                },
                "verbosity": null,
              },
              "tool_choice": "auto",
              "tools": [],
              "top_logprobs": 0,
              "top_p": 1,
              "truncation": "disabled",
              "usage": {
                "input_tokens": 41,
                "input_tokens_details": {
                  "cached_tokens": 0,
                },
                "output_tokens": 40,
                "output_tokens_details": {
                  "reasoning_tokens": 14,
                },
                "total_tokens": 81,
              },
              "user": null,
            },
            "headers": {
              "content-length": "1551",
              "content-type": "application/json",
            },
            "id": "2eb56558-d132-4164-9b25-855b14ab2dab",
            "modelId": "deepseek-flash",
            "timestamp": 2026-11-09T22:25:25.000Z,
          },
          "usage": {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": undefined,
              "noCache": 41,
              "total": 41,
            },
            "outputTokens": {
              "reasoning": 14,
              "text": 26,
              "total": 40,
            },
            "raw": {
              "input_tokens": 41,
              "input_tokens_details": {
                "cached_tokens": 0,
              },
              "output_tokens": 40,
              "output_tokens_details": {
                "reasoning_tokens": 14,
              },
              "total_tokens": 81,
            },
          },
          "warnings": [],
        }
      `);
    });

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

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "providerMetadata": {
                "deepseek": {
                  "itemId": "rs_1",
                },
              },
              "text": "Let me search.",
              "type": "reasoning",
            },
            {
              "input": "{}",
              "providerExecuted": true,
              "providerMetadata": {
                "deepseek": {
                  "webSearchCall": {
                    "action": {
                      "queries": [
                        "python official website",
                        "ws_call_id=ws_1",
                      ],
                      "type": "search",
                    },
                    "id": "ws_1",
                    "status": "completed",
                    "type": "web_search_call",
                  },
                },
              },
              "toolCallId": "ws_1",
              "toolName": "web_search",
              "type": "tool-call",
            },
            {
              "result": {
                "action": {
                  "queries": [
                    "python official website",
                    "ws_call_id=ws_1",
                  ],
                  "type": "search",
                },
                "status": "completed",
              },
              "toolCallId": "ws_1",
              "toolName": "web_search",
              "type": "tool-result",
            },
            {
              "text": "https://python.org",
              "type": "text",
            },
            {
              "input": "{"q":"x"}",
              "toolCallId": "call_1",
              "toolName": "lookup",
              "type": "tool-call",
            },
          ],
          "finishReason": {
            "raw": "completed",
            "unified": "tool-calls",
          },
          "providerMetadata": {
            "deepseek": {
              "responseId": "resp_1",
              "serverToolUse": {
                "toolFetch": 2,
                "toolSearch": 1,
              },
            },
          },
          "request": {
            "body": {
              "input": [
                {
                  "content": [
                    {
                      "text": "Hello",
                      "type": "input_text",
                    },
                  ],
                  "role": "user",
                },
              ],
              "max_output_tokens": undefined,
              "model": "deepseek-v4-pro",
              "temperature": undefined,
              "tool_choice": undefined,
              "tools": [
                {
                  "type": "web_search",
                },
              ],
              "top_p": undefined,
            },
          },
          "response": {
            "body": {
              "created_at": 1793084842,
              "id": "resp_1",
              "model": "deepseek-flash",
              "object": "response",
              "output": [
                {
                  "content": [
                    {
                      "text": "Let me search.",
                      "type": "reasoning_text",
                    },
                  ],
                  "id": "rs_1",
                  "type": "reasoning",
                },
                {
                  "action": {
                    "queries": [
                      "python official website",
                      "ws_call_id=ws_1",
                    ],
                    "type": "search",
                  },
                  "id": "ws_1",
                  "status": "completed",
                  "type": "web_search_call",
                },
                {
                  "content": [
                    {
                      "text": "https://python.org",
                      "type": "output_text",
                    },
                  ],
                  "id": "msg_1",
                  "type": "message",
                },
                {
                  "arguments": "{"q":"x"}",
                  "call_id": "call_1",
                  "id": "fc_1",
                  "name": "lookup",
                  "type": "function_call",
                },
              ],
              "status": "completed",
              "usage": {
                "input_tokens": 3475,
                "input_tokens_details": {
                  "cached_tokens": 512,
                },
                "output_tokens": 54,
                "output_tokens_details": {
                  "reasoning_tokens": 10,
                },
                "server_tool_use": {
                  "tool_fetch": 2,
                  "tool_search": 1,
                },
                "total_tokens": 3529,
              },
            },
            "headers": {
              "content-length": "762",
              "content-type": "application/json",
            },
            "id": "resp_1",
            "modelId": "deepseek-flash",
            "timestamp": 2026-10-27T07:07:22.000Z,
          },
          "usage": {
            "inputTokens": {
              "cacheRead": 512,
              "cacheWrite": undefined,
              "noCache": 2963,
              "total": 3475,
            },
            "outputTokens": {
              "reasoning": 10,
              "text": 44,
              "total": 54,
            },
            "raw": {
              "input_tokens": 3475,
              "input_tokens_details": {
                "cached_tokens": 512,
              },
              "output_tokens": 54,
              "output_tokens_details": {
                "reasoning_tokens": 10,
              },
              "server_tool_use": {
                "tool_fetch": 2,
                "tool_search": 1,
              },
              "total_tokens": 3529,
            },
          },
          "warnings": [],
        }
      `);
    });

    it('throws when DeepSeek returns a failed response', async () => {
      prepareJsonResponse({
        status: 'failed',
        error: { code: 'server_error', message: 'boom' },
      });

      await expect(
        provider
          .responses('deepseek-flash')
          .doGenerate({ prompt: TEST_PROMPT }),
      ).rejects.toMatchObject({
        message: 'boom',
        statusCode: 500,
        isRetryable: true,
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

  describe('recorded responses', () => {
    it('maps a recorded web search response', async () => {
      server.urls['https://api.deepseek.com/responses'].response = {
        type: 'json-value',
        body: JSON.parse(
          fs.readFileSync(
            'src/responses/__fixtures__/deepseek-responses-web-search.json',
            'utf8',
          ),
        ),
      };

      const result = await provider.responses('deepseek-v4-pro').doGenerate({
        prompt: TEST_PROMPT,
        tools: [webSearchTool],
      });

      expect(result.content.map(part => part.type)).toEqual([
        'reasoning',
        'tool-call',
        'tool-result',
        'text',
      ]);
      expect(result.content[2]).toMatchObject({
        type: 'tool-result',
        toolName: 'web_search',
        result: {
          status: 'completed',
          action: { type: 'search' },
        },
      });
      expect(result.finishReason).toEqual({
        unified: 'stop',
        raw: 'completed',
      });
      expect(result.providerMetadata?.deepseek?.serverToolUse).toEqual({
        toolSearch: 1,
        toolFetch: 0,
      });
    });

    it('maps a recorded web search stream', async () => {
      server.urls['https://api.deepseek.com/responses'].response = {
        type: 'stream-chunks',
        chunks: fs
          .readFileSync(
            'src/responses/__fixtures__/deepseek-responses-web-search.chunks.txt',
            'utf8',
          )
          .split('\n')
          .map(line => `data: ${line}\n\n`),
      };

      const { stream } = await provider.responses('deepseek-v4-pro').doStream({
        prompt: TEST_PROMPT,
        tools: [webSearchTool],
      });
      const parts = await convertReadableStreamToArray(stream);

      expect(
        parts
          .filter(part => !part.type.endsWith('-delta'))
          .map(part => part.type),
      ).toEqual([
        'stream-start',
        'response-metadata',
        'reasoning-start',
        'reasoning-end',
        'tool-call',
        'tool-result',
        'reasoning-start',
        'reasoning-end',
        'tool-call',
        'tool-result',
        'text-start',
        'text-end',
        'finish',
      ]);
      expect(
        parts
          .filter(part => part.type === 'tool-result')
          .map(part => part.result),
      ).toMatchObject([
        { action: { type: 'search' } },
        { action: { type: 'open_page' } },
      ]);
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'completed' },
        providerMetadata: {
          deepseek: { serverToolUse: { toolSearch: 1, toolFetch: 1 } },
        },
      });
    });
  });

  describe('doStream', () => {
    it('streams a recorded reasoning response', async () => {
      prepareChunksFixtureResponse('deepseek-responses');

      const { stream } = await provider.responses('deepseek-flash').doStream({
        prompt: REASONING_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "8ee252be-c361-4eb3-9972-2cc047e95a35",
            "modelId": "deepseek-flash",
            "timestamp": 2026-11-09T22:25:09.000Z,
            "type": "response-metadata",
          },
          {
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "providerMetadata": {
              "deepseek": {
                "itemId": "d232e805-7826-4712-94ce-8f48657e4ffe",
              },
            },
            "type": "reasoning-start",
          },
          {
            "delta": "We",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": " need",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": " answer",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": " one",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": " sentence",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": ".",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": " Need",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": " explain",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": " Rayleigh",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": " scattering",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": ".",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": " Conc",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": "ise",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": ".",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": " Ensure",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": " one",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": " sentence",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": " only",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "delta": ".",
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "type": "reasoning-delta",
          },
          {
            "id": "d232e805-7826-4712-94ce-8f48657e4ffe",
            "providerMetadata": {
              "deepseek": {
                "itemId": "d232e805-7826-4712-94ce-8f48657e4ffe",
              },
            },
            "type": "reasoning-end",
          },
          {
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-start",
          },
          {
            "delta": "The",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " sky",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " appears",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " blue",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " because",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " air",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " molecules",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " scatter",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " shorter",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " blue",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " wavelengths",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " of",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " sunlight",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " much",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " more",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " strongly",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " than",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " longer",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " red",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": " wavelengths",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "delta": ".",
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-delta",
          },
          {
            "id": "81776cdd-5ccf-4437-b08d-ca348047754b",
            "type": "text-end",
          },
          {
            "finishReason": {
              "raw": "completed",
              "unified": "stop",
            },
            "providerMetadata": {
              "deepseek": {
                "responseId": "8ee252be-c361-4eb3-9972-2cc047e95a35",
              },
            },
            "type": "finish",
            "usage": {
              "inputTokens": {
                "cacheRead": 0,
                "cacheWrite": undefined,
                "noCache": 41,
                "total": 41,
              },
              "outputTokens": {
                "reasoning": 19,
                "text": 22,
                "total": 41,
              },
              "raw": {
                "input_tokens": 41,
                "input_tokens_details": {
                  "cached_tokens": 0,
                },
                "output_tokens": 41,
                "output_tokens_details": {
                  "reasoning_tokens": 19,
                },
                "total_tokens": 82,
              },
            },
          },
        ]
      `);
    });

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

      expect(parts).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "id": "resp_1",
            "modelId": "deepseek-v4-pro",
            "timestamp": 2026-10-27T07:08:28.000Z,
            "type": "response-metadata",
          },
          {
            "id": "rs_1",
            "providerMetadata": {
              "deepseek": {
                "itemId": "rs_1",
              },
            },
            "type": "reasoning-start",
          },
          {
            "delta": "Hmm",
            "id": "rs_1",
            "type": "reasoning-delta",
          },
          {
            "id": "rs_1",
            "providerMetadata": {
              "deepseek": {
                "itemId": "rs_1",
              },
            },
            "type": "reasoning-end",
          },
          {
            "input": "{}",
            "providerExecuted": true,
            "providerMetadata": {
              "deepseek": {
                "webSearchCall": {
                  "action": {
                    "queries": [
                      "python official website",
                      "ws_call_id=ws_1",
                    ],
                    "type": "search",
                  },
                  "id": "ws_1",
                  "status": "completed",
                  "type": "web_search_call",
                },
              },
            },
            "toolCallId": "ws_1",
            "toolName": "web_search",
            "type": "tool-call",
          },
          {
            "result": {
              "action": {
                "queries": [
                  "python official website",
                  "ws_call_id=ws_1",
                ],
                "type": "search",
              },
              "status": "completed",
            },
            "toolCallId": "ws_1",
            "toolName": "web_search",
            "type": "tool-result",
          },
          {
            "id": "msg_1",
            "type": "text-start",
          },
          {
            "delta": "Hi",
            "id": "msg_1",
            "type": "text-delta",
          },
          {
            "id": "msg_1",
            "type": "text-end",
          },
          {
            "id": "call_1",
            "toolName": "lookup",
            "type": "tool-input-start",
          },
          {
            "delta": "{"q":",
            "id": "call_1",
            "type": "tool-input-delta",
          },
          {
            "delta": ""x"}",
            "id": "call_1",
            "type": "tool-input-delta",
          },
          {
            "id": "call_1",
            "type": "tool-input-end",
          },
          {
            "input": "{"q":"x"}",
            "toolCallId": "call_1",
            "toolName": "lookup",
            "type": "tool-call",
          },
          {
            "finishReason": {
              "raw": "completed",
              "unified": "tool-calls",
            },
            "providerMetadata": {
              "deepseek": {
                "responseId": "resp_1",
                "serverToolUse": {
                  "toolFetch": 0,
                  "toolSearch": 1,
                },
              },
            },
            "type": "finish",
            "usage": {
              "inputTokens": {
                "cacheRead": 0,
                "cacheWrite": undefined,
                "noCache": 10,
                "total": 10,
              },
              "outputTokens": {
                "reasoning": 0,
                "text": 5,
                "total": 5,
              },
              "raw": {
                "input_tokens": 10,
                "output_tokens": 5,
                "server_tool_use": {
                  "tool_fetch": 0,
                  "tool_search": 1,
                },
                "total_tokens": 15,
              },
            },
          },
        ]
      `);
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

function prepareJsonFixtureResponse(filename: string) {
  server.urls['https://api.deepseek.com/responses'].response = {
    type: 'json-value',
    body: JSON.parse(
      fs.readFileSync(`src/responses/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

function prepareChunksFixtureResponse(filename: string) {
  const chunks = fs
    .readFileSync(`src/responses/__fixtures__/${filename}.chunks.txt`, 'utf8')
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => `data: ${line}\n\n`);
  chunks.push('data: [DONE]\n\n');

  server.urls['https://api.deepseek.com/responses'].response = {
    type: 'stream-chunks',
    chunks,
  };
}

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
