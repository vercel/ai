import { createEventSourceParserStream } from './event-source-parser-stream';
import { convertReadableStreamToArray } from './test';

describe('EventSourceParserStream', () => {
  async function testStream({
    inputChunks,
    expectedOutputs,
  }: {
    inputChunks: string[];
    expectedOutputs: Array<{ event: string | undefined; data: string }>;
  }) {
    const stream = createEventSourceParserStream();
    const writer = stream.writable.getWriter();

    for (const chunk of inputChunks) {
      writer.write(chunk);
    }
    writer.close();

    expect(await convertReadableStreamToArray(stream.readable)).toEqual(
      expectedOutputs,
    );
  }

  it('should parse simple data events', async () => {
    await testStream({
      inputChunks: ['data: hello\n'],
      expectedOutputs: [{ event: undefined, data: 'hello' }],
    });
  });

  it('should parse events with types', async () => {
    await testStream({
      inputChunks: ['event: message\ndata: hello\n'],
      expectedOutputs: [{ event: 'message', data: 'hello' }],
    });
  });

  it('should handle multiple events in one chunk', async () => {
    await testStream({
      inputChunks: ['data: one\ndata: two\n'],
      expectedOutputs: [
        { event: undefined, data: 'one' },
        { event: undefined, data: 'two' },
      ],
    });
  });

  it('should handle events split across chunks', async () => {
    await testStream({
      inputChunks: ['data: hel', 'lo\n'],
      expectedOutputs: [{ event: undefined, data: 'hello' }],
    });
  });

  it('should handle events and data split across chunks', async () => {
    await testStream({
      inputChunks: ['event: mess', 'age\ndata: hello\n'],
      expectedOutputs: [{ event: 'message', data: 'hello' }],
    });
  });

  it('should handle CRLF line endings', async () => {
    await testStream({
      inputChunks: ['data: hello\r\n'],
      expectedOutputs: [{ event: undefined, data: 'hello' }],
    });
  });

  it('should ignore empty data lines', async () => {
    await testStream({
      inputChunks: ['data: \n', 'data: hello\n'],
      expectedOutputs: [{ event: undefined, data: 'hello' }],
    });
  });

  it('should carry event type to next data line', async () => {
    await testStream({
      inputChunks: ['event: message\ndata: one\nevent: alert\ndata: two\n'],
      expectedOutputs: [
        { event: 'message', data: 'one' },
        { event: 'alert', data: 'two' },
      ],
    });
  });

  it('should reset event type after emitting data', async () => {
    await testStream({
      inputChunks: ['event: message\ndata: hello\ndata: world\n'],
      expectedOutputs: [
        { event: 'message', data: 'hello' },
        { event: undefined, data: 'world' },
      ],
    });
  });

  it('should handle incomplete events at the end of stream', async () => {
    // This tests that incomplete data at the end of stream is not emitted
    await testStream({
      inputChunks: ['data: hello\ndata:'],
      expectedOutputs: [{ event: undefined, data: 'hello' }],
    });
  });
});
