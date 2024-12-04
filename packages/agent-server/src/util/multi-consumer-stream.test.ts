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
});
