import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import type { UIMessage } from '../ui/ui-messages';
import type { UIMessageChunk } from './ui-message-chunks';
import { readUIMessageStream } from './read-ui-message-stream';
import { describe, it, expect, vi } from 'vitest';

function createUIMessageStream(parts: UIMessageChunk[]) {
  return convertArrayToReadableStream(parts);
}

describe('readUIMessageStream', () => {
  it('should return a ui message object stream for a basic input stream', async () => {
    const stream = createUIMessageStream([
      { type: 'start', messageId: 'msg-123' },
      { type: 'start-step' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Hello, ' },
      { type: 'text-delta', id: 'text-1', delta: 'world!' },
      { type: 'text-end', id: 'text-1' },
      { type: 'finish-step' },
      { type: 'finish' },
    ]);

    const uiMessages = readUIMessageStream({ stream });

    expect(await convertAsyncIterableToArray(uiMessages))
      .toMatchInlineSnapshot(`
        [
          {
            "id": "msg-123",
            "metadata": undefined,
            "parts": [],
            "role": "assistant",
          },
          {
            "id": "msg-123",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "streaming",
                "text": "",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
          {
            "id": "msg-123",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "streaming",
                "text": "Hello, ",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
          {
            "id": "msg-123",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "streaming",
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
          {
            "id": "msg-123",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "done",
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
  });

  it('should preserve tool parts when tool call ids repeat across steps', async () => {
    const stream = createUIMessageStream([
      { type: 'start', messageId: 'msg-123' },
      { type: 'start-step' },
      {
        type: 'tool-input-available',
        toolCallId: 'call-0',
        toolName: 'recordStep',
        input: { step: 1 },
        providerMetadata: { openai: { itemId: 'fc-step-1' } },
      },
      {
        type: 'tool-output-available',
        toolCallId: 'call-0',
        output: { recorded: 1 },
      },
      { type: 'finish-step' },
      { type: 'start-step' },
      {
        type: 'tool-input-available',
        toolCallId: 'call-0',
        toolName: 'recordStep',
        input: { step: 2 },
        providerMetadata: { openai: { itemId: 'fc-step-2' } },
      },
      {
        type: 'tool-output-available',
        toolCallId: 'call-0',
        output: { recorded: 2 },
      },
      { type: 'finish-step' },
      { type: 'finish' },
    ]);

    const messages = await convertAsyncIterableToArray(
      readUIMessageStream({ stream }),
    );
    const toolParts = messages
      .at(-1)!
      .parts.filter(
        part => part.type.startsWith('tool-') || part.type === 'dynamic-tool',
      );

    expect(toolParts).toHaveLength(2);
    expect(toolParts).toMatchObject([
      {
        type: 'tool-recordStep',
        toolCallId: 'call-0',
        state: 'output-available',
        input: { step: 1 },
        output: { recorded: 1 },
        callProviderMetadata: { openai: { itemId: 'fc-step-1' } },
      },
      {
        type: 'tool-recordStep',
        toolCallId: 'call-0',
        state: 'output-available',
        input: { step: 2 },
        output: { recorded: 2 },
        callProviderMetadata: { openai: { itemId: 'fc-step-2' } },
      },
    ]);
  });

  it('should preserve independent snapshots without cloning accumulated text', async () => {
    type TestUIMessage = UIMessage<
      { nested: { value: string } },
      { test: { value: string } }
    >;

    const nestedMetadata = { value: 'metadata' };
    const nestedData = { value: 'data' };
    const message: TestUIMessage = {
      id: 'msg-123',
      role: 'assistant',
      metadata: { nested: nestedMetadata },
      parts: [{ type: 'data-test', data: nestedData }],
    };

    const snapshots = await convertAsyncIterableToArray(
      readUIMessageStream({
        message,
        stream: createUIMessageStream([
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'Hello' },
          { type: 'text-end', id: 'text-1' },
        ]),
      }),
    );

    expect(snapshots).toHaveLength(3);
    expect(snapshots[0]).not.toBe(snapshots[1]);
    expect(snapshots[0].parts).not.toBe(snapshots[1].parts);
    expect(snapshots[0].parts[0]).not.toBe(snapshots[1].parts[0]);
    expect(snapshots[0].metadata).not.toBe(snapshots[1].metadata);

    expect(snapshots[0].metadata?.nested).not.toBe(nestedMetadata);
    expect(snapshots[0].metadata?.nested).not.toBe(
      snapshots[1].metadata?.nested,
    );
    const firstDataPart = snapshots[0].parts[0];
    const secondDataPart = snapshots[1].parts[0];

    expect(firstDataPart).toMatchObject({
      type: 'data-test',
      data: { value: 'data' },
    });

    if (
      firstDataPart.type !== 'data-test' ||
      secondDataPart.type !== 'data-test'
    ) {
      throw new Error('Expected data-test parts');
    }

    expect(firstDataPart.data).not.toBe(nestedData);
    expect(firstDataPart.data).not.toBe(secondDataPart.data);

    expect(snapshots[0].parts[1]).toMatchObject({
      type: 'text',
      text: '',
      state: 'streaming',
    });
    expect(snapshots[1].parts[1]).toMatchObject({
      type: 'text',
      text: 'Hello',
      state: 'streaming',
    });
    expect(snapshots[2].parts[1]).toMatchObject({
      type: 'text',
      text: 'Hello',
      state: 'done',
    });
  });

  it('should exclude accumulated text from structured cloning', async () => {
    const originalStructuredClone = globalThis.structuredClone;
    let clonedTextLength = 0;
    const structuredCloneSpy = vi
      .spyOn(globalThis, 'structuredClone')
      .mockImplementation(value => {
        if (
          value != null &&
          typeof value === 'object' &&
          'parts' in value &&
          Array.isArray(value.parts)
        ) {
          for (const part of value.parts) {
            if (part.type === 'text' || part.type === 'reasoning') {
              clonedTextLength += part.text.length;
            }
          }
        }

        return originalStructuredClone(value);
      });

    try {
      const snapshots = await convertAsyncIterableToArray(
        readUIMessageStream({
          stream: createUIMessageStream([
            { type: 'text-start', id: 'text-1' },
            ...Array.from({ length: 10 }, () => ({
              type: 'text-delta' as const,
              id: 'text-1',
              delta: 'x'.repeat(100),
            })),
            { type: 'text-end', id: 'text-1' },
          ]),
        }),
      );

      expect(snapshots.at(-1)?.parts[0]).toMatchObject({
        type: 'text',
        text: 'x'.repeat(1000),
        state: 'done',
      });
      expect(structuredCloneSpy).toHaveBeenCalled();
      expect(clonedTextLength).toBe(0);
    } finally {
      structuredCloneSpy.mockRestore();
    }
  });

  it('should isolate nested snapshot values from other snapshots and inputs', async () => {
    type TestMetadata = Array<{ value: string }> & {
      custom?: { value: string };
    };
    type TestUIMessage = UIMessage<TestMetadata, { test: { value: string } }>;

    const metadata: TestMetadata = [];
    metadata.length = 2;
    metadata[1] = { value: 'metadata' };
    metadata.custom = { value: 'custom' };

    const seedData = { value: 'seed' };
    const chunkData = { value: 'chunk' };
    const message: TestUIMessage = {
      id: 'msg-123',
      role: 'assistant',
      metadata,
      parts: [{ type: 'data-test', data: seedData }],
    };

    const snapshots = await convertAsyncIterableToArray(
      readUIMessageStream({
        message,
        stream: createUIMessageStream([
          { type: 'data-test', data: chunkData },
          { type: 'text-start', id: 'text-1' },
        ]),
      }),
    );

    const firstMetadata = snapshots[0].metadata!;
    const firstSeedPart = snapshots[0].parts[0];
    const firstChunkPart = snapshots[0].parts[1];

    if (
      firstSeedPart.type !== 'data-test' ||
      firstChunkPart.type !== 'data-test'
    ) {
      throw new Error('Expected data-test parts');
    }

    const firstSeedData = firstSeedPart.data;
    const firstChunkData = firstChunkPart.data;

    firstMetadata[1].value = 'changed';
    firstMetadata.custom!.value = 'changed';
    firstSeedData.value = 'changed';
    firstChunkData.value = 'changed';

    expect(0 in firstMetadata).toBe(false);
    expect(0 in snapshots[1].metadata!).toBe(false);
    expect(snapshots[1].metadata).toMatchObject({
      1: { value: 'metadata' },
      custom: { value: 'custom' },
    });
    expect(snapshots[1].parts[0]).toMatchObject({
      data: { value: 'seed' },
    });
    expect(snapshots[1].parts[1]).toMatchObject({
      data: { value: 'chunk' },
    });
    expect(metadata).toMatchObject({
      1: { value: 'metadata' },
      custom: { value: 'custom' },
    });
    expect(seedData).toEqual({ value: 'seed' });
    expect(chunkData).toEqual({ value: 'chunk' });
  });

  it('should throw an error when encountering an error UI stream part', async () => {
    const stream = createUIMessageStream([
      { type: 'start', messageId: 'msg-123' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Hello' },
      { type: 'error', errorText: 'Test error message' },
    ]);

    const uiMessages = readUIMessageStream({
      stream,
      terminateOnError: true,
    });

    await expect(convertAsyncIterableToArray(uiMessages)).rejects.toThrow(
      'Test error message',
    );
  });
});
