import {
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { delay, tool } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { NoSuchToolError } from '../error/no-such-tool-error';
import { MockTracer } from '../test/mock-tracer';
import {
  runToolsTransformation,
  SingleRequestTextStreamPart,
} from './run-tools-transformation';
import { ToolSet } from './tool-set';

function isToolResult<T extends ToolSet>(
  part: SingleRequestTextStreamPart<T>,
): part is SingleRequestTextStreamPart<T> & { type: 'tool-result' } {
  return part.type === 'tool-result';
}

function isToolCall<T extends ToolSet>(
  part: SingleRequestTextStreamPart<T>,
): part is SingleRequestTextStreamPart<T> & { type: 'tool-call' } {
  return part.type === 'tool-call';
}

const testUsage: LanguageModelV3Usage = {
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

describe('runToolsTransformation', () => {
  it('should forward text parts', async () => {
    const inputStream: ReadableStream<LanguageModelV3StreamPart> =
      convertArrayToReadableStream([
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: 'text' },
        { type: 'text-end', id: '1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: testUsage,
        },
      ]);

    const transformedStream = runToolsTransformation({
      generateId: mockId({ prefix: 'id' }),
      tools: undefined,
      generatorStream: inputStream,
      tracer: new MockTracer(),
      telemetry: undefined,
      messages: [],
      system: undefined,
      abortSignal: undefined,
      repairToolCall: undefined,
      experimental_context: undefined,
    });

    const result = await convertReadableStreamToArray(transformedStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "id": "1",
          "type": "text-start",
        },
        {
          "delta": "text",
          "id": "1",
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
          "type": "finish",
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

  it('should handle async tool execution', async () => {
    const inputStream: ReadableStream<LanguageModelV3StreamPart> =
      convertArrayToReadableStream([
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'syncTool',
          input: `{ "value": "test" }`,
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: testUsage,
        },
      ]);

    const transformedStream = runToolsTransformation({
      generateId: mockId({ prefix: 'id' }),
      tools: {
        syncTool: {
          title: 'Sync Tool',
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => `${value}-sync-result`,
        },
      },
      generatorStream: inputStream,
      tracer: new MockTracer(),
      telemetry: undefined,
      messages: [],
      system: undefined,
      abortSignal: undefined,
      repairToolCall: undefined,
      experimental_context: undefined,
    });

    expect(await convertReadableStreamToArray(transformedStream))
      .toMatchInlineSnapshot(`
        [
          {
            "input": {
              "value": "test",
            },
            "providerExecuted": undefined,
            "providerMetadata": undefined,
            "title": "Sync Tool",
            "toolCallId": "call-1",
            "toolName": "syncTool",
            "type": "tool-call",
          },
          {
            "dynamic": false,
            "input": {
              "value": "test",
            },
            "output": "test-sync-result",
            "toolCallId": "call-1",
            "toolName": "syncTool",
            "type": "tool-result",
          },
          {
            "finishReason": "stop",
            "providerMetadata": undefined,
            "rawFinishReason": "stop",
            "type": "finish",
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

  it('should handle sync tool execution', async () => {
    const inputStream: ReadableStream<LanguageModelV3StreamPart> =
      convertArrayToReadableStream([
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'syncTool',
          input: `{ "value": "test" }`,
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: testUsage,
        },
      ]);

    const transformedStream = runToolsTransformation({
      generateId: mockId({ prefix: 'id' }),
      tools: {
        syncTool: {
          title: 'Sync Tool',
          inputSchema: z.object({ value: z.string() }),
          execute: ({ value }) => `${value}-sync-result`,
        },
      },
      generatorStream: inputStream,
      tracer: new MockTracer(),
      telemetry: undefined,
      messages: [],
      system: undefined,
      abortSignal: undefined,
      repairToolCall: undefined,
      experimental_context: undefined,
    });

    expect(await convertReadableStreamToArray(transformedStream))
      .toMatchInlineSnapshot(`
        [
          {
            "input": {
              "value": "test",
            },
            "providerExecuted": undefined,
            "providerMetadata": undefined,
            "title": "Sync Tool",
            "toolCallId": "call-1",
            "toolName": "syncTool",
            "type": "tool-call",
          },
          {
            "dynamic": false,
            "input": {
              "value": "test",
            },
            "output": "test-sync-result",
            "toolCallId": "call-1",
            "toolName": "syncTool",
            "type": "tool-result",
          },
          {
            "finishReason": "stop",
            "providerMetadata": undefined,
            "rawFinishReason": "stop",
            "type": "finish",
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

  it('should hold off on sending finish until the delayed tool result is received', async () => {
    const inputStream: ReadableStream<LanguageModelV3StreamPart> =
      convertArrayToReadableStream([
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'delayedTool',
          input: `{ "value": "test" }`,
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: testUsage,
        },
      ]);

    const transformedStream = runToolsTransformation({
      generateId: mockId({ prefix: 'id' }),
      tools: {
        delayedTool: {
          title: 'Delayed Tool',
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => {
            await delay(0); // Simulate delayed execution
            return `${value}-delayed-result`;
          },
        },
      },
      generatorStream: inputStream,
      tracer: new MockTracer(),
      telemetry: undefined,
      messages: [],
      system: undefined,
      abortSignal: undefined,
      repairToolCall: undefined,
      experimental_context: undefined,
    });

    const result = await convertReadableStreamToArray(transformedStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "input": {
            "value": "test",
          },
          "providerExecuted": undefined,
          "providerMetadata": undefined,
          "title": "Delayed Tool",
          "toolCallId": "call-1",
          "toolName": "delayedTool",
          "type": "tool-call",
        },
        {
          "dynamic": false,
          "input": {
            "value": "test",
          },
          "output": "test-delayed-result",
          "toolCallId": "call-1",
          "toolName": "delayedTool",
          "type": "tool-result",
        },
        {
          "finishReason": "stop",
          "providerMetadata": undefined,
          "rawFinishReason": "stop",
          "type": "finish",
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

  it('should try to repair tool call when the tool name is not found', async () => {
    const inputStream: ReadableStream<LanguageModelV3StreamPart> =
      convertArrayToReadableStream([
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
      ]);

    const transformedStream = runToolsTransformation({
      generateId: mockId({ prefix: 'id' }),
      generatorStream: inputStream,
      tracer: new MockTracer(),
      telemetry: undefined,
      messages: [],
      system: undefined,
      abortSignal: undefined,
      tools: {
        correctTool: {
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => `${value}-result`,
        },
      },
      repairToolCall: async ({ toolCall, tools, inputSchema, error }) => {
        expect(NoSuchToolError.isInstance(error)).toBe(true);
        expect(toolCall).toStrictEqual({
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'unknownTool',
          input: `{ "value": "test" }`,
        });

        return { ...toolCall, toolName: 'correctTool' };
      },
      experimental_context: undefined,
    });

    expect(await convertReadableStreamToArray(transformedStream))
      .toMatchInlineSnapshot(`
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
            "dynamic": false,
            "input": {
              "value": "test",
            },
            "output": "test-result",
            "toolCallId": "call-1",
            "toolName": "correctTool",
            "type": "tool-result",
          },
          {
            "finishReason": "stop",
            "providerMetadata": undefined,
            "rawFinishReason": "stop",
            "type": "finish",
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

  it('should not call execute for provider-executed tool calls', async () => {
    let toolExecuted = false;

    const inputStream: ReadableStream<LanguageModelV3StreamPart> =
      convertArrayToReadableStream([
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'providerTool',
          input: `{ "value": "test" }`,
          providerExecuted: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'providerTool',
          providerExecuted: true,
          result: { example: 'example' },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: testUsage,
        },
      ]);

    const transformedStream = runToolsTransformation({
      generateId: mockId({ prefix: 'id' }),
      tools: {
        providerTool: {
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => {
            toolExecuted = true;
            return `${value}-should-not-execute`;
          },
        },
      },
      generatorStream: inputStream,
      tracer: new MockTracer(),
      telemetry: undefined,
      messages: [],
      system: undefined,
      abortSignal: undefined,
      repairToolCall: undefined,
      experimental_context: undefined,
    });

    await convertReadableStreamToArray(transformedStream);

    expect(toolExecuted).toBe(false);
  });

  describe('provider-emitted tool-approval-request (MCP flow)', () => {
    it('should forward provider-emitted tool-approval-request with the correct tool call', async () => {
      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
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
        ]);

      const transformedStream = runToolsTransformation({
        generateId: mockId({ prefix: 'id' }),
        tools: {
          mcp_tool: {
            type: 'provider',
            id: 'mcp.mcp_tool',
            inputSchema: z.object({ query: z.string() }),
            args: {},
          },
        },
        generatorStream: inputStream,
        tracer: new MockTracer(),
        telemetry: undefined,
        messages: [],
        system: undefined,
        abortSignal: undefined,
        repairToolCall: undefined,
        experimental_context: undefined,
      });

      const result = await convertReadableStreamToArray(transformedStream);

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
            "type": "finish",
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

    it('should emit error when tool call is not found for provider approval request', async () => {
      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
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
        ]);

      const transformedStream = runToolsTransformation({
        generateId: mockId({ prefix: 'id' }),
        tools: undefined,
        generatorStream: inputStream,
        tracer: new MockTracer(),
        telemetry: undefined,
        messages: [],
        system: undefined,
        abortSignal: undefined,
        repairToolCall: undefined,
        experimental_context: undefined,
      });

      const result = await convertReadableStreamToArray(transformedStream);

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
            "type": "finish",
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
      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
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
        ]);

      const transformedStream = runToolsTransformation({
        generateId: mockId({ prefix: 'id' }),
        tools: {
          mcp_search: {
            type: 'provider',
            id: 'mcp.mcp_search',
            inputSchema: z.object({ query: z.string() }),
            args: {},
          },
          mcp_execute: {
            type: 'provider',
            id: 'mcp.mcp_execute',
            inputSchema: z.object({ command: z.string() }),
            args: {},
          },
        },
        generatorStream: inputStream,
        tracer: new MockTracer(),
        telemetry: undefined,
        messages: [],
        system: undefined,
        abortSignal: undefined,
        repairToolCall: undefined,
        experimental_context: undefined,
      });

      const result = await convertReadableStreamToArray(transformedStream);

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
            "type": "finish",
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

  describe('Tool.onInputAvailable', () => {
    it('should call onInputAvailable before the tool call is executed', async () => {
      const output: unknown[] = [];
      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'onInputAvailableTool',
            input: `{ "value": "test" }`,
          },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
          },
        ]);

      const transformedStream = runToolsTransformation({
        generateId: mockId({ prefix: 'id' }),
        tools: {
          onInputAvailableTool: tool({
            inputSchema: z.object({ value: z.string() }),
            onInputAvailable: async ({ input }) => {
              output.push({ type: 'onInputAvailable', input });
            },
          }),
        },
        generatorStream: inputStream,
        tracer: new MockTracer(),
        telemetry: undefined,
        messages: [],
        system: undefined,
        abortSignal: undefined,
        repairToolCall: undefined,
        experimental_context: undefined,
      });

      // consume each chunk to maintain order
      const reader = transformedStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output.push(value);
      }

      expect(output).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "value": "test",
            },
            "type": "onInputAvailable",
          },
          {
            "input": {
              "value": "test",
            },
            "providerExecuted": undefined,
            "providerMetadata": undefined,
            "title": undefined,
            "toolCallId": "call-1",
            "toolName": "onInputAvailableTool",
            "type": "tool-call",
          },
          {
            "finishReason": "stop",
            "providerMetadata": undefined,
            "rawFinishReason": "stop",
            "type": "finish",
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

    it('should call onInputAvailable when the tool needs approval', async () => {
      const output: unknown[] = [];
      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'onInputAvailableTool',
            input: `{ "value": "test" }`,
          },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
          },
        ]);

      const transformedStream = runToolsTransformation({
        generateId: mockId({ prefix: 'id' }),
        tools: {
          onInputAvailableTool: tool({
            inputSchema: z.object({ value: z.string() }),
            onInputAvailable: async ({ input }) => {
              output.push({ type: 'onInputAvailable', input });
            },
            needsApproval: true,
          }),
        },
        generatorStream: inputStream,
        tracer: new MockTracer(),
        telemetry: undefined,
        messages: [],
        system: undefined,
        abortSignal: undefined,
        repairToolCall: undefined,
        experimental_context: undefined,
      });

      // consume each chunk to maintain order
      const reader = transformedStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output.push(value);
      }

      expect(output).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "value": "test",
            },
            "type": "onInputAvailable",
          },
          {
            "input": {
              "value": "test",
            },
            "providerExecuted": undefined,
            "providerMetadata": undefined,
            "title": undefined,
            "toolCallId": "call-1",
            "toolName": "onInputAvailableTool",
            "type": "tool-call",
          },
          {
            "approvalId": "id-0",
            "toolCall": {
              "input": {
                "value": "test",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "title": undefined,
              "toolCallId": "call-1",
              "toolName": "onInputAvailableTool",
              "type": "tool-call",
            },
            "type": "tool-approval-request",
          },
          {
            "finishReason": "stop",
            "providerMetadata": undefined,
            "rawFinishReason": "stop",
            "type": "finish",
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

  describe('tool execution error handling', () => {
    it('should handle error thrown in async tool execution', async () => {
      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'failingTool',
            input: `{ "value": "test" }`,
          },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
          },
        ]);

      const toolError = new Error('Tool execution failed!');

      const transformedStream = runToolsTransformation({
        generateId: mockId({ prefix: 'id' }),
        tools: {
          failingTool: {
            title: 'Failing Tool',
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              await delay(10);
              throw toolError;
            },
          },
        },
        generatorStream: inputStream,
        tracer: new MockTracer(),
        telemetry: undefined,
        messages: [],
        system: undefined,
        abortSignal: undefined,
        repairToolCall: undefined,
        experimental_context: undefined,
      });

      const result = await convertReadableStreamToArray(transformedStream);

      // tool-call should come first
      expect(result[0]).toMatchObject({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'failingTool',
      });

      // tool-error should be included
      expect(result).toContainEqual(
        expect.objectContaining({
          type: 'tool-error',
          toolCallId: 'call-1',
          toolName: 'failingTool',
          error: toolError,
        }),
      );

      // finish should come last (stream closes properly)
      expect(result[result.length - 1]).toMatchObject({
        type: 'finish',
        finishReason: 'stop',
      });
    });

    it('should handle error thrown in sync tool execution', async () => {
      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'failingTool',
            input: `{ "value": "test" }`,
          },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
          },
        ]);

      const toolError = new Error('Sync tool failed!');

      const transformedStream = runToolsTransformation({
        generateId: mockId({ prefix: 'id' }),
        tools: {
          failingTool: {
            title: 'Failing Tool',
            inputSchema: z.object({ value: z.string() }),
            execute: ({ value }) => {
              throw toolError;
            },
          },
        },
        generatorStream: inputStream,
        tracer: new MockTracer(),
        telemetry: undefined,
        messages: [],
        system: undefined,
        abortSignal: undefined,
        repairToolCall: undefined,
        experimental_context: undefined,
      });

      const result = await convertReadableStreamToArray(transformedStream);

      // tool-error should be included
      expect(result).toContainEqual(
        expect.objectContaining({
          type: 'tool-error',
          toolCallId: 'call-1',
          toolName: 'failingTool',
          error: toolError,
        }),
      );

      // stream should close properly
      expect(result[result.length - 1]).toMatchObject({
        type: 'finish',
      });
    });
  });

  describe('parallel tool execution', () => {
    it('should use toolCallId for tracking (not generateId) to handle parallel tools correctly', async () => {
      // Frameworks can override _internal.generateId for message grouping, returning
      // a constant pendingMessageId for all calls within a request. Tool execution
      // tracking must use toolCallId (unique per LLM tool call) instead.
      const pendingMessageId = 'msg-abc123';
      const frameworkGenerateId = () => pendingMessageId;

      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'unique-call-1',
            toolName: 'toolA',
            input: `{ "value": "a" }`,
          },
          {
            type: 'tool-call',
            toolCallId: 'unique-call-2',
            toolName: 'toolB',
            input: `{ "value": "b" }`,
          },
          {
            type: 'tool-call',
            toolCallId: 'unique-call-3',
            toolName: 'toolC',
            input: `{ "value": "c" }`,
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage: testUsage,
          },
        ]);

      const transformedStream = runToolsTransformation({
        generateId: frameworkGenerateId,
        tools: {
          toolA: {
            title: 'Tool A',
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              await delay(30);
              return `${value}-result`;
            },
          },
          toolB: {
            title: 'Tool B',
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              await delay(10);
              return `${value}-result`;
            },
          },
          toolC: {
            title: 'Tool C',
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              await delay(20);
              return `${value}-result`;
            },
          },
        },
        generatorStream: inputStream,
        tracer: new MockTracer(),
        telemetry: undefined,
        messages: [],
        system: undefined,
        abortSignal: undefined,
        repairToolCall: undefined,
        experimental_context: undefined,
      });

      const result = await convertReadableStreamToArray(transformedStream);

      // All three tool results should be captured
      // (Bug: without the fix, only 1 result would be captured because
      // outstandingToolResults Set would use the same ID for all tools)
      const toolResults = result.filter(isToolResult);
      expect(toolResults).toHaveLength(3);
      expect(toolResults.map(r => r.toolCallId).sort()).toEqual([
        'unique-call-1',
        'unique-call-2',
        'unique-call-3',
      ]);

      // Finish should be last
      expect(result[result.length - 1]).toMatchObject({
        type: 'finish',
      });
    });

    it('should capture all results when multiple tools execute in parallel with different delays', async () => {
      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'slowTool',
            input: `{ "value": "slow" }`,
          },
          {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'fastTool',
            input: `{ "value": "fast" }`,
          },
          {
            type: 'tool-call',
            toolCallId: 'call-3',
            toolName: 'mediumTool',
            input: `{ "value": "medium" }`,
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage: testUsage,
          },
        ]);

      const transformedStream = runToolsTransformation({
        generateId: mockId({ prefix: 'id' }),
        tools: {
          slowTool: {
            title: 'Slow Tool',
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              await delay(50); // Slowest
              return `${value}-result`;
            },
          },
          fastTool: {
            title: 'Fast Tool',
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              await delay(10); // Fastest
              return `${value}-result`;
            },
          },
          mediumTool: {
            title: 'Medium Tool',
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              await delay(30); // Medium
              return `${value}-result`;
            },
          },
        },
        generatorStream: inputStream,
        tracer: new MockTracer(),
        telemetry: undefined,
        messages: [],
        system: undefined,
        abortSignal: undefined,
        repairToolCall: undefined,
        experimental_context: undefined,
      });

      const result = await convertReadableStreamToArray(transformedStream);

      // All three tool calls should be present
      const toolCalls = result.filter(isToolCall);
      expect(toolCalls).toHaveLength(3);

      // All three tool results should be present
      const toolResults = result.filter(isToolResult);
      expect(toolResults).toHaveLength(3);
      expect(toolResults.map(r => r.toolCallId).sort()).toEqual([
        'call-1',
        'call-2',
        'call-3',
      ]);

      // Finish should be last
      expect(result[result.length - 1]).toMatchObject({
        type: 'finish',
      });
    });

    it('should not close stream prematurely when fast tool completes before slow tool', async () => {
      const executionOrder: string[] = [];

      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'slow-call',
            toolName: 'slowTool',
            input: `{ "value": "slow" }`,
          },
          {
            type: 'tool-call',
            toolCallId: 'fast-call',
            toolName: 'fastTool',
            input: `{ "value": "fast" }`,
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage: testUsage,
          },
        ]);

      const transformedStream = runToolsTransformation({
        generateId: mockId({ prefix: 'id' }),
        tools: {
          slowTool: {
            title: 'Slow Tool',
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              await delay(50);
              executionOrder.push('slow-completed');
              return `${value}-slow-result`;
            },
          },
          fastTool: {
            title: 'Fast Tool',
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              await delay(5);
              executionOrder.push('fast-completed');
              return `${value}-fast-result`;
            },
          },
        },
        generatorStream: inputStream,
        tracer: new MockTracer(),
        telemetry: undefined,
        messages: [],
        system: undefined,
        abortSignal: undefined,
        repairToolCall: undefined,
        experimental_context: undefined,
      });

      const result = await convertReadableStreamToArray(transformedStream);

      // Fast tool should complete first
      expect(executionOrder).toEqual(['fast-completed', 'slow-completed']);

      // Both results should be captured
      const toolResults = result.filter(isToolResult);
      expect(toolResults).toHaveLength(2);
      expect(toolResults.map(r => r.output).sort()).toEqual([
        'fast-fast-result',
        'slow-slow-result',
      ]);

      // Stream should close properly after all tools complete
      expect(result[result.length - 1]).toMatchObject({
        type: 'finish',
      });
    });

    it('should handle many parallel tool calls without losing results', async () => {
      const toolCount = 10;
      const toolCalls = Array.from({ length: toolCount }, (_, i) => ({
        type: 'tool-call' as const,
        toolCallId: `call-${i}`,
        toolName: 'parallelTool',
        input: `{ "index": ${i} }`,
      }));

      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
          ...toolCalls,
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage: testUsage,
          },
        ]);

      const transformedStream = runToolsTransformation({
        generateId: mockId({ prefix: 'id' }),
        tools: {
          parallelTool: {
            title: 'Parallel Tool',
            inputSchema: z.object({ index: z.number() }),
            execute: async ({ index }) => {
              // Random delay to simulate real-world variance
              await delay(Math.random() * 20);
              return `result-${index}`;
            },
          },
        },
        generatorStream: inputStream,
        tracer: new MockTracer(),
        telemetry: undefined,
        messages: [],
        system: undefined,
        abortSignal: undefined,
        repairToolCall: undefined,
        experimental_context: undefined,
      });

      const result = await convertReadableStreamToArray(transformedStream);

      // All tool results should be captured
      const toolResults = result.filter(isToolResult);
      expect(toolResults).toHaveLength(toolCount);

      // Verify all results are present (order may vary)
      const resultOutputs = toolResults.map(r => r.output).sort();
      const expectedOutputs = Array.from(
        { length: toolCount },
        (_, i) => `result-${i}`,
      ).sort();
      expect(resultOutputs).toEqual(expectedOutputs);

      // Finish should be last
      expect(result[result.length - 1]).toMatchObject({
        type: 'finish',
      });
    });
  });
});
