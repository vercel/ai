import { describe, expect, it } from 'vitest';
import { convertArrayToReadableStream } from '../../test';
import { smoothStream } from './smooth-stream';

describe('smoothStream', () => {
  it('should stream complete words when whitespace is found', async () => {
    const events: any[] = [];

    const stream = convertArrayToReadableStream([
      { textDelta: 'Hello', type: 'text-delta' },
      { textDelta: ', ', type: 'text-delta' },
      { textDelta: 'world!', type: 'text-delta' },
      { type: 'step-finish' },
      { type: 'finish' },
    ]).pipeThrough(
      smoothStream({
        delayInMs: 10,
        _internal: {
          delay: () => {
            events.push('delay');
            return Promise.resolve();
          },
        },
      }),
    );

    // Get a reader and read chunks
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      events.push(value);
    }

    expect(events).toEqual([
      'delay',
      {
        textDelta: 'Hello, ',
        type: 'text-delta',
      },
      'delay',
      {
        textDelta: 'world!',
        type: 'text-delta',
      },
      {
        type: 'step-finish',
      },
      {
        type: 'finish',
      },
    ]);
  });
});
