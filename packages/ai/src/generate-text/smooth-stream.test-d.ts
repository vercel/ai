import { expectTypeOf, it } from 'vitest';
import { smoothStream } from './smooth-stream';

it('accepts unfinished segment buffering', () => {
  expectTypeOf(
    smoothStream({
      chunking: new Intl.Segmenter('en', { granularity: 'word' }),
      bufferUnfinishedSegments: true,
    }),
  ).toBeFunction();

  smoothStream({
    // @ts-expect-error bufferUnfinishedSegments must be a boolean
    bufferUnfinishedSegments: 'true',
  });
});
