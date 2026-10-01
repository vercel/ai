import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { fromUtf8, toUtf8 } from '@smithy/util-utf8';
import { describe, expect, it, vi } from 'vitest';
import { createAmazonBedrockEventStreamDecoder } from './amazon-bedrock-event-stream-decoder';

const codec = new EventStreamCodec(toUtf8, fromUtf8);

function createEvent(data: string): Uint8Array {
  return codec.encode({
    headers: {
      ':message-type': { type: 'string', value: 'event' },
      ':event-type': { type: 'string', value: 'chunk' },
    },
    body: fromUtf8(data),
  });
}

function createStream(
  chunks: Uint8Array[],
): ReadableStream<Uint8Array<ArrayBufferLike>> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

describe('createAmazonBedrockEventStreamDecoder', () => {
  it('surfaces frame decode errors instead of stranding later frames', async () => {
    const corruptedFrame = createEvent('corrupted');
    corruptedFrame[corruptedFrame.length - 1] ^= 0xff;
    const processEvent = vi.fn();

    const result = convertReadableStreamToArray(
      createAmazonBedrockEventStreamDecoder(
        createStream([corruptedFrame, createEvent('later')]),
        processEvent,
      ),
    );

    await expect(result).rejects.toThrow();
    expect(processEvent).not.toHaveBeenCalled();
  });

  it('surfaces processEvent errors', async () => {
    const processEventError = new Error('processEvent failed');

    const result = convertReadableStreamToArray(
      createAmazonBedrockEventStreamDecoder(
        createStream([createEvent('data')]),
        () => {
          throw processEventError;
        },
      ),
    );

    await expect(result).rejects.toBe(processEventError);
  });

  it('processes frames split across chunks', async () => {
    const frame = createEvent('data');
    const midpoint = Math.floor(frame.length / 2);

    const result = await convertReadableStreamToArray(
      createAmazonBedrockEventStreamDecoder(
        createStream([frame.subarray(0, midpoint), frame.subarray(midpoint)]),
        (event, controller) => {
          controller.enqueue(event.data);
        },
      ),
    );

    expect(result).toEqual(['data']);
  });

  it('rejects when EOF leaves an incomplete frame', async () => {
    const frame = createEvent('data');
    const incompleteFrame = frame.subarray(0, -1);

    const result = convertReadableStreamToArray(
      createAmazonBedrockEventStreamDecoder(
        createStream([incompleteFrame]),
        vi.fn(),
      ),
    );

    await expect(result).rejects.toThrow(
      `Incomplete Amazon Bedrock event-stream frame: ${incompleteFrame.length} buffered bytes remain at end of stream.`,
    );
  });

  it('allows EOF at a complete frame boundary', async () => {
    const result = await convertReadableStreamToArray(
      createAmazonBedrockEventStreamDecoder(
        createStream([createEvent('data')]),
        (event, controller) => {
          controller.enqueue(event.data);
        },
      ),
    );

    expect(result).toEqual(['data']);
  });
});
