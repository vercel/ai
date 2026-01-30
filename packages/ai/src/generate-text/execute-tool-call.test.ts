import { describe, it, expect, vi } from 'vitest';
import { executeToolCall } from './execute-tool-call';
import { ToolSet } from './tool-set';
import { MockTracer } from '../test/mock-tracer';

describe('executeToolCall', () => {
  const mockTracer = new MockTracer();

  describe('error handling', () => {
    it('should return tool-error when no error handler is provided', async () => {
      const testError = new Error('Tool execution failed');
      const tools = {
        testTool: {
          inputSchema: {} as any,
          execute: vi.fn().mockRejectedValue(testError),
        },
      } as any as ToolSet;

      const result = await executeToolCall({
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'testTool',
          input: { value: 'test' },
        },
        tools,
        tracer: mockTracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
      });

      expect(result).toEqual({
        type: 'tool-error',
        toolCallId: 'call-123',
        toolName: 'testTool',
        input: { value: 'test' },
        error: testError,
        dynamic: false,
      });
    });

    it('should return tool-error when error handler returns "retry"', async () => {
      const testError = new Error('Tool execution failed');
      const tools = {
        testTool: {
          inputSchema: {} as any,
          execute: vi.fn().mockRejectedValue(testError),
        },
      } as any as ToolSet;

      const errorHandler = vi.fn().mockResolvedValue('retry');

      const result = await executeToolCall({
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'testTool',
          input: { value: 'test' },
        },
        tools,
        tracer: mockTracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
        experimental_toolErrorHandler: errorHandler,
      });

      expect(errorHandler).toHaveBeenCalledWith({
        toolCallId: 'call-123',
        toolName: 'testTool',
        input: { value: 'test' },
        error: testError,
        messages: [],
      });

      expect(result).toEqual({
        type: 'tool-error',
        toolCallId: 'call-123',
        toolName: 'testTool',
        input: { value: 'test' },
        error: testError,
        dynamic: false,
      });
    });

    it('should return tool-result when error handler returns "send-to-llm"', async () => {
      const testError = new Error('Validation failed: invalid input');
      const tools = {
        testTool: {
          inputSchema: {} as any,
          execute: vi.fn().mockRejectedValue(testError),
        },
      } as any as ToolSet;

      const errorHandler = vi.fn().mockResolvedValue('send-to-llm');

      const result = await executeToolCall({
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'testTool',
          input: { value: 'test' },
        },
        tools,
        tracer: mockTracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
        experimental_toolErrorHandler: errorHandler,
      });

      expect(errorHandler).toHaveBeenCalledWith({
        toolCallId: 'call-123',
        toolName: 'testTool',
        input: { value: 'test' },
        error: testError,
        messages: [],
      });

      expect(result).toEqual({
        type: 'tool-result',
        toolCallId: 'call-123',
        toolName: 'testTool',
        input: { value: 'test' },
        output: {
          type: 'error',
          message: 'Validation failed: invalid input',
        },
        dynamic: false,
      });
    });

    it('should handle non-Error thrown values', async () => {
      const tools = {
        testTool: {
          inputSchema: {} as any,
          execute: vi.fn().mockRejectedValue('String error'),
        },
      } as any as ToolSet;

      const errorHandler = vi.fn().mockResolvedValue('send-to-llm');

      const result = await executeToolCall({
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'testTool',
          input: { value: 'test' },
        },
        tools,
        tracer: mockTracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
        experimental_toolErrorHandler: errorHandler,
      });

      expect(result).toEqual({
        type: 'tool-result',
        toolCallId: 'call-123',
        toolName: 'testTool',
        input: { value: 'test' },
        output: {
          type: 'error',
          message: 'String error',
        },
        dynamic: false,
      });
    });

    it('should support synchronous error handler', async () => {
      const testError = new Error('Tool execution failed');
      const tools = {
        testTool: {
          inputSchema: {} as any,
          execute: vi.fn().mockRejectedValue(testError),
        },
      } as any as ToolSet;

      const errorHandler = vi.fn().mockReturnValue('send-to-llm');

      const result = await executeToolCall({
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'testTool',
          input: { value: 'test' },
        },
        tools,
        tracer: mockTracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
        experimental_toolErrorHandler: errorHandler,
      });

      expect(result).toEqual({
        type: 'tool-result',
        toolCallId: 'call-123',
        toolName: 'testTool',
        input: { value: 'test' },
        output: {
          type: 'error',
          message: 'Tool execution failed',
        },
        dynamic: false,
      });
    });

    it('should preserve providerMetadata in error result', async () => {
      const testError = new Error('Tool execution failed');
      const tools = {
        testTool: {
          inputSchema: {} as any,
          execute: vi.fn().mockRejectedValue(testError),
        },
      } as any as ToolSet;

      const errorHandler = vi.fn().mockResolvedValue('send-to-llm');

      const result = await executeToolCall({
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'testTool',
          input: { value: 'test' },
          providerMetadata: { someKey: 'someValue' } as any,
        },
        tools,
        tracer: mockTracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
        experimental_toolErrorHandler: errorHandler,
      });

      expect(result).toEqual({
        type: 'tool-result',
        toolCallId: 'call-123',
        toolName: 'testTool',
        input: { value: 'test' },
        output: {
          type: 'error',
          message: 'Tool execution failed',
        },
        dynamic: false,
        providerMetadata: { someKey: 'someValue' },
      });
    });
  });

  describe('successful execution', () => {
    it('should return tool-result for successful execution', async () => {
      const tools = {
        testTool: {
          inputSchema: {} as any,
          execute: vi.fn().mockResolvedValue({ success: true }),
        },
      } as any as ToolSet;

      const result = await executeToolCall({
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'testTool',
          input: { value: 'test' },
        },
        tools,
        tracer: mockTracer,
        telemetry: undefined,
        messages: [],
        abortSignal: undefined,
        experimental_context: undefined,
      });

      expect(result).toEqual({
        type: 'tool-result',
        toolCallId: 'call-123',
        toolName: 'testTool',
        input: { value: 'test' },
        output: { success: true },
        dynamic: false,
      });
    });
  });
});
