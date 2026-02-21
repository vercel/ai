import { tool } from '@ai-sdk/provider-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod/v4';
import { MockTracer } from '../test/mock-tracer';
import { executeToolCall } from './execute-tool-call';
import {
  GenerateTextOnToolCallFinishCallback,
  GenerateTextOnToolCallStartCallback,
} from './generate-text';
import { TypedToolCall } from './tool-call';
import { TypedToolResult } from './tool-result';

vi.mock('../util/now', () => ({
  now: vi.fn(),
}));

import { now } from '../util/now';

const mockNow = vi.mocked(now);

describe('executeToolCall', () => {
  let tracer: MockTracer;

  beforeEach(() => {
    tracer = new MockTracer();
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
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
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
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
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
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
      });

      expect(result).toMatchObject({
        type: 'tool-result',
        providerMetadata: { custom: { key: 'value' } },
      });
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
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
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
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
      });

      expect(result).toMatchObject({
        type: 'tool-error',
        providerMetadata: { custom: { key: 'value' } },
      });
    });
  });

  describe('onToolCallStart callback', () => {
    it('should be called with correct data before execution', async () => {
      const startEvents: Parameters<
        GenerateTextOnToolCallStartCallback<any>
      >[0][] = [];
      const executionOrder: string[] = [];

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              executionOrder.push('execute');
              return `${value}-result`;
            },
          }),
        },
        tracer,
        telemetry: {
          functionId: 'test-function',
          metadata: { userId: 'user-123' },
        },
        messages: [{ role: 'user', content: 'test message' }],
        abortSignal: undefined,
        experimental_context: { traceId: 'trace-1' },
        stepNumber: 2,
        model: { provider: 'test-provider', modelId: 'test-model' },
        onToolCallStart: async event => {
          executionOrder.push('onToolCallStart');
          startEvents.push(event);
        },
      });

      expect(startEvents).toHaveLength(1);
      expect(startEvents[0]).toEqual({
        stepNumber: 2,
        model: { provider: 'test-provider', modelId: 'test-model' },
        toolCall: createToolCall(),
        messages: [{ role: 'user', content: 'test message' }],
        abortSignal: undefined,
        functionId: 'test-function',
        metadata: { userId: 'user-123' },
        experimental_context: { traceId: 'trace-1' },
      });
      expect(executionOrder).toEqual(['onToolCallStart', 'execute']);
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
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
        onToolCallStart: async () => {
          throw new Error('callback error');
        },
      });

      expect(result).toMatchObject({
        type: 'tool-result',
        output: 'test-result',
      });
    });
  });

  describe('onToolCallFinish callback', () => {
    it('should be called with success data when tool succeeds', async () => {
      const finishEvents: Parameters<
        GenerateTextOnToolCallFinishCallback<any>
      >[0][] = [];

      mockNow.mockReturnValueOnce(1000).mockReturnValueOnce(1050);

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        tracer,
        telemetry: {
          functionId: 'test-function',
          metadata: { userId: 'user-123' },
        },
        messages: [{ role: 'user', content: 'test message' }],
        abortSignal: undefined,
        experimental_context: { traceId: 'trace-1' },
        stepNumber: 3,
        model: { provider: 'test-provider', modelId: 'test-model' },
        onToolCallFinish: async event => {
          finishEvents.push(event);
        },
      });

      expect(finishEvents).toHaveLength(1);
      expect(finishEvents[0]).toEqual({
        stepNumber: 3,
        model: { provider: 'test-provider', modelId: 'test-model' },
        toolCall: createToolCall(),
        messages: [{ role: 'user', content: 'test message' }],
        abortSignal: undefined,
        success: true,
        output: 'test-result',
        durationMs: 50,
        functionId: 'test-function',
        metadata: { userId: 'user-123' },
        experimental_context: { traceId: 'trace-1' },
      });
    });

    it('should be called with error data when tool fails', async () => {
      const finishEvents: Parameters<
        GenerateTextOnToolCallFinishCallback<any>
      >[0][] = [];
      const toolError = new Error('execution failed');

      mockNow.mockReturnValueOnce(2000).mockReturnValueOnce(2100);

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
        tracer,
        telemetry: {
          functionId: 'test-function',
          metadata: { userId: 'user-123' },
        },
        messages: [],
        abortSignal: undefined,
        experimental_context: { spanId: 'span-1' },
        stepNumber: 1,
        model: { provider: 'provider-1', modelId: 'model-1' },
        onToolCallFinish: async event => {
          finishEvents.push(event);
        },
      });

      expect(finishEvents).toHaveLength(1);
      expect(finishEvents[0]).toEqual({
        stepNumber: 1,
        model: { provider: 'provider-1', modelId: 'model-1' },
        toolCall: createToolCall(),
        messages: [],
        abortSignal: undefined,
        success: false,
        error: toolError,
        durationMs: 100,
        functionId: 'test-function',
        metadata: { userId: 'user-123' },
        experimental_context: { spanId: 'span-1' },
      });
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
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
        onToolCallFinish: async () => {
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
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
        onToolCallFinish: async () => {
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
      const finishEvents: Parameters<
        GenerateTextOnToolCallFinishCallback<any>
      >[0][] = [];

      mockNow.mockReturnValueOnce(5000).mockReturnValueOnce(5250);

      await executeToolCall({
        toolCall: createToolCall(),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
        onToolCallFinish: async event => {
          finishEvents.push(event);
        },
      });

      expect(finishEvents[0].durationMs).toBe(250);
    });

    it('should calculate correct duration on error', async () => {
      const finishEvents: Parameters<
        GenerateTextOnToolCallFinishCallback<any>
      >[0][] = [];

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
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
        onToolCallFinish: async event => {
          finishEvents.push(event);
        },
      });

      expect(finishEvents[0].durationMs).toBe(500);
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
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
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
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
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

  describe('telemetry span', () => {
    it('should create a span with correct attributes', async () => {
      await executeToolCall({
        toolCall: createToolCall({ toolCallId: 'my-call-id' }),
        tools: {
          testTool: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          }),
        },
        tracer,
        telemetry: { isEnabled: true },
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
      });

      expect(tracer.spans).toHaveLength(1);
      expect(tracer.spans[0].name).toBe('ai.toolCall');
      expect(tracer.spans[0].attributes).toMatchObject({
        'ai.toolCall.name': 'testTool',
        'ai.toolCall.id': 'my-call-id',
      });
    });

    it('should record error on span when tool fails', async () => {
      const toolError = new Error('test error');

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
        tracer,
        telemetry: { isEnabled: true },
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
      });

      expect(tracer.spans).toHaveLength(1);
      const span = tracer.spans[0];
      expect(span.events).toContainEqual(
        expect.objectContaining({
          name: 'exception',
          attributes: expect.objectContaining({
            'exception.message': 'test error',
          }),
        }),
      );
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
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
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
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
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
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
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
        tracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
      });

      expect(result).toBeUndefined();
    });
  });
});
