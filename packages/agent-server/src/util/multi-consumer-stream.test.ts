import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { MultiConsumerStream } from './multi-consumer-stream';

describe('MultiConsumerStream', () => {
  describe('scenario: single consumer reads all chunks from stream', async () => {
    const multiConsumerStream = new MultiConsumerStream({
      stream: convertArrayToReadableStream(['1', '2', '3']),
    });

    const stream = multiConsumerStream.split();

    expect(await convertReadableStreamToArray(stream)).toEqual(['1', '2', '3']);
  });

  describe('scenario: two consumers read chunks from stream', async () => {
    const multiConsumerStream = new MultiConsumerStream({
      stream: convertArrayToReadableStream(['1', '2', '3']),
    });

    const stream1 = multiConsumerStream.split();
    const stream2 = multiConsumerStream.split();

    expect(await convertReadableStreamToArray(stream1)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(await convertReadableStreamToArray(stream2)).toEqual([
      '1',
      '2',
      '3',
    ]);
  });
});
