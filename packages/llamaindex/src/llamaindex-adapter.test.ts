import {
  convertArrayToAsyncIterable,
  convertReadableStreamToArray,
} from 'ai/test';
import { toDataStream } from './llamaindex-adapter';

describe('toDataStream', () => {
  it('should convert AsyncIterable<EngineResponse>', async () => {
    const inputStream = convertArrayToAsyncIterable([
      { delta: 'Hello' },
      { delta: 'World' },
    ]);

    expect(await convertReadableStreamToArray(toDataStream(inputStream)))
      .toMatchInlineSnapshot(`
        [
          {
            "type": "text",
            "value": "Hello",
          },
          {
            "type": "text",
            "value": "World",
          },
        ]
      `);
  });
});
