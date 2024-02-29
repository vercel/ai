import assert from 'node:assert';
import { streamText } from './stream-text';
import { MockLanguageModel } from '../test/mock-language-model';
import { convertAsyncIterableToArray } from '../test/convert-async-iterable-to-array';
import { convertArrayToReadableStream } from '../test/convert-array-to-readable-stream';

describe('result.textStream', () => {
  it('should send text deltas as textStream', async () => {
    const result = await streamText({
      model: new MockLanguageModel({
        doStream: async ({ prompt }) =>
          convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: `${prompt}!` },
          ]),
      }),
      prompt: 'world',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.textStream),
      ['Hello', ', ', 'world!'],
    );
  });
});
