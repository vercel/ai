import { tool, type ModelMessage } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import type { LanguageModelStreamPart } from './stream-language-model-call';
import { invokeToolCallbacksFromStream } from './invoke-tool-callbacks-from-stream';

describe('invokeToolCallbacksFromStream', () => {
  it('should invoke tool callbacks in order with the tool context and pass through the stream', async () => {
    const recordedCalls: unknown[] = [];
    const abortController = new AbortController();
    const stepInputMessages: Array<ModelMessage> = [
      { role: 'user', content: 'test-input' },
    ];

    const tools = {
      'test-tool': tool({
        inputSchema: z.object({ value: z.string() }),
        contextSchema: z.object({ prefix: z.string() }),
        onInputStart: options => {
          recordedCalls.push({ type: 'onInputStart', options });
        },
        onInputDelta: options => {
          recordedCalls.push({ type: 'onInputDelta', options });
        },
        onInputAvailable: options => {
          recordedCalls.push({ type: 'onInputAvailable', options });
        },
      }),
    };

    const chunks: Array<LanguageModelStreamPart<typeof tools>> = [
      { type: 'text-delta', id: 'text-1', text: 'hello' },
      { type: 'tool-input-start', id: 'call-1', toolName: 'test-tool' },
      { type: 'tool-input-delta', id: 'call-1', delta: '{"value":"' },
      { type: 'tool-input-delta', id: 'call-1', delta: 'Sparkle Day"}' },
      { type: 'tool-input-end', id: 'call-1' },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'test-tool',
        input: { value: 'Sparkle Day' },
      },
    ];

    const result = invokeToolCallbacksFromStream({
      stream: convertArrayToReadableStream(chunks),
      tools,
      stepInputMessages,
      abortSignal: abortController.signal,
      toolsContext: {
        'test-tool': { prefix: 'tool-context' },
      },
    });
    const resultChunks = await convertReadableStreamToArray(result);
    const recordedCallsForSnapshot = recordedCalls.map(call => ({
      ...((call as { type: string; options: Record<string, unknown> }) ?? {}),
      options: {
        ...(call as { options: Record<string, unknown> }).options,
        abortSignal: '[AbortSignal]',
      },
    }));

    expect(resultChunks).toMatchInlineSnapshot(`
      [
        {
          "id": "text-1",
          "text": "hello",
          "type": "text-delta",
        },
        {
          "id": "call-1",
          "toolName": "test-tool",
          "type": "tool-input-start",
        },
        {
          "delta": "{"value":"",
          "id": "call-1",
          "type": "tool-input-delta",
        },
        {
          "delta": "Sparkle Day"}",
          "id": "call-1",
          "type": "tool-input-delta",
        },
        {
          "id": "call-1",
          "type": "tool-input-end",
        },
        {
          "input": {
            "value": "Sparkle Day",
          },
          "toolCallId": "call-1",
          "toolName": "test-tool",
          "type": "tool-call",
        },
      ]
    `);
    expect(recordedCallsForSnapshot).toMatchInlineSnapshot(`
      [
        {
          "options": {
            "abortSignal": "[AbortSignal]",
            "context": {
              "prefix": "tool-context",
            },
            "messages": [
              {
                "content": "test-input",
                "role": "user",
              },
            ],
            "toolCallId": "call-1",
          },
          "type": "onInputStart",
        },
        {
          "options": {
            "abortSignal": "[AbortSignal]",
            "context": {
              "prefix": "tool-context",
            },
            "inputTextDelta": "{"value":"",
            "messages": [
              {
                "content": "test-input",
                "role": "user",
              },
            ],
            "toolCallId": "call-1",
          },
          "type": "onInputDelta",
        },
        {
          "options": {
            "abortSignal": "[AbortSignal]",
            "context": {
              "prefix": "tool-context",
            },
            "inputTextDelta": "Sparkle Day"}",
            "messages": [
              {
                "content": "test-input",
                "role": "user",
              },
            ],
            "toolCallId": "call-1",
          },
          "type": "onInputDelta",
        },
        {
          "options": {
            "abortSignal": "[AbortSignal]",
            "context": {
              "prefix": "tool-context",
            },
            "input": {
              "value": "Sparkle Day",
            },
            "messages": [
              {
                "content": "test-input",
                "role": "user",
              },
            ],
            "toolCallId": "call-1",
          },
          "type": "onInputAvailable",
        },
      ]
    `);
    expect(
      recordedCalls.every(
        call =>
          (
            call as {
              options: { abortSignal: AbortSignal | undefined };
            }
          ).options.abortSignal === abortController.signal,
      ),
    ).toBe(true);
  });

  it('should validate context once per tool call and reuse the transformed value for all callbacks', async () => {
    let validationCount = 0;
    const callbackContexts: unknown[] = [];

    const tools = {
      'test-tool': tool({
        inputSchema: z.object({ value: z.string() }),
        contextSchema: z.object({ prefix: z.string() }).transform(context => ({
          ...context,
          validationCount: ++validationCount,
        })),
        onInputStart: ({ context }) => {
          callbackContexts.push(context);
        },
        onInputDelta: ({ context }) => {
          callbackContexts.push(context);
        },
        onInputAvailable: ({ context }) => {
          callbackContexts.push(context);
        },
      }),
    };

    const chunks: Array<LanguageModelStreamPart<typeof tools>> = [
      { type: 'tool-input-start', id: 'call-1', toolName: 'test-tool' },
      { type: 'tool-input-delta', id: 'call-1', delta: '{"value":"' },
      { type: 'tool-input-delta', id: 'call-1', delta: 'Sparkle Day"}' },
      { type: 'tool-input-end', id: 'call-1' },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'test-tool',
        input: { value: 'Sparkle Day' },
      },
    ];

    const result = invokeToolCallbacksFromStream({
      stream: convertArrayToReadableStream(chunks),
      tools,
      stepInputMessages: [],
      abortSignal: undefined,
      toolsContext: {
        'test-tool': { prefix: 'tool-context', validationCount: 0 },
      },
    });

    await expect(convertReadableStreamToArray(result)).resolves.toEqual(chunks);
    expect(validationCount).toBe(1);
    expect(callbackContexts).toHaveLength(4);
    expect(callbackContexts[0]).toEqual({
      prefix: 'tool-context',
      validationCount: 1,
    });
    expect(
      callbackContexts.every(context => context === callbackContexts[0]),
    ).toBe(true);
  });

  it('should skip onInputAvailable for invalid tool calls', async () => {
    const recordedCalls: string[] = [];
    const tools = {
      'test-tool': tool({
        inputSchema: z.object({ value: z.string() }),
        onInputStart: () => {
          recordedCalls.push('onInputStart');
        },
        onInputDelta: () => {
          recordedCalls.push('onInputDelta');
        },
        onInputAvailable: () => {
          recordedCalls.push('onInputAvailable');
        },
      }),
    };

    const chunks: Array<LanguageModelStreamPart<typeof tools>> = [
      { type: 'tool-input-start', id: 'call-1', toolName: 'test-tool' },
      {
        type: 'tool-input-delta',
        id: 'call-1',
        delta: '{"value":42}',
      },
      { type: 'tool-input-end', id: 'call-1' },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'test-tool',
        input: { value: 42 },
        dynamic: true,
        invalid: true,
        error: new Error('invalid tool input'),
      },
    ];

    const result = invokeToolCallbacksFromStream({
      stream: convertArrayToReadableStream(chunks),
      tools,
      stepInputMessages: [],
      abortSignal: undefined,
      toolsContext: {},
    });

    await expect(convertReadableStreamToArray(result)).resolves.toEqual(chunks);
    expect(recordedCalls).toEqual(['onInputStart', 'onInputDelta']);
  });
});
