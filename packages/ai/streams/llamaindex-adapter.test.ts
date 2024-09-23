import {
  convertReadableStreamToArray,
  convertResponseStreamToArray,
  convertArrayToAsyncIterable,
} from '@ai-sdk/provider-utils/test';
import { toDataStream, toDataStreamResponse } from './llamaindex-adapter';

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
});
