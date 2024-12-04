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

  describe('scenario: first consumer cancels after reading some chunks, second consumer connects and reads remaining chunks', async () => {
    const multiConsumerStream = new MultiConsumerStream({
      stream: convertArrayToReadableStream(['1', '2', '3']),
    });

    const stream1 = multiConsumerStream.split();
    const result1: string[] = [];
    const reader1 = stream1.getReader();

    async function pull1() {
      const { value, done } = await reader1.read();
      if (!done) {
        result1.push(value!);
      }
    }

    await pull1();
    await pull1();

    // disconnect through cancel
    reader1.cancel();

    const stream2 = multiConsumerStream.split();
    const result2: string[] = [];
    const reader2 = stream2.getReader();

    async function pull2() {
      const { value, done } = await reader2.read();
      if (!done) {
        result2.push(value);
      }
    }

    await pull2();

    expect(result1).toEqual(['1', '2']);
    expect(result2).toEqual(['3']);
  });
});
