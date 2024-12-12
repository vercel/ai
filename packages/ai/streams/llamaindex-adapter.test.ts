import {
  convertReadableStreamToArray,
  convertResponseStreamToArray,
  convertArrayToAsyncIterable,
} from '@ai-sdk/provider-utils/test';
import {
  mergeIntoDataStream,
  toDataStream,
  toDataStreamResponse,
} from './llamaindex-adapter';
import { createDataStream } from '../core';

describe('toDataStream', () => {
  it('should convert AsyncIterable<EngineResponse>', async () => {
    const inputStream = convertArrayToAsyncIterable([
      { delta: 'Hello' },
      { delta: 'World' },
    ]);

    assert.deepStrictEqual(
      await convertReadableStreamToArray(
        toDataStream(inputStream).pipeThrough(new TextDecoderStream()),
      ),
      ['0:"Hello"\n', '0:"World"\n'],
    );
  });
});

describe('toDataStreamResponse', () => {
  it('should convert AsyncIterable<EngineResponse>', async () => {
    const inputStream = convertArrayToAsyncIterable([
      { delta: 'Hello' },
      { delta: 'World' },
    ]);

    const response = toDataStreamResponse(inputStream);

    assert.strictEqual(response.status, 200);

    assert.deepStrictEqual(Object.fromEntries(response.headers.entries()), {
      'content-type': 'text/plain; charset=utf-8',
      'x-vercel-ai-data-stream': 'v1',
    });

    assert.strictEqual(
      response.headers.get('Content-Type'),
      'text/plain; charset=utf-8',
    );

    assert.deepStrictEqual(await convertResponseStreamToArray(response), [
      '0:"Hello"\n',
      '0:"World"\n',
    ]);
  });

  describe('mergeIntoDataStream', () => {
    it('should merge LlamaIndex stream into existing data stream', async () => {
      const inputStream = convertArrayToAsyncIterable([
        { delta: 'Hello' },
        { delta: ', ' },
        { delta: 'world!' },
      ]);

      const dataStream = createDataStream({
        execute(writer) {
          // First write some existing data
          writer.writeData('stream-data-value');

          // Then merge in the LlamaIndex stream
          mergeIntoDataStream(inputStream, { dataStream: writer });
        },
      });

      assert.deepStrictEqual(await convertReadableStreamToArray(dataStream), [
        '2:["stream-data-value"]\n',
        '0:"Hello"\n',
        '0:", "\n',
        '0:"world!"\n',
      ]);
    });

    it('should support callbacks while merging', async () => {
      const inputStream = convertArrayToAsyncIterable([
        { delta: 'Hello' },
        { delta: 'World' },
      ]);

      const callbacks = {
        onText: vi.fn(),
      };

      const dataStream = createDataStream({
        execute(writer) {
          mergeIntoDataStream(inputStream, {
            dataStream: writer,
            callbacks,
          });
        },
      });

      await convertReadableStreamToArray(dataStream);

      expect(callbacks.onText).toHaveBeenCalledTimes(2);
      expect(callbacks.onText).toHaveBeenNthCalledWith(1, 'Hello');
      expect(callbacks.onText).toHaveBeenNthCalledWith(2, 'World');
    });
  });
});
