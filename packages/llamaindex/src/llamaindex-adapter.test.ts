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

    expect(
      await convertReadableStreamToArray(toDataStream(inputStream)),
    ).toMatchInlineSnapshot(`
      [
        "0:"Hello"
      ",
        "0:"World"
      ",
      ]
    `);
  });
});
