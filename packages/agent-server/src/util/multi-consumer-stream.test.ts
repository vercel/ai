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

    const consumer1 = new TestConsumer(multiConsumerStream.split());
    await consumer1.pull();
    await consumer1.pull();
    consumer1.reader.cancel();

    const consumer2 = new TestConsumer(multiConsumerStream.split());
    await consumer2.pull();

    expect(consumer1.result).toEqual(['1', '2']);
    expect(consumer2.result).toEqual(['3']);
  });

  describe('scenario: 3 overlapping consumers with start/cancel', async () => {
    const multiConsumerStream = new MultiConsumerStream({
      stream: convertArrayToReadableStream(['1', '2', '3']),
    });

    const stream1 = multiConsumerStream.split();

    const consumer2 = new TestConsumer(multiConsumerStream.split());
    await consumer2.pull();

    const consumer3 = new TestConsumer(multiConsumerStream.split());

    await consumer2.pull();
    consumer2.reader.cancel();

    await consumer3.pull();
    await consumer3.pull();

    expect(await convertReadableStreamToArray(stream1)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(consumer2.result).toEqual(['1', '2']);
    expect(consumer3.result).toEqual(['2', '3']);
  });
});

class TestConsumer<CHUNK> {
  readonly reader: ReadableStreamDefaultReader<CHUNK>;
  readonly result: CHUNK[] = [];

  constructor(stream: ReadableStream<CHUNK>) {
    this.reader = stream.getReader();
  }

  async pull() {
    const { value, done } = await this.reader.read();
    if (!done) {
      this.result.push(value!);
    }
  }
}
