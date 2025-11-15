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

  describe('writeSource', () => {
    it('should allow tools to write URL sources to the stream', async () => {
      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'searchTool',
            input: `{ "query": "test" }`,
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
          searchTool: tool({
            inputSchema: z.object({ query: z.string() }),
            execute: async ({ query }, { writeSource }) => {
              // Write a URL source
              writeSource?.({
                sourceType: 'url',
                url: 'https://example.com/doc',
                title: 'Example Document',
              });

              return `Results for: ${query}`;
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

      const result = await convertReadableStreamToArray(transformedStream);

      // Should contain tool-call, source, tool-result, and finish
      expect(result).toHaveLength(4);
      expect(result[0]).toMatchObject({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'searchTool',
      });
      expect(result[1]).toMatchObject({
        type: 'source',
        sourceType: 'url',
        url: 'https://example.com/doc',
        title: 'Example Document',
        id: 'id-1', // auto-generated (id-0 is used for toolExecutionId)
      });
      expect(result[2]).toMatchObject({
        type: 'tool-result',
        toolCallId: 'call-1',
        output: 'Results for: test',
      });
      expect(result[3]).toMatchObject({
        type: 'finish',
        finishReason: 'stop',
      });
    });

    it('should allow tools to write document sources to the stream', async () => {
      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'searchTool',
            input: `{ "query": "test" }`,
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
          searchTool: tool({
            inputSchema: z.object({ query: z.string() }),
            execute: async ({ query }, { writeSource }) => {
              // Write a document source
              writeSource?.({
                sourceType: 'document',
                mediaType: 'application/pdf',
                title: 'Research Paper',
                filename: 'paper.pdf',
              });

              return `Results for: ${query}`;
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

      const result = await convertReadableStreamToArray(transformedStream);

      // Should contain tool-call, source, tool-result, and finish
      expect(result).toHaveLength(4);
      expect(result[1]).toMatchObject({
        type: 'source',
        sourceType: 'document',
        mediaType: 'application/pdf',
        title: 'Research Paper',
        filename: 'paper.pdf',
        id: 'id-1', // auto-generated (id-0 is used for toolExecutionId)
      });
    });

    it('should allow tools to write multiple sources to the stream', async () => {
      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'searchTool',
            input: `{ "query": "test" }`,
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
          searchTool: tool({
            inputSchema: z.object({ query: z.string() }),
            execute: async ({ query }, { writeSource }) => {
              // Write multiple sources
              writeSource?.({
                sourceType: 'url',
                url: 'https://example.com/doc1',
                title: 'Document 1',
              });

              writeSource?.({
                sourceType: 'url',
                url: 'https://example.com/doc2',
                title: 'Document 2',
              });

              return `Results for: ${query}`;
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

      const result = await convertReadableStreamToArray(transformedStream);

      // Should contain tool-call, source1, source2, tool-result, and finish
      expect(result).toHaveLength(5);
      expect(result[1]).toMatchObject({
        type: 'source',
        sourceType: 'url',
        url: 'https://example.com/doc1',
        title: 'Document 1',
        id: 'id-1', // id-0 is used for toolExecutionId
      });
      expect(result[2]).toMatchObject({
        type: 'source',
        sourceType: 'url',
        url: 'https://example.com/doc2',
        title: 'Document 2',
        id: 'id-2',
      });
    });

    it('should use provided ID when specified', async () => {
      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'searchTool',
            input: `{ "query": "test" }`,
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
          searchTool: tool({
            inputSchema: z.object({ query: z.string() }),
            execute: async ({ query }, { writeSource }) => {
              // Write source with custom ID
              writeSource?.({
                sourceType: 'url',
                url: 'https://example.com/doc',
                title: 'Example Document',
                id: 'custom-source-id',
              });

              return `Results for: ${query}`;
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

      const result = await convertReadableStreamToArray(transformedStream);

      expect(result[1]).toMatchObject({
        type: 'source',
        id: 'custom-source-id', // should use provided ID
      });
    });

    it('should work when writeSource is not called', async () => {
      const inputStream: ReadableStream<LanguageModelV3StreamPart> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'simpleTool',
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
          simpleTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              // Don't use writeSource at all
              return `Result: ${value}`;
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

      const result = await convertReadableStreamToArray(transformedStream);

      // Should work normally without sources
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        type: 'tool-call',
      });
      expect(result[1]).toMatchObject({
        type: 'tool-result',
        output: 'Result: test',
      });
      expect(result[2]).toMatchObject({
        type: 'finish',
      });
    });
  });
});
