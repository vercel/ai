/**
 * Reproduction test for Issue #5658
 * "@ai-sdk/openai streamText can't use tools/functions with no arguments"
 *
 * This test reproduces the exact issue:
 * - Tool with NO arguments (empty parameters)
 * - OpenAI-compatible provider (like Ollama) sends arguments: ""
 * - Tool call is NOT invoked (BUG)
 *
 * Expected behavior: Tool should be invoked even with empty arguments
 * Actual behavior: Tool call is silently dropped
 */

import { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createOpenAI } from '../openai-provider';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'What time is it?' }] },
];

const server = createTestServer({
  'https://api.openai.com/v1/chat/completions': {},
});

const provider = createOpenAI({
  apiKey: 'test-api-key',
});

const model = provider.chat('gpt-3.5-turbo');

describe('Issue #5658: Tools with no arguments', () => {
  describe('streamText', () => {
    it('should invoke tool with empty string arguments (BUG REPRODUCTION)', async () => {
      // This reproduces the exact scenario reported in issue #5658
      // Some OpenAI-compatible providers (like Ollama) send arguments: ""
      // for tools that have no parameters
      server.urls['https://api.openai.com/v1/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [
          // Chunk 1: Tool call with EMPTY STRING arguments
          `data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
            `"system_fingerprint":"fp_test","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
            `"tool_calls":[{"index":0,"id":"call_getCurrentTime","type":"function","function":{"name":"getCurrentTime","arguments":""}}]},` +
            `"logprobs":null,"finish_reason":null}]}\n\n`,
          // Chunk 2: Finish
          `data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
            `"system_fingerprint":"fp_test","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"tool_calls"}]}\n\n`,
          `data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
            `"system_fingerprint":"fp_test","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await model.doStream({
        tools: [
          {
            type: 'function',
            name: 'getCurrentTime',
            description: 'Get the current time',
            inputSchema: {
              type: 'object',
              properties: {}, // NO PARAMETERS - this is the key!
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      const result = await convertReadableStreamToArray(stream);

      // ❌ CURRENT BEHAVIOR (BUG):
      // The tool-call event is MISSING because isParsableJson("") returns false
      // and the tool call is silently dropped

      // ✅ EXPECTED BEHAVIOR:
      // Should contain:
      // 1. tool-input-start
      // 2. tool-input-end (even with no delta, since args is empty)
      // 3. tool-call with input: "{}" or ""
      console.log('Result:', JSON.stringify(result, null, 2));

      // This test will FAIL until the bug is fixed
      const toolInputStart = result.find(r => r.type === 'tool-input-start');
      const toolInputEnd = result.find(r => r.type === 'tool-input-end');
      const toolCall = result.find(r => r.type === 'tool-call');

      expect(toolInputStart).toBeDefined();
      expect(toolInputEnd).toBeDefined();
      expect(toolCall).toBeDefined();
      expect(toolCall).toMatchObject({
        type: 'tool-call',
        toolCallId: 'call_getCurrentTime',
        toolName: 'getCurrentTime',
        // Empty string should be treated as empty object
        input: expect.stringMatching(/^(\{\}|)$/),
      });
    });

    it('should invoke tool with empty string arguments sent incrementally', async () => {
      // Another scenario: arguments is sent as empty string across multiple chunks
      server.urls['https://api.openai.com/v1/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [
          // Chunk 1: Tool call starts with name
          `data: {"id":"chatcmpl-test2","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
            `"system_fingerprint":"fp_test","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
            `"tool_calls":[{"index":0,"id":"call_test2","type":"function","function":{"name":"getCurrentTime","arguments":""}}]},` +
            `"logprobs":null,"finish_reason":null}]}\n\n`,
          // Chunk 2: No more arguments (stays empty)
          `data: {"id":"chatcmpl-test2","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
            `"system_fingerprint":"fp_test","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":""}}]},` +
            `"logprobs":null,"finish_reason":null}]}\n\n`,
          // Chunk 3: Finish
          `data: {"id":"chatcmpl-test2","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
            `"system_fingerprint":"fp_test","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"tool_calls"}]}\n\n`,
          `data: {"id":"chatcmpl-test2","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
            `"system_fingerprint":"fp_test","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await model.doStream({
        tools: [
          {
            type: 'function',
            name: 'getCurrentTime',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      const result = await convertReadableStreamToArray(stream);

      const toolCall = result.find(r => r.type === 'tool-call');
      expect(toolCall).toBeDefined();
      expect(toolCall).toMatchObject({
        type: 'tool-call',
        toolName: 'getCurrentTime',
      });
    });
  });

  describe('generateText', () => {
    it('should invoke tool with empty arguments in non-streaming mode', async () => {
      // Test that generateText also has the same issue
      server.urls['https://api.openai.com/v1/chat/completions'].response = {
        type: 'json-value',
        body: {
          id: 'chatcmpl-test-gen',
          object: 'chat.completion',
          created: 1711357598,
          model: 'gpt-3.5-turbo-0125',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_gen_test',
                    type: 'function',
                    function: {
                      name: 'getCurrentTime',
                      arguments: '', // Empty string arguments
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          system_fingerprint: 'fp_test',
        },
      };

      const result = await model.doGenerate({
        tools: [
          {
            type: 'function',
            name: 'getCurrentTime',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        prompt: TEST_PROMPT,
      });

      // Should have tool calls even with empty arguments
      expect(result.content).toBeDefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'tool-call',
        toolCallId: 'call_gen_test',
        toolName: 'getCurrentTime',
        input: '{}', // Should normalize empty string to {}
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle whitespace-only arguments (spaces)', async () => {
      server.urls['https://api.openai.com/v1/chat/completions'].response = {
        type: 'json-value',
        body: {
          id: 'chatcmpl-whitespace',
          object: 'chat.completion',
          created: 1711357598,
          model: 'gpt-3.5-turbo-0125',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_whitespace',
                    type: 'function',
                    function: {
                      name: 'getCurrentTime',
                      arguments: '   ', // Whitespace only
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          system_fingerprint: 'fp_test',
        },
      };

      const result = await model.doGenerate({
        tools: [
          {
            type: 'function',
            name: 'getCurrentTime',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        prompt: TEST_PROMPT,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'tool-call',
        toolName: 'getCurrentTime',
        input: '{}', // Whitespace should be trimmed and treated as empty
      });
    });

    it('should handle whitespace-only arguments (tabs and newlines)', async () => {
      server.urls['https://api.openai.com/v1/chat/completions'].response = {
        type: 'json-value',
        body: {
          id: 'chatcmpl-tabs',
          object: 'chat.completion',
          created: 1711357598,
          model: 'gpt-3.5-turbo-0125',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_tabs',
                    type: 'function',
                    function: {
                      name: 'getCurrentTime',
                      arguments: '\t\n\r  ', // Various whitespace
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          system_fingerprint: 'fp_test',
        },
      };

      const result = await model.doGenerate({
        tools: [
          {
            type: 'function',
            name: 'getCurrentTime',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        prompt: TEST_PROMPT,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'tool-call',
        toolName: 'getCurrentTime',
        input: '{}',
      });
    });

    it('should NOT normalize valid empty object', async () => {
      // This test ensures we don't break valid {} arguments
      server.urls['https://api.openai.com/v1/chat/completions'].response = {
        type: 'json-value',
        body: {
          id: 'chatcmpl-valid',
          object: 'chat.completion',
          created: 1711357598,
          model: 'gpt-3.5-turbo-0125',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_valid',
                    type: 'function',
                    function: {
                      name: 'getCurrentTime',
                      arguments: '{}', // Valid empty object
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          system_fingerprint: 'fp_test',
        },
      };

      const result = await model.doGenerate({
        tools: [
          {
            type: 'function',
            name: 'getCurrentTime',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        prompt: TEST_PROMPT,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'tool-call',
        toolName: 'getCurrentTime',
        input: '{}', // Should remain as {}
      });
    });

    it('should handle whitespace-only arguments in streaming mode', async () => {
      server.urls['https://api.openai.com/v1/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [
          `data: {"id":"chatcmpl-stream-ws","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
            `"system_fingerprint":"fp_test","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
            `"tool_calls":[{"index":0,"id":"call_stream_ws","type":"function","function":{"name":"getCurrentTime","arguments":"  "}}]},` +
            `"logprobs":null,"finish_reason":null}]}\n\n`,
          `data: {"id":"chatcmpl-stream-ws","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
            `"system_fingerprint":"fp_test","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"tool_calls"}]}\n\n`,
          `data: {"id":"chatcmpl-stream-ws","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
            `"system_fingerprint":"fp_test","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n`,
          'data: [DONE]\n\n',
        ],
      };

      const { stream } = await model.doStream({
        tools: [
          {
            type: 'function',
            name: 'getCurrentTime',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
        prompt: TEST_PROMPT,
        includeRawChunks: false,
      });

      const result = await convertReadableStreamToArray(stream);
      const toolCall = result.find(r => r.type === 'tool-call');

      expect(toolCall).toBeDefined();
      expect(toolCall).toMatchObject({
        type: 'tool-call',
        toolName: 'getCurrentTime',
        input: '{}', // Whitespace should be normalized
      });
    });
  });
});
