import {
  convertReadableStreamToArray,
  convertArrayToAsyncIterable,
  convertResponseStreamToArray,
} from '@ai-sdk/provider-utils/test';
import {
  toDataStreamResponse,
  toDataStream,
} from './llamaindex-workflow-adapter';

describe('toWorkflowDataStream', () => {
  it('should convert AsyncIterable<WorkflowEventData>', async () => {
    const inputStream = convertArrayToAsyncIterable([
      { data: { delta: 'Hello' } },
      { data: { foo: 'bar' } },
      { data: { delta: 'World' } },
    ]);

    assert.deepStrictEqual(
      await convertReadableStreamToArray(toDataStream(inputStream)),
      ['0:"Hello"\n', '8:[{"foo":"bar"}]\n', '0:"World"\n'],
    );
  });

  it('should support callbacks', async () => {
    const inputStream = convertArrayToAsyncIterable([
      { data: { delta: 'Hello' } },
      { data: { delta: 'World' } },
    ]);

    const callbacks = {
      onText: vi.fn(),
    };

    const dataStream = toDataStream(inputStream, callbacks);

    await convertReadableStreamToArray(dataStream);

    expect(callbacks.onText).toHaveBeenCalledTimes(2);
    expect(callbacks.onText).toHaveBeenNthCalledWith(
      1,
      'Hello',
      expect.anything(),
    );
    expect(callbacks.onText).toHaveBeenNthCalledWith(
      2,
      'World',
      expect.anything(),
    );
  });
});

describe('toDataStreamResponse', () => {
  it('should convert AsyncIterable<WorkflowEventData> to a Response', async () => {
    const inputStream = convertArrayToAsyncIterable([
      { data: { delta: 'Hello' } },
      { data: { delta: 'World' } },
    ]);

    const response = toDataStreamResponse(inputStream);

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(Object.fromEntries(response.headers.entries()), {
      'content-type': 'text/plain; charset=utf-8',
      'x-vercel-ai-data-stream': 'v1',
    });

    assert.deepStrictEqual(await convertResponseStreamToArray(response), [
      '0:"Hello"\n',
      '0:"World"\n',
    ]);
  });

  it('should support callbacks', async () => {
    const inputStream = convertArrayToAsyncIterable([
      { data: { delta: 'Hello' } },
      { data: { delta: 'World' } },
    ]);

    const callbacks = {
      onText: vi.fn(),
    };

    const response = toDataStreamResponse(inputStream, {
      callbacks,
    });

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(Object.fromEntries(response.headers.entries()), {
      'content-type': 'text/plain; charset=utf-8',
      'x-vercel-ai-data-stream': 'v1',
    });

    assert.deepStrictEqual(await convertResponseStreamToArray(response), [
      '0:"Hello"\n',
      '0:"World"\n',
    ]);

    expect(callbacks.onText).toHaveBeenCalledTimes(2);
    expect(callbacks.onText).toHaveBeenNthCalledWith(
      1,
      'Hello',
      expect.anything(),
    );
  });
});
