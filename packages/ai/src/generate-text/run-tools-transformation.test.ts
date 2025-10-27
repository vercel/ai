import { LanguageModelV3StreamPart } from '@ai-sdk/provider';
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
import { runToolsTransformation } from './run-tools-transformation';

const testUsage = {
  inputTokens: 3,
  outputTokens: 10,
  totalTokens: 13,
  reasoningTokens: undefined,
  cachedInputTokens: undefined,
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
          finishReason: 'stop',
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
          "type": "finish",
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 3,
            "outputTokens": 10,
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
          finishReason: 'stop',
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
            "type": "finish",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 3,
              "outputTokens": 10,
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
          finishReason: 'stop',
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
            "type": "finish",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 3,
              "outputTokens": 10,
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
          finishReason: 'stop',
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
          "type": "finish",
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 3,
            "outputTokens": 10,
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
          finishReason: 'stop',
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
            "type": "finish",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 3,
              "outputTokens": 10,
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
          finishReason: 'stop',
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
            finishReason: 'stop',
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
            "type": "finish",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 3,
              "outputTokens": 10,
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
            finishReason: 'stop',
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
            "type": "finish",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 3,
              "outputTokens": 10,
              "reasoningTokens": undefined,
              "totalTokens": 13,
            },
          },
        ]
      `);
    });
  });
});
