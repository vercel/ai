import { LanguageModelV2StreamPart } from '@ai-sdk/provider';
import { delay } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { z } from 'zod';
import { NoSuchToolError } from '../../src/error/no-such-tool-error';
import { MockTracer } from '../test/mock-tracer';
import { runToolsTransformation } from './run-tools-transformation';

const testUsage = {
  inputTokens: 3,
  outputTokens: 10,
  totalTokens: 13,
  reasoningTokens: undefined,
  cachedInputTokens: undefined,
};

it('should forward text deltas correctly', async () => {
  const inputStream: ReadableStream<LanguageModelV2StreamPart> =
    convertArrayToReadableStream([
      { type: 'text', text: 'text' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: testUsage,
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

  expect(result).toMatchInlineSnapshot(`
    [
      {
        "text": "text",
        "type": "text",
      },
      {
        "finishReason": "stop",
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

it('should handle immediate tool execution', async () => {
  const inputStream: ReadableStream<LanguageModelV2StreamPart> =
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
        usage: testUsage,
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

  expect(await convertReadableStreamToArray(transformedStream))
    .toMatchInlineSnapshot(`
    [
      {
        "args": {
          "value": "test",
        },
        "toolCallId": "call-1",
        "toolName": "syncTool",
        "type": "tool-call",
      },
      {
        "args": {
          "value": "test",
        },
        "result": "test-sync-result",
        "toolCallId": "call-1",
        "toolName": "syncTool",
        "type": "tool-result",
      },
      {
        "finishReason": "stop",
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
  const inputStream: ReadableStream<LanguageModelV2StreamPart> =
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
        usage: testUsage,
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

  expect(result).toMatchInlineSnapshot(`
    [
      {
        "args": {
          "value": "test",
        },
        "toolCallId": "call-1",
        "toolName": "delayedTool",
        "type": "tool-call",
      },
      {
        "finishReason": "stop",
        "type": "finish",
        "usage": {
          "cachedInputTokens": undefined,
          "inputTokens": 3,
          "outputTokens": 10,
          "reasoningTokens": undefined,
          "totalTokens": 13,
        },
      },
      {
        "args": {
          "value": "test",
        },
        "result": "test-delayed-result",
        "toolCallId": "call-1",
        "toolName": "delayedTool",
        "type": "tool-result",
      },
    ]
  `);
});

it('should try to repair tool call when the tool name is not found', async () => {
  const inputStream: ReadableStream<LanguageModelV2StreamPart> =
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
        usage: testUsage,
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

  expect(await convertReadableStreamToArray(transformedStream))
    .toMatchInlineSnapshot(`
    [
      {
        "args": {
          "value": "test",
        },
        "toolCallId": "call-1",
        "toolName": "correctTool",
        "type": "tool-call",
      },
      {
        "args": {
          "value": "test",
        },
        "result": "test-result",
        "toolCallId": "call-1",
        "toolName": "correctTool",
        "type": "tool-result",
      },
      {
        "finishReason": "stop",
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
