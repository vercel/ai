import { parseJsonEventStream } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TextStreamPart } from '../generate-text/stream-text-result';
import { createUIMessageStreamResponse } from './create-ui-message-stream-response';
import { type UIMessageChunk, uiMessageChunkSchema } from './ui-message-chunks';
import { toUIMessageStream } from './to-ui-message-stream';

describe('createUIMessageStreamResponse', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a Response with correct headers and encoded stream', async () => {
    const response = createUIMessageStreamResponse({
      status: 200,
      statusText: 'OK',
      headers: {
        'Custom-Header': 'test',
      },
      stream: convertArrayToReadableStream([
        { type: 'text-delta', id: '1', delta: 'test-data' },
      ]),
    });

    // Verify response properties
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.statusText).toBe('OK');

    // Verify headers
    expect(Object.fromEntries(response.headers.entries()))
      .toMatchInlineSnapshot(`
        {
          "cache-control": "no-cache",
          "connection": "keep-alive",
          "content-type": "text/event-stream",
          "custom-header": "test",
          "x-accel-buffering": "no",
          "x-vercel-ai-ui-message-stream": "v1",
        }
      `);

    expect(
      await convertReadableStreamToArray(
        response.body!.pipeThrough(new TextDecoderStream()),
      ),
    ).toMatchInlineSnapshot(`
      [
        "data: {"type":"text-delta","id":"1","delta":"test-data"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });

  it('can respond with a stream created by toUIMessageStream', async () => {
    const response = createUIMessageStreamResponse({
      status: 200,
      stream: toUIMessageStream({
        stream: convertArrayToReadableStream([
          { type: 'start' },
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', text: 'Hello' },
          { type: 'text-end', id: 't1' },
        ] satisfies TextStreamPart<{}>[]),
        generateMessageId: () => 'msg-123',
      }),
    });

    expect(
      await convertReadableStreamToArray(
        response.body!.pipeThrough(new TextDecoderStream()),
      ),
    ).toMatchInlineSnapshot(`
      [
        "data: {"type":"start","messageId":"msg-123"}

      ",
        "data: {"type":"text-start","id":"t1"}

      ",
        "data: {"type":"text-delta","id":"t1","delta":"Hello"}

      ",
        "data: {"type":"text-end","id":"t1"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });

  it('should handle errors in the stream', async () => {
    const response = createUIMessageStreamResponse({
      status: 200,
      stream: convertArrayToReadableStream([
        { type: 'error', errorText: 'Custom error message' },
      ]),
    });

    expect(
      await convertReadableStreamToArray(
        response.body!.pipeThrough(new TextDecoderStream()),
      ),
    ).toMatchInlineSnapshot(`
      [
        "data: {"type":"error","errorText":"Custom error message"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });

  it('should call consumeSseStream with a teed stream', async () => {
    const consumedData: string[] = [];
    const consumeSseStream = vi.fn(
      async ({ stream }: { stream: ReadableStream<string> }) => {
        const data = await convertReadableStreamToArray(stream);
        consumedData.push(...data);
      },
    );

    const response = createUIMessageStreamResponse({
      status: 200,
      stream: convertArrayToReadableStream([
        { type: 'text-delta', id: '1', delta: 'test-data-1' },
        { type: 'text-delta', id: '1', delta: 'test-data-2' },
      ]),
      consumeSseStream,
    });

    // Verify consumeSseStream was called
    expect(consumeSseStream).toHaveBeenCalledTimes(1);
    expect(consumeSseStream).toHaveBeenCalledWith({
      stream: expect.any(ReadableStream),
    });

    // Verify the response stream still works correctly
    const responseData = await convertReadableStreamToArray(
      response.body!.pipeThrough(new TextDecoderStream()),
    );

    expect(responseData).toMatchInlineSnapshot(`
      [
        "data: {"type":"text-delta","id":"1","delta":"test-data-1"}

      ",
        "data: {"type":"text-delta","id":"1","delta":"test-data-2"}

      ",
        "data: [DONE]

      ",
      ]
    `);

    // Wait for consumeSseStream to complete
    await vi.advanceTimersByTimeAsync(0);

    // Verify consumeSseStream received the same data
    expect(consumedData).toMatchInlineSnapshot(`
      [
        "data: {"type":"text-delta","id":"1","delta":"test-data-1"}

      ",
        "data: {"type":"text-delta","id":"1","delta":"test-data-2"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });

  it('should not block the response when consumeSseStream takes time', async () => {
    let consumeResolve: () => void;
    const consumePromise = new Promise<void>(resolve => {
      consumeResolve = resolve;
    });

    const consumeSseStream = vi.fn(
      async ({ stream }: { stream: ReadableStream<string> }) => {
        // Consume the stream but wait for external resolution
        await convertReadableStreamToArray(stream);
        await consumePromise;
      },
    );

    const response = createUIMessageStreamResponse({
      status: 200,
      stream: convertArrayToReadableStream([
        { type: 'text-delta', id: '1', delta: 'test-data' },
      ]),
      consumeSseStream,
    });

    // The response should be immediately available even though consumeSseStream hasn't finished
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);

    // The response body should be readable immediately
    const responseData = await convertReadableStreamToArray(
      response.body!.pipeThrough(new TextDecoderStream()),
    );

    expect(responseData).toMatchInlineSnapshot(`
      [
        "data: {"type":"text-delta","id":"1","delta":"test-data"}

      ",
        "data: [DONE]

      ",
      ]
    `);

    // Verify consumeSseStream was called but may still be running
    expect(consumeSseStream).toHaveBeenCalledTimes(1);

    // Now resolve the consumeSseStream
    consumeResolve!();
  });

  it('should handle synchronous consumeSseStream', async () => {
    const consumedData: string[] = [];
    const consumeSseStream = vi.fn(
      ({ stream }: { stream: ReadableStream<string> }) => {
        // Synchronous consumption (not returning a promise)
        stream.pipeTo(
          new WritableStream({
            write(chunk) {
              consumedData.push(chunk);
            },
          }),
        );
      },
    );

    const response = createUIMessageStreamResponse({
      status: 200,
      stream: convertArrayToReadableStream([
        { type: 'text-delta', id: '1', delta: 'sync-test' },
      ]),
      consumeSseStream,
    });

    expect(consumeSseStream).toHaveBeenCalledTimes(1);

    const responseData = await convertReadableStreamToArray(
      response.body!.pipeThrough(new TextDecoderStream()),
    );

    expect(responseData).toMatchInlineSnapshot(`
      [
        "data: {"type":"text-delta","id":"1","delta":"sync-test"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });

  describe('keepAliveMs', () => {
    /**
     * A stream that stays silent until the test pushes into it - this is what an
     * idle stream (e.g. a resumed stream at the live edge) looks like.
     */
    function createGatedStream() {
      let controller!: ReadableStreamDefaultController<UIMessageChunk>;
      const stream = new ReadableStream<UIMessageChunk>({
        start(controllerArg) {
          controller = controllerArg;
        },
      });
      return {
        stream,
        push: (chunk: UIMessageChunk) => controller.enqueue(chunk),
        close: () => controller.close(),
      };
    }

    it('should send a keep-alive comment before the stream produces its first chunk', async () => {
      const source = createGatedStream();

      const response = createUIMessageStreamResponse({
        stream: source.stream,
        keepAliveMs: 25_000,
      });

      const reader = response
        .body!.pipeThrough(new TextDecoderStream())
        .getReader();

      // the source has not produced anything yet, but the response body
      // already has bytes, so the response head is flushed:
      expect(await reader.read()).toEqual({
        done: false,
        value: ': keep-alive\n\n',
      });
    });

    it('should send a keep-alive comment for each idle interval', async () => {
      const source = createGatedStream();

      const response = createUIMessageStreamResponse({
        stream: source.stream,
        keepAliveMs: 25_000,
      });

      const reader = response
        .body!.pipeThrough(new TextDecoderStream())
        .getReader();

      await reader.read(); // initial keep-alive comment

      const read = reader.read();
      await vi.advanceTimersByTimeAsync(25_000);

      expect(await read).toEqual({ done: false, value: ': keep-alive\n\n' });
    });

    it('should send the stream chunks in between keep-alive comments', async () => {
      const source = createGatedStream();

      const response = createUIMessageStreamResponse({
        stream: source.stream,
        keepAliveMs: 25_000,
      });

      const reader = response
        .body!.pipeThrough(new TextDecoderStream())
        .getReader();

      await reader.read(); // initial keep-alive comment

      source.push({ type: 'text-delta', id: '1', delta: 'test-data' });
      source.close();

      expect(await reader.read()).toEqual({
        done: false,
        value: 'data: {"type":"text-delta","id":"1","delta":"test-data"}\n\n',
      });
      expect(await reader.read()).toEqual({
        done: false,
        value: 'data: [DONE]\n\n',
      });
      expect(await reader.read()).toEqual({ done: true, value: undefined });
    });

    it('should not send keep-alive comments when keepAliveMs is not set', async () => {
      const response = createUIMessageStreamResponse({
        stream: convertArrayToReadableStream([
          { type: 'text-delta', id: '1', delta: 'test-data' },
        ]),
      });

      expect(
        await convertReadableStreamToArray(
          response.body!.pipeThrough(new TextDecoderStream()),
        ),
      ).toEqual([
        'data: {"type":"text-delta","id":"1","delta":"test-data"}\n\n',
        'data: [DONE]\n\n',
      ]);
    });

    it('should not send keep-alive comments to consumeSseStream', async () => {
      const consumedData: string[] = [];
      const source = createGatedStream();

      const response = createUIMessageStreamResponse({
        stream: source.stream,
        keepAliveMs: 25_000,
        consumeSseStream: async ({ stream }) => {
          consumedData.push(...(await convertReadableStreamToArray(stream)));
        },
      });

      const reader = response
        .body!.pipeThrough(new TextDecoderStream())
        .getReader();

      await reader.read(); // initial keep-alive comment

      const keepAlive = reader.read();
      await vi.advanceTimersByTimeAsync(25_000);
      await keepAlive;

      source.push({ type: 'text-delta', id: '1', delta: 'test-data' });
      source.close();

      while (!(await reader.read()).done) {
        // drain the response body
      }

      await vi.advanceTimersByTimeAsync(0);

      expect(consumedData).toEqual([
        'data: {"type":"text-delta","id":"1","delta":"test-data"}\n\n',
        'data: [DONE]\n\n',
      ]);
    });

    it('should send keep-alive comments that SSE clients ignore', async () => {
      const source = createGatedStream();

      const response = createUIMessageStreamResponse({
        stream: source.stream,
        keepAliveMs: 25_000,
      });

      // parse the response the same way the UI transports do:
      const chunks = parseJsonEventStream({
        stream: response.body!,
        schema: uiMessageChunkSchema,
      });

      const reader = chunks.getReader();

      const read = reader.read();
      await vi.advanceTimersByTimeAsync(25_000); // one idle interval
      source.push({ type: 'text-delta', id: '1', delta: 'test-data' });
      source.close();

      // the keep-alive comments are not visible to the client:
      expect(await read).toEqual({
        done: false,
        value: {
          success: true,
          value: { type: 'text-delta', id: '1', delta: 'test-data' },
          rawValue: { type: 'text-delta', id: '1', delta: 'test-data' },
        },
      });
      expect(await reader.read()).toEqual({ done: true, value: undefined });
    });

    it('should cancel the stream when the client disconnects', async () => {
      let cancelReason: unknown;
      const stream = new ReadableStream<UIMessageChunk>({
        cancel(reason) {
          cancelReason = reason;
        },
      });

      const response = createUIMessageStreamResponse({
        stream,
        keepAliveMs: 25_000,
      });

      const reader = response.body!.getReader();
      await reader.read(); // initial keep-alive comment
      reader.read(); // pending read on the idle stream
      await vi.advanceTimersByTimeAsync(0);

      await reader.cancel('client disconnected');
      await vi.advanceTimersByTimeAsync(0);

      expect(cancelReason).toBe('client disconnected');
    });
  });

  it('should handle consumeSseStream errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const consumeSseStream = vi.fn(async () => {
      throw new Error('consumeSseStream error');
    });

    const response = createUIMessageStreamResponse({
      status: 200,
      stream: convertArrayToReadableStream([
        { type: 'text-delta', id: '1', delta: 'error-test' },
      ]),
      consumeSseStream,
    });

    // The response should still work even if consumeSseStream fails
    const responseData = await convertReadableStreamToArray(
      response.body!.pipeThrough(new TextDecoderStream()),
    );

    expect(responseData).toMatchInlineSnapshot(`
      [
        "data: {"type":"text-delta","id":"1","delta":"error-test"}

      ",
        "data: [DONE]

      ",
      ]
    `);

    expect(consumeSseStream).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});
