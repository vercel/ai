import {
  convertArrayToAsyncIterable,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { toDataStream } from './llamaindex-adapter';

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
