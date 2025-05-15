import {
  convertArrayToAsyncIterable,
  convertReadableStreamToArray,
} from 'ai/test';
import { toUIMessageStream } from './llamaindex-adapter';

describe('toUIMessageStream', () => {
  it('should convert AsyncIterable<EngineResponse>', async () => {
    const inputStream = convertArrayToAsyncIterable([
      { delta: 'Hello' },
      { delta: 'World' },
    ]);

    expect(await convertReadableStreamToArray(toUIMessageStream(inputStream)))
      .toMatchInlineSnapshot(`
        [
          {
            "text": "Hello",
            "type": "text",
          },
          {
            "text": "World",
            "type": "text",
          },
        ]
      `);
  });
});
