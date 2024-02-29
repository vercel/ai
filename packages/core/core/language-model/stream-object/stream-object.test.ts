import assert from 'node:assert';
import { z } from 'zod';
import { convertArrayToReadableStream } from '../test/convert-array-to-readable-stream';
import { convertAsyncIterableToArray } from '../test/convert-async-iterable-to-array';
import { MockLanguageModel } from '../test/mock-language-model';
import { streamObject } from './stream-object';

describe('result.objectStream', () => {
  it('should send object deltas', async () => {
    const result = await streamObject({
      model: new MockLanguageModel({
        doStreamJsonText: async ({ prompt }) =>
          convertArrayToReadableStream([
            { type: 'json-text-delta', textDelta: '{ ' },
            { type: 'json-text-delta', textDelta: '"content": ' },
            { type: 'json-text-delta', textDelta: `"Hello, ` },
            { type: 'json-text-delta', textDelta: `${prompt}` },
            { type: 'json-text-delta', textDelta: `!"` },
            { type: 'json-text-delta', textDelta: ' }' },
          ]),
      }),
      schema: z.object({ content: z.string() }),
      prompt: 'world',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.objectStream),
      [
        {},
        { content: 'Hello, ' },
        { content: 'Hello, world' },
        { content: 'Hello, world!' },
      ],
    );
  });
});
