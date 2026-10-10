import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { processTextStream } from './process-text-stream';
import { describe, it, expect, vi } from 'vitest';

describe('processTextStream', () => {
  it('should process stream chunks correctly', async () => {
    // Mock data
    const testData = ['Hello', ' ', 'World'];
    const chunks: string[] = [];

    // Create stream using utility
    const encoder = new TextEncoder();
    const stream = convertArrayToReadableStream(
      testData.map(chunk => encoder.encode(chunk)),
    );

    // Mock callback function
    const onChunk = vi.fn((chunk: string) => {
      chunks.push(chunk);
    });

    // Process the stream
    await processTextStream({ stream, onTextPart: onChunk });

    // Verify the results
    expect(onChunk).toHaveBeenCalledTimes(3);
    expect(chunks).toEqual(testData);
  });

  it('should handle empty streams', async () => {
    const onChunk = vi.fn();
    const stream = convertArrayToReadableStream<Uint8Array>([]);

    await processTextStream({ stream, onTextPart: onChunk });

    expect(onChunk).not.toHaveBeenCalled();
  });

  it('should cancel the stream when the callback throws', async () => {
    const error = new Error('callback failed');
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('Hello'));
      },
      cancel,
    });

    await expect(
      processTextStream({
        stream,
        onTextPart() {
          throw error;
        },
      }),
    ).rejects.toBe(error);

    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it('should preserve the callback error when cancellation fails', async () => {
    const callbackError = new Error('callback failed');
    const cancelError = new Error('cancel failed');
    const cancel = vi.fn(() => {
      throw cancelError;
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('Hello'));
      },
      cancel,
    });

    await expect(
      processTextStream({
        stream,
        onTextPart() {
          throw callbackError;
        },
      }),
    ).rejects.toBe(callbackError);

    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it('should preserve upstream read errors and release the stream', async () => {
    const error = new Error('read failed');
    const onChunk = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(error);
      },
    });

    await expect(
      processTextStream({ stream, onTextPart: onChunk }),
    ).rejects.toBe(error);

    expect(onChunk).not.toHaveBeenCalled();
    expect(stream.locked).toBe(false);
  });
});
