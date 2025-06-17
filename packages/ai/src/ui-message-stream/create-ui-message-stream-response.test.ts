import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createUIMessageStreamResponse } from './create-ui-message-stream-response';

describe('createUIMessageStreamResponse', () => {
  it('should create a Response with correct headers and encoded stream', async () => {
    const response = createUIMessageStreamResponse({
      status: 200,
      statusText: 'OK',
      headers: {
        'Custom-Header': 'test',
      },
      stream: convertArrayToReadableStream([
        { type: 'text', text: 'test-data' },
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
        "data: {"type":"text","text":"test-data"}

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
        { type: 'text', text: 'test-data-1' },
        { type: 'text', text: 'test-data-2' },
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
        "data: {"type":"text","text":"test-data-1"}

      ",
        "data: {"type":"text","text":"test-data-2"}

      ",
        "data: [DONE]

      ",
      ]
    `);

    // Wait for consumeSseStream to complete
    await new Promise(resolve => setTimeout(resolve, 0));

    // Verify consumeSseStream received the same data
    expect(consumedData).toMatchInlineSnapshot(`
      [
        "data: {"type":"text","text":"test-data-1"}

      ",
        "data: {"type":"text","text":"test-data-2"}

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
        { type: 'text', text: 'test-data' },
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
        "data: {"type":"text","text":"test-data"}

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
        { type: 'text', text: 'sync-test' },
      ]),
      consumeSseStream,
    });

    expect(consumeSseStream).toHaveBeenCalledTimes(1);

    const responseData = await convertReadableStreamToArray(
      response.body!.pipeThrough(new TextDecoderStream()),
    );

    expect(responseData).toMatchInlineSnapshot(`
      [
        "data: {"type":"text","text":"sync-test"}

      ",
        "data: [DONE]

      ",
      ]
    `);
  });

  it('should handle consumeSseStream errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const consumeSseStream = vi.fn(async () => {
      throw new Error('consumeSseStream error');
    });

    const response = createUIMessageStreamResponse({
      status: 200,
      stream: convertArrayToReadableStream([
        { type: 'text', text: 'error-test' },
      ]),
      consumeSseStream,
    });

    // The response should still work even if consumeSseStream fails
    const responseData = await convertReadableStreamToArray(
      response.body!.pipeThrough(new TextDecoderStream()),
    );

    expect(responseData).toMatchInlineSnapshot(`
      [
        "data: {"type":"text","text":"error-test"}

      ",
        "data: [DONE]

      ",
      ]
    `);

    expect(consumeSseStream).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});
