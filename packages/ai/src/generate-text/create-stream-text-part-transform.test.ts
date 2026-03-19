import {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { tool } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import { NoSuchToolError } from '../error/no-such-tool-error';
import { createStreamTextPartTransform } from './create-stream-text-part-transform';

const testUsage: LanguageModelV4Usage = {
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
};

describe('createStreamTextPartTransform', () => {
  it('should convert text parts text to delta', async () => {
    const inputStream: ReadableStream<LanguageModelV4StreamPart> =
      convertArrayToReadableStream([
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: 'text' },
        { type: 'text-end', id: '1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: testUsage,
        },
      ]);

    const transformedStream = inputStream.pipeThrough(
      createStreamTextPartTransform({
        tools: undefined,
        system: undefined,
        messages: [],
        repairToolCall: undefined,
      }),
    );

    const result = await convertReadableStreamToArray(transformedStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "id": "1",
          "type": "text-start",
        },
        {
          "id": "1",
          "providerMetadata": undefined,
          "text": "text",
          "type": "text-delta",
        },
        {
          "id": "1",
          "type": "text-end",
        },
        {
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": 3,
              "total": 3,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": 10,
              "total": 10,
            },
          },
        },
      ]
    `);
  });

  it('should convert reasoning parts text to delta', async () => {
    const inputStream: ReadableStream<LanguageModelV4StreamPart> =
      convertArrayToReadableStream([
        { type: 'reasoning-start', id: '1' },
        { type: 'reasoning-delta', id: '1', delta: 'text' },
        { type: 'reasoning-end', id: '1' },
      ]);

    const transformedStream = inputStream.pipeThrough(
      createStreamTextPartTransform({
        tools: undefined,
        system: undefined,
        messages: [],
        repairToolCall: undefined,
      }),
    );

    const result = await convertReadableStreamToArray(transformedStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "id": "1",
          "type": "reasoning-start",
        },
        {
          "id": "1",
          "providerMetadata": undefined,
          "text": "text",
          "type": "reasoning-delta",
        },
        {
          "id": "1",
          "type": "reasoning-end",
        },
      ]
    `);
  });

  it('should forward file parts', async () => {
    const inputStream: ReadableStream<LanguageModelV4StreamPart> =
      convertArrayToReadableStream([
        {
          type: 'file',
          data: 'SGVsbG8gV29ybGQ=', // "Hello World" base64-encoded
          mediaType: 'text/plain',
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: testUsage,
        },
      ]);

    const transformedStream = inputStream.pipeThrough(
      createStreamTextPartTransform({
        tools: undefined,
        system: undefined,
        messages: [],
        repairToolCall: undefined,
      }),
    );

    const result = await convertReadableStreamToArray(transformedStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "file": DefaultGeneratedFileWithType {
            "base64Data": "SGVsbG8gV29ybGQ=",
            "mediaType": "text/plain",
            "type": "file",
            "uint8ArrayData": undefined,
          },
          "providerMetadata": undefined,
          "type": "file",
        },
        {
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": 3,
              "total": 3,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": 10,
              "total": 10,
            },
          },
        },
      ]
    `);
  });

  it('should forward file parts with providerMetadata', async () => {
    const inputStream: ReadableStream<LanguageModelV4StreamPart> =
      convertArrayToReadableStream([
        {
          type: 'file',
          data: new Uint8Array([
            72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100,
          ]), // "Hello World" as Uint8Array
          mediaType: 'text/plain',
          providerMetadata: {
            testProvider: { signature: 'test-signature' },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: testUsage,
        },
      ]);

    const transformedStream = inputStream.pipeThrough(
      createStreamTextPartTransform({
        tools: undefined,
        system: undefined,
        messages: [],
        repairToolCall: undefined,
      }),
    );

    const result = await convertReadableStreamToArray(transformedStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "file": DefaultGeneratedFileWithType {
            "base64Data": undefined,
            "mediaType": "text/plain",
            "type": "file",
            "uint8ArrayData": Uint8Array [
              72,
              101,
              108,
              108,
              111,
              32,
              87,
              111,
              114,
              108,
              100,
            ],
          },
          "providerMetadata": {
            "testProvider": {
              "signature": "test-signature",
            },
          },
          "type": "file",
        },
        {
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": 3,
              "total": 3,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": 10,
              "total": 10,
            },
          },
        },
      ]
    `);
  });

  it('should forward custom parts', async () => {
    const inputStream: ReadableStream<LanguageModelV4StreamPart> =
      convertArrayToReadableStream([
        {
          type: 'custom',
          kind: 'openai-compaction',
          providerMetadata: {
            openai: { itemId: 'cmp_123' },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: testUsage,
        },
      ]);

    const transformedStream = inputStream.pipeThrough(
      createStreamTextPartTransform({
        tools: undefined,
        system: undefined,
        messages: [],
        repairToolCall: undefined,
      }),
    );

    const result = await convertReadableStreamToArray(transformedStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "kind": "openai-compaction",
          "providerMetadata": {
            "openai": {
              "itemId": "cmp_123",
            },
          },
          "type": "custom",
        },
        {
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": 3,
              "total": 3,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": 10,
              "total": 10,
            },
          },
        },
      ]
    `);
  });

  it('should try to repair tool call when the tool name is not found', async () => {
    const tools = {
      correctTool: tool({
        inputSchema: z.object({ value: z.string() }),
        execute: async ({ value }) => `${value}-result`,
      }),
    };

    const inputStream: ReadableStream<LanguageModelV4StreamPart> =
      convertArrayToReadableStream([
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'unknownTool',
          input: `{ "value": "test" }`,
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: testUsage,
        },
      ]);

    const transformedStream = inputStream.pipeThrough(
      createStreamTextPartTransform({
        tools,
        system: undefined,
        messages: [],
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
      }),
    );

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
            "finishReason": {
              "raw": "stop",
              "unified": "stop",
            },
            "type": "finish",
            "usage": {
              "inputTokens": {
                "cacheRead": undefined,
                "cacheWrite": undefined,
                "noCache": 3,
                "total": 3,
              },
              "outputTokens": {
                "reasoning": undefined,
                "text": 10,
                "total": 10,
              },
            },
          },
        ]
      `);
  });

  it('should emit error when tool call is not found for provider approval request', async () => {
    const inputStream: ReadableStream<LanguageModelV4StreamPart> =
      convertArrayToReadableStream([
        // No tool-call part before the approval request
        {
          type: 'tool-approval-request',
          approvalId: 'mcp-approval-1',
          toolCallId: 'non-existent-call',
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage: testUsage,
        },
      ]);

    const transformedStream = inputStream.pipeThrough(
      createStreamTextPartTransform({
        tools: undefined,
        system: undefined,
        messages: [],
        repairToolCall: undefined,
      }),
    );

    const result = await convertReadableStreamToArray(transformedStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "error": [AI_ToolCallNotFoundForApprovalError: Tool call "non-existent-call" not found for approval request "mcp-approval-1".],
          "type": "error",
        },
        {
          "finishReason": {
            "raw": undefined,
            "unified": "stop",
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": 3,
              "total": 3,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": 10,
              "total": 10,
            },
          },
        },
      ]
    `);
  });
});
