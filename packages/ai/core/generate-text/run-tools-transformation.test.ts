import { LanguageModelV1StreamPart } from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { z } from 'zod';
import { NoSuchToolError } from '../../errors';
import { delay } from '../../util/delay';
import { MockTracer } from '../test/mock-tracer';
import { runToolsTransformation } from './run-tools-transformation';

it('should forward text deltas correctly', async () => {
  const inputStream: ReadableStream<LanguageModelV1StreamPart> =
    convertArrayToReadableStream([
      { type: 'text-delta', textDelta: 'text' },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { completionTokens: 10, promptTokens: 3 },
      },
    ]);

  const transformedStream = runToolsTransformation({
    tools: undefined,
    generatorStream: inputStream,
    toolCallStreaming: false,
    tracer: new MockTracer(),
    telemetry: undefined,
    messages: [],
    system: undefined,
    abortSignal: undefined,
    repairToolCall: undefined,
  });

  const result = await convertReadableStreamToArray(transformedStream);

  expect(result).toEqual([
    { type: 'text-delta', textDelta: 'text' },
    {
      type: 'finish',
      finishReason: 'stop',
      logprobs: undefined,
      usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
      experimental_providerMetadata: undefined,
    },
  ]);
});

it('should handle immediate tool execution', async () => {
  const inputStream: ReadableStream<LanguageModelV1StreamPart> =
    convertArrayToReadableStream([
      {
        type: 'tool-call',
        toolCallType: 'function',
        toolCallId: 'call-1',
        toolName: 'syncTool',
        args: `{ "value": "test" }`,
      },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { completionTokens: 10, promptTokens: 3 },
      },
    ]);

  const transformedStream = runToolsTransformation({
    tools: {
      syncTool: {
        parameters: z.object({ value: z.string() }),
        execute: async ({ value }) => `${value}-sync-result`,
      },
    },
    generatorStream: inputStream,
    toolCallStreaming: false,
    tracer: new MockTracer(),
    telemetry: undefined,
    messages: [],
    system: undefined,
    abortSignal: undefined,
    repairToolCall: undefined,
  });

  const result = await convertReadableStreamToArray(transformedStream);

  expect(result).toEqual([
    {
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'syncTool',
      args: { value: 'test' },
    },
    {
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'syncTool',
      args: { value: 'test' },
      result: 'test-sync-result',
    },
    {
      type: 'finish',
      finishReason: 'stop',
      logprobs: undefined,
      usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
      experimental_providerMetadata: undefined,
    },
  ]);
});

it('should hold off on sending finish until the delayed tool result is received', async () => {
  const inputStream: ReadableStream<LanguageModelV1StreamPart> =
    convertArrayToReadableStream([
      {
        type: 'tool-call',
        toolCallType: 'function',
        toolCallId: 'call-1',
        toolName: 'delayedTool',
        args: `{ "value": "test" }`,
      },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { completionTokens: 10, promptTokens: 3 },
      },
    ]);

  const transformedStream = runToolsTransformation({
    tools: {
      delayedTool: {
        parameters: z.object({ value: z.string() }),
        execute: async ({ value }) => {
          await delay(0); // Simulate delayed execution
          return `${value}-delayed-result`;
        },
      },
    },
    generatorStream: inputStream,
    toolCallStreaming: false,
    tracer: new MockTracer(),
    telemetry: undefined,
    messages: [],
    system: undefined,
    abortSignal: undefined,
    repairToolCall: undefined,
  });

  const result = await convertReadableStreamToArray(transformedStream);

  expect(result).toEqual([
    {
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'delayedTool',
      args: { value: 'test' },
    },
    {
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'delayedTool',
      args: { value: 'test' },
      result: 'test-delayed-result',
    },
    {
      type: 'finish',
      finishReason: 'stop',
      logprobs: undefined,
      usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
      experimental_providerMetadata: undefined,
    },
  ]);
});

it('should try to repair tool call when the tool name is not found', async () => {
  const inputStream: ReadableStream<LanguageModelV1StreamPart> =
    convertArrayToReadableStream([
      {
        type: 'tool-call',
        toolCallType: 'function',
        toolCallId: 'call-1',
        toolName: 'unknownTool',
        args: `{ "value": "test" }`,
      },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { completionTokens: 10, promptTokens: 3 },
      },
    ]);

  const transformedStream = runToolsTransformation({
    generatorStream: inputStream,
    toolCallStreaming: false,
    tracer: new MockTracer(),
    telemetry: undefined,
    messages: [],
    system: undefined,
    abortSignal: undefined,
    tools: {
      correctTool: {
        parameters: z.object({ value: z.string() }),
        execute: async ({ value }) => `${value}-result`,
      },
    },
    repairToolCall: async ({ toolCall, tools, parameterSchema, error }) => {
      expect(NoSuchToolError.isInstance(error)).toBe(true);
      expect(toolCall).toStrictEqual({
        type: 'tool-call',
        toolCallType: 'function',
        toolCallId: 'call-1',
        toolName: 'unknownTool',
        args: `{ "value": "test" }`,
      });

      return { ...toolCall, toolName: 'correctTool' };
    },
  });

  const result = await convertReadableStreamToArray(transformedStream);

  expect(result).toEqual([
    {
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'correctTool',
      args: { value: 'test' },
    },
    {
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'correctTool',
      args: { value: 'test' },
      result: 'test-result',
    },
    {
      type: 'finish',
      finishReason: 'stop',
      logprobs: undefined,
      usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
      experimental_providerMetadata: undefined,
    },
  ]);
});
