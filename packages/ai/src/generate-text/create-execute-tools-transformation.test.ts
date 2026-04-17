import { delay, tool } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { asLanguageModelUsage } from '../types/usage';
import { createExecuteToolsTransformation } from './create-execute-tools-transformation';
import { LanguageModelStreamPart } from './stream-language-model-call';

const finishChunk = {
  type: 'model-call-end' as const,
  finishReason: 'stop' as const,
  rawFinishReason: 'stop' as const,
  usage: asLanguageModelUsage({
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
  }),
};

describe('createExecuteToolsTransformation', () => {
  it('should handle async tool execution', async () => {
    const tools = {
      syncTool: tool({
        inputSchema: z.object({ value: z.string() }),
        execute: async ({ value }) => `${value}-sync-result`,
      }),
    };

    const inputStream: ReadableStream<LanguageModelStreamPart<typeof tools>> =
      convertArrayToReadableStream([
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'syncTool',
          input: { value: 'test' },
        },
        finishChunk,
      ]);

    const transformedStream = inputStream.pipeThrough(
      createExecuteToolsTransformation({
        generateId: mockId({ prefix: 'id' }),
        tools,
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        timeout: undefined,
        abortSignal: undefined,
        toolsContext: {},
      }),
    );

    expect(await convertReadableStreamToArray(transformedStream))
      .toMatchInlineSnapshot(`
        [
          {
            "input": {
              "value": "test",
            },
            "toolCallId": "call-1",
            "toolName": "syncTool",
            "type": "tool-call",
          },
          {
            "finishReason": "stop",
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
        ]
      `);
  });

  it('should handle sync tool execution', async () => {
    const tools = {
      syncTool: tool({
        inputSchema: z.object({ value: z.string() }),
        execute: async ({ value }) => `${value}-sync-result`,
      }),
    };

    const inputStream: ReadableStream<LanguageModelStreamPart<typeof tools>> =
      convertArrayToReadableStream([
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'syncTool',
          input: { value: 'test' },
        },
        finishChunk,
      ]);

    const transformedStream = createExecuteToolsTransformation({
      generateId: mockId({ prefix: 'id' }),
      tools,
      telemetry: undefined,
      callId: 'test-telemetry-call-id',
      messages: [],
      abortSignal: undefined,
      timeout: undefined,
      toolsContext: {},
    });

    expect(
      await convertReadableStreamToArray(
        inputStream.pipeThrough(transformedStream),
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "input": {
            "value": "test",
          },
          "toolCallId": "call-1",
          "toolName": "syncTool",
          "type": "tool-call",
        },
        {
          "finishReason": "stop",
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
      ]
    `);
  });

  it('should not call execute for provider-executed tool calls', async () => {
    const tools = {
      providerTool: tool({
        inputSchema: z.object({ value: z.string() }),
        execute: async ({ value }) => {
          toolExecuted = true;
          return `${value}-should-not-execute`;
        },
      }),
    };

    let toolExecuted = false;

    const inputStream: ReadableStream<LanguageModelStreamPart<typeof tools>> =
      convertArrayToReadableStream([
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'providerTool',
          input: { value: 'test' },
          providerExecuted: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'providerTool',
          providerExecuted: true,
          input: { value: 'test' },
          output: 'example-result',
        },
        finishChunk,
      ]);

    const transformedStream = inputStream.pipeThrough(
      createExecuteToolsTransformation({
        generateId: mockId({ prefix: 'id' }),
        tools,
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        timeout: undefined,
        toolsContext: {},
      }),
    );

    await convertReadableStreamToArray(transformedStream);

    expect(toolExecuted).toBe(false);
  });

  describe('onToolCallStart and onToolCallFinish callbacks', () => {
    it('should call onToolCallStart before tool execution and onToolCallFinish after', async () => {
      const tools = {
        testTool: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => {
            callOrder.push('execute');
            return `${value}-result`;
          },
        }),
      };

      const callOrder: string[] = [];

      const inputStream: ReadableStream<LanguageModelStreamPart<typeof tools>> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'testTool',
            input: { value: 'hello' },
          },
          finishChunk,
        ]);

      const transformedStream = inputStream.pipeThrough(
        createExecuteToolsTransformation({
          generateId: mockId({ prefix: 'id' }),
          tools,
          telemetry: undefined,
          callId: 'test-telemetry-call-id',
          messages: [],
          timeout: undefined,
          abortSignal: undefined,
          toolsContext: {},
          onToolCallStart: async () => {
            callOrder.push('onToolCallStart');
          },
          onToolCallFinish: async () => {
            callOrder.push('onToolCallFinish');
          },
        }),
      );

      await convertReadableStreamToArray(transformedStream);

      expect(callOrder).toEqual([
        'onToolCallStart',
        'execute',
        'onToolCallFinish',
      ]);
    });

    it('should pass stepNumber and model to callbacks', async () => {
      const tools = {
        testTool: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => `${value}-result`,
        }),
      };

      const startEvents: unknown[] = [];
      const finishEvents: unknown[] = [];

      const inputStream: ReadableStream<LanguageModelStreamPart<typeof tools>> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'testTool',
            input: { value: 'test' },
          },
          finishChunk,
        ]);

      const transformedStream = inputStream.pipeThrough(
        createExecuteToolsTransformation({
          generateId: mockId({ prefix: 'id' }),
          tools,
          telemetry: undefined,
          callId: 'test-telemetry-call-id',
          messages: [],
          timeout: undefined,
          abortSignal: undefined,
          toolsContext: { testTool: { value: 'test' } },
          stepNumber: 2,
          provider: 'test-provider',
          modelId: 'test-model',
          onToolCallStart: async event => {
            startEvents.push({
              stepNumber: event.stepNumber,
              provider: event.provider,
              modelId: event.modelId,
              toolName: event.toolCall.toolName,
            });
          },
          onToolCallFinish: async event => {
            finishEvents.push({
              stepNumber: event.stepNumber,
              provider: event.provider,
              modelId: event.modelId,
              toolName: event.toolCall.toolName,
            });
          },
        }),
      );

      await convertReadableStreamToArray(transformedStream);

      expect(startEvents).toEqual([
        {
          stepNumber: 2,
          provider: 'test-provider',
          modelId: 'test-model',
          toolName: 'testTool',
        },
      ]);
      expect(finishEvents).toEqual([
        {
          stepNumber: 2,
          provider: 'test-provider',
          modelId: 'test-model',
          toolName: 'testTool',
        },
      ]);
    });

    it('should call onToolCallFinish with success data', async () => {
      const tools = {
        testTool: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => `${value}-result`,
        }),
      };

      const finishEvents: unknown[] = [];

      const inputStream: ReadableStream<LanguageModelStreamPart<typeof tools>> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'testTool',
            input: { value: 'abc' },
          },
          finishChunk,
        ]);

      const transformedStream = inputStream.pipeThrough(
        createExecuteToolsTransformation({
          generateId: mockId({ prefix: 'id' }),
          tools,
          telemetry: undefined,
          callId: 'test-telemetry-call-id',
          messages: [],
          timeout: undefined,
          abortSignal: undefined,
          toolsContext: {},
          onToolCallFinish: async event => {
            finishEvents.push(event);
          },
        }),
      );

      await convertReadableStreamToArray(transformedStream);

      expect(finishEvents.length).toBe(1);
      expect(finishEvents[0]).toMatchObject({
        success: true,
        output: 'abc-result',
        toolCall: {
          toolName: 'testTool',
          toolCallId: 'call-1',
        },
      });
      expect((finishEvents[0] as any).durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should call onToolCallFinish with error data when tool fails', async () => {
      const tools = {
        failingTool: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => {
            if (value === 'test') {
              throw new Error('tool failed');
            }
            return 'test-result';
          },
        }),
      };

      const finishEvents: unknown[] = [];
      const toolError = new Error('tool failed');

      const inputStream: ReadableStream<LanguageModelStreamPart<typeof tools>> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'failingTool',
            input: { value: 'test' },
          },
          finishChunk,
        ]);

      const transformedStream = inputStream.pipeThrough(
        createExecuteToolsTransformation({
          generateId: mockId({ prefix: 'id' }),
          tools,
          telemetry: undefined,
          callId: 'test-telemetry-call-id',
          messages: [],
          timeout: undefined,
          abortSignal: undefined,
          toolsContext: {},
          onToolCallFinish: async event => {
            finishEvents.push(event);
          },
        }),
      );

      await convertReadableStreamToArray(transformedStream);

      expect(finishEvents.length).toBe(1);
      expect(finishEvents[0]).toMatchObject({
        success: false,
        error: toolError,
        toolCall: {
          toolName: 'failingTool',
          toolCallId: 'call-1',
        },
      });
    });

    it('should not call callbacks for tools without execute', async () => {
      const tools = {
        noExecuteTool: tool({
          inputSchema: z.object({ value: z.string() }),
        }),
      };

      const startEvents: unknown[] = [];
      const finishEvents: unknown[] = [];

      const inputStream: ReadableStream<LanguageModelStreamPart<typeof tools>> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'noExecuteTool',
            input: { value: 'test' },
          },
          finishChunk,
        ]);

      const transformedStream = inputStream.pipeThrough(
        createExecuteToolsTransformation({
          generateId: mockId({ prefix: 'id' }),
          tools,
          telemetry: undefined,
          callId: 'test-telemetry-call-id',
          messages: [],
          timeout: undefined,
          abortSignal: undefined,
          toolsContext: {},
          onToolCallStart: async event => {
            startEvents.push(event);
          },
          onToolCallFinish: async event => {
            finishEvents.push(event);
          },
        }),
      );

      await convertReadableStreamToArray(transformedStream);

      expect(startEvents.length).toBe(0);
      expect(finishEvents.length).toBe(0);
    });

    it('should call callbacks for each tool in a multi-tool stream', async () => {
      const tools = {
        testTool: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => `${value}-result`,
        }),
      };

      const startEvents: unknown[] = [];
      const finishEvents: unknown[] = [];

      const inputStream: ReadableStream<LanguageModelStreamPart<typeof tools>> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'testTool',
            input: { value: 'a' },
          },
          {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'testTool',
            input: { value: 'b' },
          },
          finishChunk,
        ]);

      const transformedStream = inputStream.pipeThrough(
        createExecuteToolsTransformation({
          generateId: mockId({ prefix: 'id' }),
          tools,
          telemetry: undefined,
          callId: 'test-telemetry-call-id',
          messages: [],
          timeout: undefined,
          abortSignal: undefined,
          toolsContext: {},
          onToolCallStart: async event => {
            startEvents.push(event.toolCall.toolCallId);
          },
          onToolCallFinish: async event => {
            finishEvents.push(event.toolCall.toolCallId);
          },
        }),
      );

      await convertReadableStreamToArray(transformedStream);

      expect(startEvents).toEqual(['call-1', 'call-2']);
      expect(finishEvents).toEqual(['call-1', 'call-2']);
    });

    it('should not call callbacks for provider-executed tools', async () => {
      const tools = {
        providerTool: tool({
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ result: z.string() }),
        }),
      };

      const startEvents: unknown[] = [];
      const finishEvents: unknown[] = [];

      const inputStream: ReadableStream<LanguageModelStreamPart<typeof tools>> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'providerTool',
            input: { value: 'test' },
            providerExecuted: true,
          },
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'providerTool',
            providerExecuted: true,
            input: { value: 'test' },
            output: { result: 'example' },
          },
          finishChunk,
        ]);

      const transformedStream = inputStream.pipeThrough(
        createExecuteToolsTransformation({
          generateId: mockId({ prefix: 'id' }),
          tools,
          telemetry: undefined,
          callId: 'test-telemetry-call-id',
          messages: [],
          timeout: undefined,
          abortSignal: undefined,
          toolsContext: {},
          onToolCallStart: async event => {
            startEvents.push(event);
          },
          onToolCallFinish: async event => {
            finishEvents.push(event);
          },
        }),
      );

      await convertReadableStreamToArray(transformedStream);

      expect(startEvents.length).toBe(0);
      expect(finishEvents.length).toBe(0);
    });
  });

  describe('tool execution error handling', () => {
    it('should handle error thrown in async tool execution', async () => {
      const tools = {
        failingTool: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => {
            await delay(10); // TODO find elegant way to test setTimeout
            if (value === 'test') {
              throw toolError;
            }
            return 'test-result';
          },
        }),
      };

      const inputStream: ReadableStream<LanguageModelStreamPart<typeof tools>> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'failingTool',
            input: { value: 'test' },
          },
          finishChunk,
        ]);

      const toolError = new Error('Tool execution failed!');

      const transformedStream = inputStream.pipeThrough(
        createExecuteToolsTransformation({
          generateId: mockId({ prefix: 'id' }),
          tools,
          telemetry: undefined,
          callId: 'test-telemetry-call-id',
          messages: [],
          abortSignal: undefined,
          timeout: undefined,
          toolsContext: {},
        }),
      );

      const result = await convertReadableStreamToArray(transformedStream);

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "value": "test",
            },
            "toolCallId": "call-1",
            "toolName": "failingTool",
            "type": "tool-call",
          },
          {
            "finishReason": "stop",
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
          {
            "dynamic": false,
            "error": [Error: Tool execution failed!],
            "input": {
              "value": "test",
            },
            "toolCallId": "call-1",
            "toolName": "failingTool",
            "type": "tool-error",
          },
        ]
      `);
    });

    it('should handle error thrown in sync tool execution', async () => {
      const tools = {
        failingTool: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: ({ value }) => {
            if (value === 'test') {
              throw toolError;
            }
            return 'test-result';
          },
        }),
      };

      const inputStream: ReadableStream<LanguageModelStreamPart<typeof tools>> =
        convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'failingTool',
            input: { value: 'test' },
          },
          finishChunk,
        ]);

      const toolError = new Error('Sync tool failed!');

      const transformedStream = inputStream.pipeThrough(
        createExecuteToolsTransformation({
          generateId: mockId({ prefix: 'id' }),
          tools,
          telemetry: undefined,
          callId: 'test-telemetry-call-id',
          messages: [],
          abortSignal: undefined,
          toolsContext: {},
        }),
      );

      const result = await convertReadableStreamToArray(transformedStream);

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "value": "test",
            },
            "toolCallId": "call-1",
            "toolName": "failingTool",
            "type": "tool-call",
          },
          {
            "finishReason": "stop",
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
          {
            "dynamic": false,
            "error": [Error: Sync tool failed!],
            "input": {
              "value": "test",
            },
            "toolCallId": "call-1",
            "toolName": "failingTool",
            "type": "tool-error",
          },
        ]
      `);
    });
  });
});
