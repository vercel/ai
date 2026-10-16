import { describe, it, expect } from 'vitest';
import { readResponseWithSizeLimit } from './read-response-with-size-limit';
import { DownloadError } from './download-error';

function createMockResponse({
  body,
  contentLength,
  chunkSize = 4,
  chunkOffsets = false,
}: {
  body?: Uint8Array | null;
  contentLength?: string;
  chunkSize?: number;
  chunkOffsets?: boolean;
}): { response: Response; cancelled: () => boolean } {
  const headers = new Headers();
  if (contentLength != null) {
    headers.set('content-length', contentLength);
  }

  let cancelled = false;

  const stream =
    body != null
      ? new ReadableStream<Uint8Array>({
          start(controller) {
            if (chunkOffsets) {
              // Emit views with a non-zero byteOffset, the way a runtime that
              // slices a shared backing buffer does.
              for (let i = 0; i < body.length; i += chunkSize) {
                controller.enqueue(body.subarray(i, i + chunkSize));
              }
            } else {
              // Send in small chunks to simulate streaming
              for (let i = 0; i < body.length; i += chunkSize) {
                controller.enqueue(body.slice(i, i + chunkSize));
              }
            }
            controller.close();
          },
          cancel() {
            cancelled = true;
          },
        })
      : null;

  return {
    response: {
      headers,
      body: stream,
    } as unknown as Response,
    cancelled: () => cancelled,
  };
}

describe('readResponseWithSizeLimit', () => {
  it('should read response within limit successfully', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const { response } = createMockResponse({
      body: data,
      contentLength: '8',
    });

    const result = await readResponseWithSizeLimit({
      response,
      url: 'http://example.com/file',
      maxBytes: 100,
    });

    expect(result).toEqual(data);
  });

  it('should reject when Content-Length exceeds limit (early check)', async () => {
    const { response } = createMockResponse({
      body: new Uint8Array(10),
      contentLength: '1000',
    });

    await expect(
      readResponseWithSizeLimit({
        response,
        url: 'http://example.com/large',
        maxBytes: 100,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(DownloadError.isInstance(error)).toBe(true);
      expect((error as DownloadError).message).toContain(
        'Content-Length: 1000',
      );
      return true;
    });
  });

  it('should cancel the body when Content-Length exceeds limit (prevents socket leak)', async () => {
    const { response, cancelled } = createMockResponse({
      body: new Uint8Array(10),
      contentLength: '1000',
    });

    await expect(
      readResponseWithSizeLimit({
        response,
        url: 'http://example.com/large',
        maxBytes: 100,
      }),
    ).rejects.toThrow();

    expect(cancelled()).toBe(true);
  });

  it('should abort when streamed bytes exceed limit', async () => {
    // Body is larger than maxBytes, but Content-Length is not set
    const largeBody = new Uint8Array(200);
    largeBody.fill(42);

    const { response } = createMockResponse({
      body: largeBody,
    });

    await expect(
      readResponseWithSizeLimit({
        response,
        url: 'http://example.com/streaming',
        maxBytes: 50,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(DownloadError.isInstance(error)).toBe(true);
      expect((error as DownloadError).message).toContain(
        'exceeded maximum size of 50 bytes',
      );
      return true;
    });
  });

  it('should preserve streamed size-limit errors when cancellation fails', async () => {
    const cancelError = new Error('cancel failed');
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
      },
      cancel() {
        cancelled = true;
        return Promise.reject(cancelError);
      },
    });
    const response = {
      headers: new Headers(),
      body,
    } as unknown as Response;

    await expect(
      readResponseWithSizeLimit({
        response,
        url: 'http://example.com/streaming',
        maxBytes: 1,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).not.toBe(cancelError);
      expect(DownloadError.isInstance(error)).toBe(true);
      expect((error as DownloadError).message).toBe(
        'Download of http://example.com/streaming exceeded maximum size of 1 bytes.',
      );
      return true;
    });

    expect(cancelled).toBe(true);
    expect(body.locked).toBe(false);
  });

  it('should handle lying Content-Length (says small, sends large)', async () => {
    const largeBody = new Uint8Array(200);
    largeBody.fill(42);

    const { response } = createMockResponse({
      body: largeBody,
      contentLength: '10', // Claims to be small
    });

    await expect(
      readResponseWithSizeLimit({
        response,
        url: 'http://example.com/liar',
        maxBytes: 50,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(DownloadError.isInstance(error)).toBe(true);
      expect((error as DownloadError).message).toContain(
        'exceeded maximum size of 50 bytes',
      );
      return true;
    });
  });

  it('should handle empty body (null)', async () => {
    const { response } = createMockResponse({
      body: null,
    });

    const result = await readResponseWithSizeLimit({
      response,
      url: 'http://example.com/empty',
      maxBytes: 100,
    });

    expect(result).toEqual(new Uint8Array(0));
  });

  it('should handle empty body (zero-length)', async () => {
    const { response } = createMockResponse({
      body: new Uint8Array(0),
    });

    const result = await readResponseWithSizeLimit({
      response,
      url: 'http://example.com/empty',
      maxBytes: 100,
    });

    expect(result).toEqual(new Uint8Array(0));
  });

  it('should respect custom maxBytes', async () => {
    const data = new Uint8Array(10);
    data.fill(1);

    const { response } = createMockResponse({
      body: data,
      contentLength: '10',
    });

    const result = await readResponseWithSizeLimit({
      response,
      url: 'http://example.com/custom',
      maxBytes: 10,
    });

    expect(result).toEqual(data);
  });

  it('should reject at exact boundary (maxBytes + 1)', async () => {
    const data = new Uint8Array(11);
    data.fill(1);

    const { response } = createMockResponse({
      body: data,
    });

    await expect(
      readResponseWithSizeLimit({
        response,
        url: 'http://example.com/boundary',
        maxBytes: 10,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(DownloadError.isInstance(error)).toBe(true);
      return true;
    });
  });
});

describe('readResponseWithSizeLimit buffer handling', () => {
  it('should copy chunks that are views with a non-zero byteOffset', async () => {
    // A chunk that is a view over a buffer bigger than the chunk (Deno hands
    // back one per read) must be copied out by offset, so the result is exactly
    // the body and no oversized backing buffer is kept alive.
    const body = new Uint8Array(64 * 1024);
    for (let i = 0; i < body.length; i++) {
      body[i] = i % 256;
    }

    const { response } = createMockResponse({
      body,
      chunkSize: 1024,
      chunkOffsets: true,
    });

    const result = await readResponseWithSizeLimit({
      response,
      url: 'http://example.com/file',
    });

    expect(result).toEqual(body);
    expect(result.buffer.byteLength).toBe(body.length);
  });

  it('should read a body larger than the initial buffer', async () => {
    // Exercises the growth path when no Content-Length is declared.
    const body = new Uint8Array(200 * 1024);
    for (let i = 0; i < body.length; i++) {
      body[i] = (i * 7) % 256;
    }

    const { response } = createMockResponse({
      body,
      chunkSize: 997,
      chunkOffsets: true,
    });

    const result = await readResponseWithSizeLimit({
      response,
      url: 'http://example.com/large',
    });

    expect(result).toEqual(body);
    expect(result.buffer.byteLength).toBe(body.length);
  });

  it('should size the result from the declared Content-Length', async () => {
    const body = new Uint8Array([1, 2, 3, 4, 5]);

    const { response } = createMockResponse({
      body,
      contentLength: '5',
    });

    const result = await readResponseWithSizeLimit({
      response,
      url: 'http://example.com/file',
    });

    expect(result).toEqual(body);
    expect(result.buffer.byteLength).toBe(5);
  });

  it('should trim the buffer when the body is shorter than declared', async () => {
    const body = new Uint8Array([1, 2, 3]);

    const { response } = createMockResponse({
      body,
      contentLength: '100',
    });

    const result = await readResponseWithSizeLimit({
      response,
      url: 'http://example.com/short',
    });

    expect(result).toEqual(body);
    expect(result.buffer.byteLength).toBe(3);
  });
});
