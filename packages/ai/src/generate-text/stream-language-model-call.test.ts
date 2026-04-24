import {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { tool } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import { NoSuchToolError } from '../error/no-such-tool-error';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { streamLanguageModelCall } from './stream-language-model-call';
import { ToolCallRepairFunction } from './tool-call-repair-function';
import type { ToolSet } from '@ai-sdk/provider-utils';

const testUsage: LanguageModelV4Usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: undefined,
  },
};

async function streamLanguageModelCallResult<TOOLS extends ToolSet>({
  streamParts,
  tools,
  repairToolCall,
}: {
  streamParts: LanguageModelV4StreamPart[];
  tools: TOOLS | undefined;
  repairToolCall?: ToolCallRepairFunction<TOOLS>;
}) {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream(streamParts),
    }),
  });

  const { stream } = await streamLanguageModelCall({
    model,
    tools,
    prompt: 'test prompt',
    system: undefined,
    repairToolCall,
  });

  return convertReadableStreamToArray(stream);
}

describe('streamLanguageModelCall', () => {
  describe('stream-start parts', () => {
    it('should convert stream-start to init-model-call', async () => {
      const model = new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            {
              type: 'stream-start',
              warnings: [
                {
                  type: 'compatibility',
                  feature: 'tool-approval',
                  details: 'approval fallback is being used',
                },
                {
                  type: 'other',
                  message: 'custom warning',
                },
              ],
            },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: testUsage,
            },
          ]),
        }),
      });

      const { stream } = await streamLanguageModelCall({
        model,
        tools: undefined,
        prompt: 'test prompt',
        system: undefined,
        repairToolCall: undefined,
      });

      expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
        [
          {
            "type": "model-call-start",
            "warnings": [
              {
                "details": "approval fallback is being used",
                "feature": "tool-approval",
                "type": "compatibility",
              },
              {
                "message": "custom warning",
                "type": "other",
              },
            ],
          },
          {
            "finishReason": "stop",
            "providerMetadata": undefined,
            "rawFinishReason": "stop",
            "type": "model-call-end",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokenDetails": {
                "cacheReadTokens": undefined,
                "cacheWriteTokens": undefined,
                "noCacheTokens": 3,
              },
              "inputTokens": 3,
              "outputTokenDetails": {
                "reasoningTokens": undefined,
                "textTokens": 10,
              },
              "outputTokens": 10,
              "raw": undefined,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
          },
        ]
      `);
    });
  });

  describe('text parts', () => {
    it('should convert text to delta', async () => {
      const result = await streamLanguageModelCallResult({
        streamParts: [
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: 'text' },
          { type: 'text-end', id: '1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
          },
        ],
        tools: undefined,
        repairToolCall: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "type": "text-start",
          },
          {
            "id": "1",
            "providerMetadata": undefined,
            "text": "text",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
          {
            "finishReason": "stop",
            "providerMetadata": undefined,
            "rawFinishReason": "stop",
            "type": "model-call-end",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokenDetails": {
                "cacheReadTokens": undefined,
                "cacheWriteTokens": undefined,
                "noCacheTokens": 3,
              },
              "inputTokens": 3,
              "outputTokenDetails": {
                "reasoningTokens": undefined,
                "textTokens": 10,
              },
              "outputTokens": 10,
              "raw": undefined,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
          },
        ]
      `);
    });
  });

  describe('reasoning parts', () => {
    it('should convert text to delta', async () => {
      const result = await streamLanguageModelCallResult({
        streamParts: [
          { type: 'reasoning-start', id: '1' },
          { type: 'reasoning-delta', id: '1', delta: 'text' },
          { type: 'reasoning-end', id: '1' },
        ],
        tools: undefined,
        repairToolCall: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
      [
        {
          "id": "1",
          "type": "reasoning-start",
        },
        {
          "id": "1",
          "providerMetadata": undefined,
          "text": "text",
          "type": "reasoning-delta",
        },
        {
          "id": "1",
          "type": "reasoning-end",
        },
      ]
    `);
    });
  });

  describe('file parts', () => {
    it('should use GeneratedFile', async () => {
      const result = await streamLanguageModelCallResult({
        streamParts: [
          {
            type: 'file',
            data: { type: 'data', data: 'SGVsbG8gV29ybGQ=' }, // "Hello World" base64-encoded
            mediaType: 'text/plain',
          },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
          },
        ],
        tools: undefined,
        repairToolCall: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "file": DefaultGeneratedFileWithType {
              "base64Data": "SGVsbG8gV29ybGQ=",
              "mediaType": "text/plain",
              "type": "file",
              "uint8ArrayData": undefined,
            },
            "providerMetadata": undefined,
            "type": "file",
          },
          {
            "finishReason": "stop",
            "providerMetadata": undefined,
            "rawFinishReason": "stop",
            "type": "model-call-end",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokenDetails": {
                "cacheReadTokens": undefined,
                "cacheWriteTokens": undefined,
                "noCacheTokens": 3,
              },
              "inputTokens": 3,
              "outputTokenDetails": {
                "reasoningTokens": undefined,
                "textTokens": 10,
              },
              "outputTokens": 10,
              "raw": undefined,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
          },
        ]
      `);
    });

    it('should use GeneratedFile with providerMetadata', async () => {
      const result = await streamLanguageModelCallResult({
        streamParts: [
          {
            type: 'file',
            data: {
              type: 'data',
              data: new Uint8Array([
                72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100,
              ]),
            }, // "Hello World" as Uint8Array
            mediaType: 'text/plain',
            providerMetadata: {
              testProvider: { signature: 'test-signature' },
            },
          },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
          },
        ],
        tools: undefined,
        repairToolCall: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "file": DefaultGeneratedFileWithType {
              "base64Data": undefined,
              "mediaType": "text/plain",
              "type": "file",
              "uint8ArrayData": Uint8Array [
                72,
                101,
                108,
                108,
                111,
                32,
                87,
                111,
                114,
                108,
                100,
              ],
            },
            "providerMetadata": {
              "testProvider": {
                "signature": "test-signature",
              },
            },
            "type": "file",
          },
          {
            "finishReason": "stop",
            "providerMetadata": undefined,
            "rawFinishReason": "stop",
            "type": "model-call-end",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokenDetails": {
                "cacheReadTokens": undefined,
                "cacheWriteTokens": undefined,
                "noCacheTokens": 3,
              },
              "inputTokens": 3,
              "outputTokenDetails": {
                "reasoningTokens": undefined,
                "textTokens": 10,
              },
              "outputTokens": 10,
              "raw": undefined,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
          },
        ]
      `);
    });
  });

  describe('custom parts', () => {
    it('should forward custom parts', async () => {
      const result = await streamLanguageModelCallResult({
        streamParts: [
          {
            type: 'custom',
            kind: 'openai.compaction',
            providerMetadata: {
              openai: { itemId: 'cmp_123' },
            },
          },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
          },
        ],
        tools: undefined,
        repairToolCall: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "kind": "openai.compaction",
            "providerMetadata": {
              "openai": {
                "itemId": "cmp_123",
              },
            },
            "type": "custom",
          },
          {
            "finishReason": "stop",
            "providerMetadata": undefined,
            "rawFinishReason": "stop",
            "type": "model-call-end",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokenDetails": {
                "cacheReadTokens": undefined,
                "cacheWriteTokens": undefined,
                "noCacheTokens": 3,
              },
              "inputTokens": 3,
              "outputTokenDetails": {
                "reasoningTokens": undefined,
                "textTokens": 10,
              },
              "outputTokens": 10,
              "raw": undefined,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
          },
        ]
      `);
    });
  });

  describe('tool-call parts', () => {
    it('should try to repair tool call when the tool name is not found', async () => {
      const tools = {
        correctTool: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => `${value}-result`,
        }),
      };

      const result = await streamLanguageModelCallResult({
        streamParts: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'unknownTool',
            input: `{ "value": "test" }`,
          },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
          },
        ],
        tools,
        repairToolCall: async ({ toolCall, error }) => {
          expect(NoSuchToolError.isInstance(error)).toBe(true);
          expect(toolCall).toStrictEqual({
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'unknownTool',
            input: `{ "value": "test" }`,
          });

          return { ...toolCall, toolName: 'correctTool' };
        },
      });

      expect(result).toMatchInlineSnapshot(`
          [
            {
              "input": {
                "value": "test",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "correctTool",
              "type": "tool-call",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "rawFinishReason": "stop",
              "type": "model-call-end",
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokenDetails": {
                  "cacheReadTokens": undefined,
                  "cacheWriteTokens": undefined,
                  "noCacheTokens": 3,
                },
                "inputTokens": 3,
                "outputTokenDetails": {
                  "reasoningTokens": undefined,
                  "textTokens": 10,
                },
                "outputTokens": 10,
                "raw": undefined,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
            },
          ]
        `);
    });
  });

  describe('tool-approval-request parts', () => {
    it('should emit error when tool call is not found for provider approval request', async () => {
      const result = await streamLanguageModelCallResult({
        streamParts: [
          // No tool-call part before the approval request
          {
            type: 'tool-approval-request',
            approvalId: 'mcp-approval-1',
            toolCallId: 'non-existent-call',
          },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: undefined },
            usage: testUsage,
          },
        ],
        tools: undefined,
        repairToolCall: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "error": [AI_ToolCallNotFoundForApprovalError: Tool call "non-existent-call" not found for approval request "mcp-approval-1".],
            "type": "error",
          },
          {
            "finishReason": "stop",
            "providerMetadata": undefined,
            "rawFinishReason": undefined,
            "type": "model-call-end",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokenDetails": {
                "cacheReadTokens": undefined,
                "cacheWriteTokens": undefined,
                "noCacheTokens": 3,
              },
              "inputTokens": 3,
              "outputTokenDetails": {
                "reasoningTokens": undefined,
                "textTokens": 10,
              },
              "outputTokens": 10,
              "raw": undefined,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
          },
        ]
      `);
    });

    it('should forward provider-emitted tool-approval-request with the correct tool call', async () => {
      const tools = {
        mcp_tool: tool({
          type: 'provider',
          isProviderExecuted: true,
          id: 'mcp.mcp_tool',
          inputSchema: z.object({ query: z.string() }),
          args: {},
        }),
      };

      const result = await streamLanguageModelCallResult({
        streamParts: [
          {
            type: 'tool-call',
            toolCallId: 'mcp-call-1',
            toolName: 'mcp_tool',
            input: `{ "query": "test" }`,
            providerExecuted: true,
          },
          {
            type: 'tool-approval-request',
            approvalId: 'mcp-approval-1',
            toolCallId: 'mcp-call-1',
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: undefined },
            usage: testUsage,
          },
        ],
        tools,
        repairToolCall: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "query": "test",
            },
            "providerExecuted": true,
            "providerMetadata": undefined,
            "title": undefined,
            "toolCallId": "mcp-call-1",
            "toolName": "mcp_tool",
            "type": "tool-call",
          },
          {
            "approvalId": "mcp-approval-1",
            "toolCall": {
              "input": {
                "query": "test",
              },
              "providerExecuted": true,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "mcp-call-1",
              "toolName": "mcp_tool",
              "type": "tool-call",
            },
            "type": "tool-approval-request",
          },
          {
            "finishReason": "tool-calls",
            "providerMetadata": undefined,
            "rawFinishReason": undefined,
            "type": "model-call-end",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokenDetails": {
                "cacheReadTokens": undefined,
                "cacheWriteTokens": undefined,
                "noCacheTokens": 3,
              },
              "inputTokens": 3,
              "outputTokenDetails": {
                "reasoningTokens": undefined,
                "textTokens": 10,
              },
              "outputTokens": 10,
              "raw": undefined,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
          },
        ]
      `);
    });

    it('should handle multiple provider-executed tool calls with approval requests', async () => {
      const tools = {
        mcp_search: tool({
          type: 'provider',
          isProviderExecuted: true,
          id: 'mcp.mcp_search',
          inputSchema: z.object({ query: z.string() }),
          args: {},
        }),
        mcp_execute: tool({
          type: 'provider',
          isProviderExecuted: true,
          id: 'mcp.mcp_execute',
          inputSchema: z.object({ command: z.string() }),
          args: {},
        }),
      };

      const result = await streamLanguageModelCallResult({
        streamParts: [
          {
            type: 'tool-call',
            toolCallId: 'mcp-call-1',
            toolName: 'mcp_search',
            input: `{ "query": "first" }`,
            providerExecuted: true,
          },
          {
            type: 'tool-call',
            toolCallId: 'mcp-call-2',
            toolName: 'mcp_execute',
            input: `{ "command": "ls" }`,
            providerExecuted: true,
          },
          {
            type: 'tool-approval-request',
            approvalId: 'approval-1',
            toolCallId: 'mcp-call-1',
          },
          {
            type: 'tool-approval-request',
            approvalId: 'approval-2',
            toolCallId: 'mcp-call-2',
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: undefined },
            usage: testUsage,
          },
        ],
        tools,
        repairToolCall: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "query": "first",
            },
            "providerExecuted": true,
            "providerMetadata": undefined,
            "title": undefined,
            "toolCallId": "mcp-call-1",
            "toolName": "mcp_search",
            "type": "tool-call",
          },
          {
            "input": {
              "command": "ls",
            },
            "providerExecuted": true,
            "providerMetadata": undefined,
            "title": undefined,
            "toolCallId": "mcp-call-2",
            "toolName": "mcp_execute",
            "type": "tool-call",
          },
          {
            "approvalId": "approval-1",
            "toolCall": {
              "input": {
                "query": "first",
              },
              "providerExecuted": true,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "mcp-call-1",
              "toolName": "mcp_search",
              "type": "tool-call",
            },
            "type": "tool-approval-request",
          },
          {
            "approvalId": "approval-2",
            "toolCall": {
              "input": {
                "command": "ls",
              },
              "providerExecuted": true,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "mcp-call-2",
              "toolName": "mcp_execute",
              "type": "tool-call",
            },
            "type": "tool-approval-request",
          },
          {
            "finishReason": "tool-calls",
            "providerMetadata": undefined,
            "rawFinishReason": undefined,
            "type": "model-call-end",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokenDetails": {
                "cacheReadTokens": undefined,
                "cacheWriteTokens": undefined,
                "noCacheTokens": 3,
              },
              "inputTokens": 3,
              "outputTokenDetails": {
                "reasoningTokens": undefined,
                "textTokens": 10,
              },
              "outputTokens": 10,
              "raw": undefined,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
          },
        ]
      `);
    });
  });
});
