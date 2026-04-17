import { tool } from '@ai-sdk/provider-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod/v4';
import { TypeValidationError } from '../error';
import { executeToolCall } from './execute-tool-call';
import { TypedToolCall } from './tool-call';
import { TypedToolResult } from './tool-result';
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

describe('executeToolCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNow.mockReturnValue(0);
  });

  const createToolCall = (
    overrides: Partial<TypedToolCall<any>> = {},
  ): TypedToolCall<any> =>
    ({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'testTool',
      input: { value: 'test' },
      dynamic: false,
      ...overrides,
    }) as TypedToolCall<any>;

  describe('when tool has no execute function', () => {
    it('should return undefined', async () => {
      const result = await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
      });

      expect(result).toBeUndefined();
    });
  });

  describe('when tool executes successfully', () => {
    it('should return tool-result with correct data', async () => {
      const result = await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
      });

      expect(result).toEqual({
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'testTool',
        input: { value: 'test' },
        output: 'test-result',
        dynamic: false,
      });
    });

    it('should preserve providerMetadata from toolCall', async () => {
      const result = await executeToolCall({
        toolCall: createToolCall({
          providerMetadata: { custom: { key: 'value' } },
        }),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
      });

      expect(result).toMatchObject({
        type: 'tool-result',
        providerMetadata: { custom: { key: 'value' } },
      });
    });

    it('should throw TypeValidationError when tool context fails validation', async () => {
      try {
        await executeToolCall({
          toolCall: createToolCall(),
          tools: {
            testTool: tool({
              inputSchema: z.object({ value: z.string() }),
              contextSchema: z.object({ key1: z.string() }),
              execute: async ({ value }) => `${value}-result`,
            }),
          },
          telemetry: undefined,
          callId: 'test-telemetry-call-id',
          messages: [],
          abortSignal: undefined,
          toolsContext: { testTool: { key1: 1 } as any },
        });

        expect.unreachable('expected executeToolCall to throw');
      } catch (error) {
        expect(TypeValidationError.isInstance(error)).toBe(true);

        if (TypeValidationError.isInstance(error)) {
          expect(error.value).toEqual({ key1: 1 });
          expect(error.context).toEqual({
            field: 'tool context',
            entityName: 'testTool',
          });
        }
      }
    });
  });

  describe('when tool execution fails', () => {
    it('should return tool-error with the error', async () => {
      const toolError = new Error('execution failed');

      const result = await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async (): Promise<string> => {
              throw toolError;
            },
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
      });

      expect(result).toEqual({
        type: 'tool-error',
        toolCallId: 'call-1',
        toolName: 'testTool',
        input: { value: 'test' },
        error: toolError,
        dynamic: false,
      });
    });

    it('should preserve providerMetadata from toolCall on error', async () => {
      const result = await executeToolCall({
        toolCall: createToolCall({
          providerMetadata: { custom: { key: 'value' } },
        }),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async (): Promise<string> => {
              throw new Error('execution failed');
            },
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
      });

      expect(result).toMatchObject({
        type: 'tool-error',
        providerMetadata: { custom: { key: 'value' } },
      });
    });
  });

  describe('onToolExecutionStart callback', () => {
    it('should be called with correct data before execution', async () => {
      const toolExecutionStartEvents: ToolExecutionStartEvent<any>[] = [];
      const executionOrder: string[] = [];

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            contextSchema: z.object({ key1: z.string() }),
            execute: async ({ value }) => {
              executionOrder.push('execute');
              return `${value}-result`;
            },
          }),
        },
        telemetry: {
          functionId: 'test-function',
        },
        callId: 'test-telemetry-call-id',
        messages: [{ role: 'user', content: 'test message' }],
        abortSignal: undefined,
        toolsContext: { testTool: { key1: 'value1' } },
        stepNumber: 2,
        provider: 'test-provider',
        modelId: 'test-model',
        onToolExecutionStart: async event => {
          executionOrder.push('onToolExecutionStart');
          toolExecutionStartEvents.push(event);
        },
      });

      expect(toolExecutionStartEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "context": {
              "key1": "value1",
            },
            "functionId": "test-function",
            "messages": [
              {
                "content": "test message",
                "role": "user",
              },
            ],
            "modelId": "test-model",
            "provider": "test-provider",
            "stepNumber": 2,
            "toolCall": {
              "dynamic": false,
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
      expect(executionOrder).toEqual(['onToolExecutionStart', 'execute']);
    });

    it('should not break execution when callback throws', async () => {
      const result = await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
        onToolExecutionStart: async () => {
          throw new Error('callback error');
        },
      });

      expect(result).toMatchObject({
        type: 'tool-result',
        output: 'test-result',
      });
    });
  });

  describe('onToolExecutionEnd callback', () => {
    it('should be called with success data when tool succeeds', async () => {
      const toolExecutionEndEvents: ToolExecutionEndEvent<any>[] = [];

      mockNow.mockReturnValueOnce(1000).mockReturnValueOnce(1050);

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            contextSchema: z.object({ key1: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        telemetry: {
          functionId: 'test-function',
        },
        callId: 'test-telemetry-call-id',
        messages: [{ role: 'user', content: 'test message' }],
        abortSignal: undefined,
        toolsContext: { testTool: { key1: 'value1' } },
        stepNumber: 3,
        provider: 'test-provider',
        modelId: 'test-model',
        onToolExecutionEnd: async event => {
          toolExecutionEndEvents.push(event);
        },
      });

      expect(toolExecutionEndEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "context": {
              "key1": "value1",
            },
            "durationMs": 50,
            "functionId": "test-function",
            "messages": [
              {
                "content": "test message",
                "role": "user",
              },
            ],
            "modelId": "test-model",
            "output": "test-result",
            "provider": "test-provider",
            "stepNumber": 3,
            "success": true,
            "toolCall": {
              "dynamic": false,
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

    it('should be called with error data when tool fails', async () => {
      const toolExecutionEndEvents: ToolExecutionEndEvent<any>[] = [];
      const toolError = new Error('execution failed');

      mockNow.mockReturnValueOnce(2000).mockReturnValueOnce(2100);

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            contextSchema: z.object({ key1: z.string() }),
            execute: async (): Promise<string> => {
              throw toolError;
            },
          }),
        },
        telemetry: {
          functionId: 'test-function',
        },
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: { testTool: { key1: 'value1' } },
        stepNumber: 1,
        provider: 'provider-1',
        modelId: 'model-1',
        onToolExecutionEnd: async event => {
          toolExecutionEndEvents.push(event);
        },
      });

      expect(toolExecutionEndEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "context": {
              "key1": "value1",
            },
            "durationMs": 100,
            "error": [Error: execution failed],
            "functionId": "test-function",
            "messages": [],
            "modelId": "model-1",
            "provider": "provider-1",
            "stepNumber": 1,
            "success": false,
            "toolCall": {
              "dynamic": false,
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

    it('should not break execution when callback throws on success', async () => {
      const result = await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
        onToolExecutionEnd: async () => {
          throw new Error('callback error');
        },
      });

      expect(result).toMatchObject({
        type: 'tool-result',
        output: 'test-result',
      });
    });

    it('should not break execution when callback throws on error', async () => {
      const toolError = new Error('tool error');

      const result = await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async (): Promise<string> => {
              throw toolError;
            },
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
        onToolExecutionEnd: async () => {
          throw new Error('callback error');
        },
      });

      expect(result).toMatchObject({
        type: 'tool-error',
        error: toolError,
      });
    });
  });

  describe('durationMs calculation', () => {
    it('should calculate correct duration on success', async () => {
      const toolExecutionEndEvents: ToolExecutionEndEvent<any>[] = [];

      mockNow.mockReturnValueOnce(5000).mockReturnValueOnce(5250);

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
        onToolExecutionEnd: async event => {
          toolExecutionEndEvents.push(event);
        },
      });

      expect(toolExecutionEndEvents[0].durationMs).toBe(250);
    });

    it('should calculate correct duration on error', async () => {
      const toolExecutionEndEvents: ToolExecutionEndEvent<any>[] = [];

      mockNow.mockReturnValueOnce(1000).mockReturnValueOnce(1500);

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async (): Promise<string> => {
              throw new Error('error');
            },
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
        onToolExecutionEnd: async event => {
          toolExecutionEndEvents.push(event);
        },
      });

      expect(toolExecutionEndEvents[0].durationMs).toBe(500);
    });
  });

  describe('onPreliminaryToolResult callback', () => {
    it('should be called for preliminary results', async () => {
      const preliminaryResults: TypedToolResult<any>[] = [];

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async function* ({ value }) {
              yield 'partial-1';
              yield 'partial-2';
              return `${value}-final`;
            },
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
        onPreliminaryToolResult: result => {
          preliminaryResults.push(result);
        },
      });

      expect(preliminaryResults).toHaveLength(2);
      expect(preliminaryResults[0]).toMatchObject({
        type: 'tool-result',
        output: 'partial-1',
        preliminary: true,
      });
      expect(preliminaryResults[1]).toMatchObject({
        type: 'tool-result',
        output: 'partial-2',
        preliminary: true,
      });
    });

    it('should return final result even with preliminary results', async () => {
      const preliminaryResults: TypedToolResult<any>[] = [];

      const result = await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async function* ({ value }) {
              yield 'partial-1';
              yield `${value}-final`;
            },
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
        onPreliminaryToolResult: result => {
          preliminaryResults.push(result);
        },
      });

      expect(preliminaryResults).toHaveLength(2);
      expect(preliminaryResults[0].output).toBe('partial-1');
      expect(preliminaryResults[1].output).toBe('test-final');
      expect(result).toMatchObject({
        type: 'tool-result',
        output: 'test-final',
      });
    });
  });

  describe('tool call callbacks', () => {
    it('should notify start and finish callbacks with success payload', async () => {
      const startEvents: any[] = [];
      const finishEvents: any[] = [];

      await executeToolCall({
        toolCall: createToolCall({ toolCallId: 'my-call-id' }),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            contextSchema: z.object({ key1: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        telemetry: {
          isEnabled: true,
          functionId: 'test-function',
        },
        callId: 'test-telemetry-call-id',
        messages: [{ role: 'user', content: 'hello' }],
        abortSignal: undefined,
        toolsContext: { testTool: { key1: 'value1' } },
        stepNumber: 2,
        provider: 'test-provider',
        modelId: 'test-model',
        onToolExecutionStart: async event => {
          startEvents.push(event);
        },
        onToolExecutionEnd: async event => {
          finishEvents.push(event);
        },
      });

      expect(startEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "context": {
              "key1": "value1",
            },
            "functionId": "test-function",
            "messages": [
              {
                "content": "hello",
                "role": "user",
              },
            ],
            "modelId": "test-model",
            "provider": "test-provider",
            "stepNumber": 2,
            "toolCall": {
              "dynamic": false,
              "input": {
                "value": "test",
              },
              "toolCallId": "my-call-id",
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
              "key1": "value1",
            },
            "durationMs": 0,
            "functionId": "test-function",
            "messages": [
              {
                "content": "hello",
                "role": "user",
              },
            ],
            "modelId": "test-model",
            "output": "test-result",
            "provider": "test-provider",
            "stepNumber": 2,
            "success": true,
            "toolCall": {
              "dynamic": false,
              "input": {
                "value": "test",
              },
              "toolCallId": "my-call-id",
              "toolName": "testTool",
              "type": "tool-call",
            },
          },
        ]
      `);
    });

    it('should notify finish callback with error payload', async () => {
      const toolError = new Error('test error');
      const toolExecutionEndEvents: ToolExecutionEndEvent<any>[] = [];

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async (): Promise<string> => {
              throw toolError;
            },
          }),
        },
        telemetry: { isEnabled: true },
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
        onToolExecutionEnd: async event => {
          toolExecutionEndEvents.push(event);
        },
      });

      expect(toolExecutionEndEvents).toMatchInlineSnapshot(`
        [
          {
            "callId": "test-telemetry-call-id",
            "context": undefined,
            "durationMs": 0,
            "error": [Error: test error],
            "functionId": undefined,
            "messages": [],
            "modelId": undefined,
            "provider": undefined,
            "stepNumber": undefined,
            "success": false,
            "toolCall": {
              "dynamic": false,
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

    it('should execute the tool inside the executeToolInTelemetryContext wrapper when provided', async () => {
      const executeToolInTelemetryContext: <T>(params: {
        callId: string;
        toolCallId: string;
        execute: () => PromiseLike<T>;
      }) => Promise<T> = vi.fn(async ({ execute }) => execute());

      await executeToolCall({
        toolCall: createToolCall({ toolCallId: 'my-call-id' }),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        telemetry: { isEnabled: true },
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
        executeToolInTelemetryContext,
      });

      expect(executeToolInTelemetryContext).toHaveBeenCalledWith({
        callId: 'test-telemetry-call-id',
        toolCallId: 'my-call-id',
        execute: expect.any(Function),
      });
    });

    it('should execute the tool directly when executeToolInTelemetryContext is not provided', async () => {
      const result = await executeToolCall({
        toolCall: createToolCall({ toolCallId: 'my-call-id' }),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        telemetry: { isEnabled: true },
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
      });

      expect(result).toMatchObject({
        type: 'tool-result',
        output: 'test-result',
      });
    });
  });

  describe('timeout', () => {
    it('should return tool-result when tool completes before timeout', async () => {
      const result = await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        timeout: { toolMs: 5000 },
        toolsContext: {},
      });

      expect(result).toMatchObject({
        type: 'tool-result',
        output: 'test-result',
      });
    });

    it('should pass an abort signal to tool when toolMs is set', async () => {
      let receivedSignal: AbortSignal | undefined;

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }, { abortSignal }) => {
              receivedSignal = abortSignal;
              return `${value}-result`;
            },
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        timeout: { toolMs: 5000 },
        toolsContext: {},
      });

      expect(receivedSignal).toBeDefined();
      expect(receivedSignal!.aborted).toBe(false);
    });

    it('should not create abort signal when no timeout', async () => {
      let receivedSignal: AbortSignal | undefined;

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }, { abortSignal }) => {
              receivedSignal = abortSignal;
              return `${value}-result`;
            },
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
      });

      expect(receivedSignal).toBeUndefined();
    });

    it('should merge toolMs with existing abort signal', async () => {
      const controller = new AbortController();
      let receivedSignal: AbortSignal | undefined;

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }, { abortSignal }) => {
              receivedSignal = abortSignal;
              return `${value}-result`;
            },
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: controller.signal,
        timeout: { toolMs: 5000 },
        toolsContext: {},
      });

      expect(receivedSignal).toBeDefined();
      expect(receivedSignal).not.toBe(controller.signal);
      expect(receivedSignal!.aborted).toBe(false);
    });

    it('should use per-tool timeout over generic toolMs', async () => {
      let receivedSignal: AbortSignal | undefined;

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }, { abortSignal }) => {
              receivedSignal = abortSignal;
              return `${value}-result`;
            },
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        timeout: { toolMs: 10000, tools: { testToolMs: 2000 } },
        toolsContext: {},
      });

      expect(receivedSignal).toBeDefined();
      expect(receivedSignal!.aborted).toBe(false);
    });

    it('should fall back to toolMs when tool not in tools', async () => {
      let receivedSignal: AbortSignal | undefined;

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }, { abortSignal }) => {
              receivedSignal = abortSignal;
              return `${value}-result`;
            },
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        timeout: { toolMs: 5000, tools: { otherToolMs: 2000 } },
        toolsContext: {},
      });

      expect(receivedSignal).toBeDefined();
      expect(receivedSignal!.aborted).toBe(false);
    });

    it('should not create abort signal when tool not in tools and no toolMs', async () => {
      let receivedSignal: AbortSignal | undefined;

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }, { abortSignal }) => {
              receivedSignal = abortSignal;
              return `${value}-result`;
            },
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        timeout: { tools: { otherToolMs: 2000 } },
        toolsContext: {},
      });

      expect(receivedSignal).toBeUndefined();
    });
  });

  describe('dynamic tools', () => {
    it('should set dynamic: true for dynamic tools on success', async () => {
      const { dynamicTool } = await import('@ai-sdk/provider-utils');

      const result = await executeToolCall({
        toolCall: createToolCall({ dynamic: true }),
        tools: {
          testTool: dynamicTool({
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'dynamic-result',
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
      });

      expect(result).toMatchObject({
        type: 'tool-result',
        dynamic: true,
      });
    });

    it('should set dynamic: true for dynamic tools on error', async () => {
      const { dynamicTool } = await import('@ai-sdk/provider-utils');

      const result = await executeToolCall({
        toolCall: createToolCall({ dynamic: true }),
        tools: {
          testTool: dynamicTool({
            inputSchema: z.object({ value: z.string() }),
            execute: async (): Promise<string> => {
              throw new Error('error');
            },
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
      });

      expect(result).toMatchObject({
        type: 'tool-error',
        dynamic: true,
      });
    });
  });

  describe('when tools is undefined', () => {
    it('should return undefined', async () => {
      const result = await executeToolCall({
        toolCall: createToolCall(),
        tools: undefined,
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
      });

      expect(result).toBeUndefined();
    });
  });

  describe('when tool is not found in tools', () => {
    it('should return undefined', async () => {
      const result = await executeToolCall({
        toolCall: createToolCall({ toolName: 'nonexistent' }),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
      });

      expect(result).toBeUndefined();
    });
  });

  describe('array callbacks', () => {
    it('should call all onToolExecutionStart listeners in an array', async () => {
      const calls: string[] = [];

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
        onToolExecutionStart: [
          async () => {
            calls.push('first');
          },
          async () => {
            calls.push('second');
          },
        ],
      });

      expect(calls).toEqual(['first', 'second']);
    });

    it('should call all onToolExecutionEnd listeners in an array', async () => {
      const calls: string[] = [];

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
        onToolExecutionEnd: [
          async () => {
            calls.push('first');
          },
          async () => {
            calls.push('second');
          },
        ],
      });

      expect(calls).toEqual(['first', 'second']);
    });

    it('should not break when one listener in the array throws', async () => {
      const calls: string[] = [];

      const result = await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        telemetry: undefined,
        callId: 'test-telemetry-call-id',
        messages: [],
        abortSignal: undefined,
        toolsContext: {},
        onToolExecutionStart: [
          async () => {
            throw new Error('listener error');
          },
          async () => {
            calls.push('second-start');
          },
        ],
        onToolExecutionEnd: [
          async () => {
            throw new Error('listener error');
          },
          async () => {
            calls.push('second-finish');
          },
        ],
      });

      expect(result).toMatchObject({
        type: 'tool-result',
        output: 'test-result',
      });
      expect(calls).toEqual(['second-start', 'second-finish']);
    });
  });
});
