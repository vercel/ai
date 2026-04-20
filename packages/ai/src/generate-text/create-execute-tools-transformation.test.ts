import { delay, tool } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { TypeValidationError } from '../error';
import { asLanguageModelUsage } from '../types/usage';
import { ModelCallEndEvent } from './core-events';
import { createExecuteToolsTransformation } from './create-execute-tools-transformation';
import { LanguageModelStreamPart } from './stream-language-model-call';
import {
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
} from './tool-execution-events';

// mock now function
vi.mock('../util/now', () => ({
  now: vi.fn(),
}));
import { now } from '../util/now';
const mockNow = vi.mocked(now);

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
  beforeEach(() => {
    vi.clearAllMocks();
    mockNow.mockReturnValue(0);
  });

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

  describe('onToolExecutionStart and onToolExecutionEnd callbacks', () => {
    it('should call onModelCallEnd before starting tool execution', async () => {
      const tools = {
        testTool: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => `${value}-result`,
        }),
      };

      const callOrder: string[] = [];
      const modelCallEndEvents: ModelCallEndEvent<typeof tools>[] = [];

      const inputStream: ReadableStream<LanguageModelStreamPart<typeof tools>> =
        convertArrayToReadableStream([
          {
            type: 'text-delta',
            id: 'text-1',
            text: 'Hello ',
          },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'testTool',
            input: { value: 'hello' },
          },
          {
            type: 'model-call-response-metadata',
            id: 'response-1',
            timestamp: new Date('2025-01-01T00:00:00.000Z'),
            modelId: 'response-model',
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
          provider: 'test-provider',
          modelId: 'test-model',
          onModelCallEnd: async event => {
            callOrder.push('onModelCallEnd');
            modelCallEndEvents.push(event);
          },
          onToolExecutionStart: async () => {
            callOrder.push('onToolExecutionStart');
          },
        }),
      );

      await convertReadableStreamToArray(transformedStream);

      expect(callOrder).toEqual(['onModelCallEnd', 'onToolExecutionStart']);
      expect(modelCallEndEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "files": [],
            "finishReason": "stop",
            "modelId": "test-model",
            "provider": "test-provider",
            "reasoning": [],
            "text": "Hello ",
            "toolCalls": [
              {
                "input": {
                  "value": "hello",
                },
                "toolCallId": "call-1",
                "toolName": "testTool",
                "type": "tool-call",
              },
            ],
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

    it('should call onToolExecutionStart before tool execution and onToolExecutionEnd after', async () => {
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
          onToolExecutionStart: async () => {
            callOrder.push('onToolExecutionStart');
          },
          onToolExecutionEnd: async () => {
            callOrder.push('onToolExecutionEnd');
          },
        }),
      );

      await convertReadableStreamToArray(transformedStream);

      expect(callOrder).toEqual([
        'onToolExecutionStart',
        'execute',
        'onToolExecutionEnd',
      ]);
    });

    it('should pass stepNumber and model to callbacks', async () => {
      const tools = {
        testTool: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => `${value}-result`,
        }),
      };

      const startEvents: ToolExecutionStartEvent<typeof tools>[] = [];
      const finishEvents: ToolExecutionEndEvent<typeof tools>[] = [];

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
          onToolExecutionStart: async event => {
            startEvents.push(event);
          },
          onToolExecutionEnd: async event => {
            finishEvents.push(event);
          },
        }),
      );

      await convertReadableStreamToArray(transformedStream);

      expect(startEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "context": {
              "value": "test",
            },
            "functionId": undefined,
            "messages": [],
            "modelId": "test-model",
            "provider": "test-provider",
            "stepNumber": 2,
            "toolCall": {
              "input": {
                "value": "test",
              },
              "toolCallId": "call-1",
              "toolName": "testTool",
              "type": "tool-call",
            },
          },
        ]
      `);
      expect(finishEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "context": {
              "value": "test",
            },
            "durationMs": 0,
            "functionId": undefined,
            "messages": [],
            "modelId": "test-model",
            "output": "test-result",
            "provider": "test-provider",
            "stepNumber": 2,
            "success": true,
            "toolCall": {
              "input": {
                "value": "test",
              },
              "toolCallId": "call-1",
              "toolName": "testTool",
              "type": "tool-call",
            },
          },
        ]
      `);
    });

    it('should call onToolExecutionEnd with success data', async () => {
      const tools = {
        testTool: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => `${value}-result`,
        }),
      };

      const toolExecutionEndEvents: ToolExecutionEndEvent<typeof tools>[] = [];

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
          onToolExecutionEnd: async event => {
            toolExecutionEndEvents.push(event);
          },
        }),
      );

      await convertReadableStreamToArray(transformedStream);

      expect(toolExecutionEndEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "context": undefined,
            "durationMs": 0,
            "functionId": undefined,
            "messages": [],
            "modelId": undefined,
            "output": "abc-result",
            "provider": undefined,
            "stepNumber": undefined,
            "success": true,
            "toolCall": {
              "input": {
                "value": "abc",
              },
              "toolCallId": "call-1",
              "toolName": "testTool",
              "type": "tool-call",
            },
          },
        ]
      `);
    });

    it('should call onToolExecutionEnd with error data when tool fails', async () => {
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

      const toolExecutionEndEvents: ToolExecutionEndEvent<typeof tools>[] = [];

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
          onToolExecutionEnd: async event => {
            toolExecutionEndEvents.push(event);
          },
        }),
      );

      await convertReadableStreamToArray(transformedStream);

      expect(toolExecutionEndEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "context": undefined,
            "durationMs": 0,
            "error": [Error: tool failed],
            "functionId": undefined,
            "messages": [],
            "modelId": undefined,
            "provider": undefined,
            "stepNumber": undefined,
            "success": false,
            "toolCall": {
              "input": {
                "value": "test",
              },
              "toolCallId": "call-1",
              "toolName": "failingTool",
              "type": "tool-call",
            },
          },
        ]
      `);
    });

    it('should not call callbacks for tools without execute', async () => {
      const tools = {
        noExecuteTool: tool({
          inputSchema: z.object({ value: z.string() }),
        }),
      };

      const toolExecutionStartEvents: ToolExecutionStartEvent<typeof tools>[] =
        [];
      const toolExecutionEndEvents: ToolExecutionEndEvent<typeof tools>[] = [];

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
          onToolExecutionStart: async event => {
            toolExecutionStartEvents.push(event);
          },
          onToolExecutionEnd: async event => {
            toolExecutionEndEvents.push(event);
          },
        }),
      );

      await convertReadableStreamToArray(transformedStream);

      expect(toolExecutionStartEvents).toMatchInlineSnapshot(`[]`);
      expect(toolExecutionEndEvents).toMatchInlineSnapshot(`[]`);
    });

    it('should call callbacks for each tool in a multi-tool stream', async () => {
      const tools = {
        testTool: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => `${value}-result`,
        }),
      };

      const toolExecutionStartEvents: ToolExecutionStartEvent<typeof tools>[] =
        [];
      const toolExecutionEndEvents: ToolExecutionEndEvent<typeof tools>[] = [];

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
          onToolExecutionStart: async event => {
            toolExecutionStartEvents.push(event);
          },
          onToolExecutionEnd: async event => {
            toolExecutionEndEvents.push(event);
          },
        }),
      );

      await convertReadableStreamToArray(transformedStream);

      expect(toolExecutionStartEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "context": undefined,
            "functionId": undefined,
            "messages": [],
            "modelId": undefined,
            "provider": undefined,
            "stepNumber": undefined,
            "toolCall": {
              "input": {
                "value": "a",
              },
              "toolCallId": "call-1",
              "toolName": "testTool",
              "type": "tool-call",
            },
          },
          {
            "callId": "test-telemetry-call-id",
            "context": undefined,
            "functionId": undefined,
            "messages": [],
            "modelId": undefined,
            "provider": undefined,
            "stepNumber": undefined,
            "toolCall": {
              "input": {
                "value": "b",
              },
              "toolCallId": "call-2",
              "toolName": "testTool",
              "type": "tool-call",
            },
          },
        ]
      `);
      expect(toolExecutionEndEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "context": undefined,
            "durationMs": 0,
            "functionId": undefined,
            "messages": [],
            "modelId": undefined,
            "output": "a-result",
            "provider": undefined,
            "stepNumber": undefined,
            "success": true,
            "toolCall": {
              "input": {
                "value": "a",
              },
              "toolCallId": "call-1",
              "toolName": "testTool",
              "type": "tool-call",
            },
          },
          {
            "callId": "test-telemetry-call-id",
            "context": undefined,
            "durationMs": 0,
            "functionId": undefined,
            "messages": [],
            "modelId": undefined,
            "output": "b-result",
            "provider": undefined,
            "stepNumber": undefined,
            "success": true,
            "toolCall": {
              "input": {
                "value": "b",
              },
              "toolCallId": "call-2",
              "toolName": "testTool",
              "type": "tool-call",
            },
          },
        ]
      `);
    });

    it('should not call callbacks for provider-executed tools', async () => {
      const tools = {
        providerTool: tool({
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ result: z.string() }),
        }),
      };

      const toolExecutionStartEvents: ToolExecutionStartEvent<typeof tools>[] =
        [];
      const toolExecutionEndEvents: ToolExecutionEndEvent<typeof tools>[] = [];

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
          onToolExecutionStart: async event => {
            toolExecutionStartEvents.push(event);
          },
          onToolExecutionEnd: async event => {
            toolExecutionEndEvents.push(event);
          },
        }),
      );

      await convertReadableStreamToArray(transformedStream);

      expect(toolExecutionStartEvents).toMatchInlineSnapshot(`[]`);
      expect(toolExecutionEndEvents).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('tool execution error handling', () => {
    it('should throw TypeValidationError before approval callbacks run', async () => {
      const tools = {
        guardedTool: tool({
          inputSchema: z.object({ value: z.string() }),
          contextSchema: z.object({ apiKey: z.string() }),
          needsApproval: true,
          execute: async ({ value }) => `${value}-result`,
        }),
      };

      const transformedStream = convertArrayToReadableStream<
        LanguageModelStreamPart<typeof tools>
      >([
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'guardedTool',
          input: { value: 'test' },
        },
        finishChunk,
      ]).pipeThrough(
        createExecuteToolsTransformation({
          generateId: mockId({ prefix: 'id' }),
          tools,
          telemetry: undefined,
          callId: 'test-telemetry-call-id',
          messages: [],
          abortSignal: undefined,
          timeout: undefined,
          toolsContext: {
            guardedTool: { apiKey: 123 } as any,
          },
        }),
      );

      try {
        await convertReadableStreamToArray(transformedStream);
        expect.unreachable('expected stream consumption to throw');
      } catch (error) {
        expect(TypeValidationError.isInstance(error)).toBe(true);

        if (TypeValidationError.isInstance(error)) {
          expect(error.value).toEqual({ apiKey: 123 });
          expect(error.context).toEqual({
            field: 'tool context',
            entityName: 'guardedTool',
          });
        }
      }
    });

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
