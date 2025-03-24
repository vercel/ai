import { createEventSourceParserStream } from './event-source-parser-stream';
import { convertReadableStreamToArray } from './test';

describe('EventSourceParserStream', () => {
  async function parseStream(inputChunks: string[]) {
    const stream = createEventSourceParserStream();
    const writer = stream.writable.getWriter();

    for (const chunk of inputChunks) {
      writer.write(chunk);
    }
    writer.close();

    return convertReadableStreamToArray(stream.readable);
  }

  it('should parse simple data events', async () => {
    expect(await parseStream(['data: hello\n\n'])).toEqual([{ data: 'hello' }]);
  });

  it('should parse events with types', async () => {
    expect(await parseStream(['event: message\ndata: hello\n\n'])).toEqual([
      { event: 'message', data: 'hello' },
    ]);
  });

  it('should handle multiple events in one chunk', async () => {
    expect(await parseStream(['data: one\n\ndata: two\n\n'])).toEqual([
      { data: 'one' },
      { data: 'two' },
    ]);
  });

  it('should handle events split across chunks', async () => {
    expect(await parseStream(['data: hel', 'lo\n\n'])).toEqual([
      { data: 'hello' },
    ]);
  });

  it('should handle events and data split across chunks', async () => {
    expect(await parseStream(['event: mess', 'age\ndata: hello\n\n'])).toEqual([
      { event: 'message', data: 'hello' },
    ]);
  });

  it('should handle CRLF line endings', async () => {
    expect(await parseStream(['data: hello\r\n\r\n'])).toEqual([
      { data: 'hello' },
    ]);
  });

  it('should handle empty data lines', async () => {
    expect(await parseStream(['data: \n', 'data: hello\n\n'])).toEqual([
      { data: '\nhello' },
    ]);
  });

  it('should carry event type to next data line', async () => {
    expect(
      await parseStream([
        'event: message\ndata: one\n\nevent: alert\ndata: two\n\n',
      ]),
    ).toEqual([
      { event: 'message', data: 'one' },
      { event: 'alert', data: 'two' },
    ]);
  });

  it('should reset event type after emitting data', async () => {
    expect(
      await parseStream(['event: message\ndata: hello\n\ndata: world\n\n']),
    ).toEqual([{ event: 'message', data: 'hello' }, { data: 'world' }]);
  });

  it('should handle incomplete events at the end of stream', async () => {
    expect(await parseStream(['data: hello\n\ndata:'])).toEqual([
      { data: 'hello' },
      { data: '' },
    ]);
  });

  it('should handle multi-line data', async () => {
    expect(
      await parseStream(['data: line1\ndata: line2\ndata: line3\n\n']),
    ).toEqual([{ data: 'line1\nline2\nline3' }]);
  });

  it('should handle id field', async () => {
    expect(await parseStream(['id: 123\ndata: hello\n\n'])).toEqual([
      { data: 'hello', id: '123' },
    ]);
  });

  it('should persist id across events', async () => {
    expect(
      await parseStream(['id: 123\ndata: first\n\ndata: second\n\n']),
    ).toEqual([
      { data: 'first', id: '123' },
      { data: 'second', id: '123' },
    ]);
  });

  it('should update id when a new one is received', async () => {
    expect(
      await parseStream(['id: 123\ndata: first\n\nid: 456\ndata: second\n\n']),
    ).toEqual([
      { data: 'first', id: '123' },
      { data: 'second', id: '456' },
    ]);
  });

  it('should handle retry field', async () => {
    expect(await parseStream(['retry: 5000\ndata: hello\n\n'])).toEqual([
      { data: 'hello', retry: 5000 },
    ]);
  });

  it('should ignore invalid retry values', async () => {
    expect(await parseStream(['retry: invalid\ndata: hello\n\n'])).toEqual([
      { data: 'hello' },
    ]);
  });

  it('should ignore comment lines', async () => {
    expect(await parseStream([': this is a comment\ndata: hello\n\n'])).toEqual(
      [{ data: 'hello' }],
    );
  });

  it('should handle fields with no value', async () => {
    expect(await parseStream(['event\ndata: hello\n\n'])).toEqual([
      { event: '', data: 'hello' },
    ]);
  });

  it('should ignore unrecognized fields with no colon', async () => {
    expect(await parseStream(['eventmessage\ndata: hello\n\n'])).toEqual([
      { data: 'hello' },
    ]);
  });

  it('should handle multiple blank lines between events', async () => {
    expect(await parseStream(['data: first\n\n\n\ndata: second\n\n'])).toEqual([
      { data: 'first' },
      { data: 'second' },
    ]);
  });

  it('should emit event at end of stream even without final newline', async () => {
    expect(await parseStream(['data: hello'])).toEqual([{ data: 'hello' }]);
  });

  it('should correctly handle a complete event source stream example', async () => {
    expect(
      await parseStream([
        'event: update\n',
        'id: 1\n',
        'data: {"message": "First update"}\n',
        '\n',
        ': this is a comment\n',
        'event: alert\n',
        'id: 2\n',
        'retry: 10000\n',
        'data: line1\n',
        'data: line2\n',
        '\n',
        'data: standalone message\n',
        '\n',
      ]),
    ).toEqual([
      {
        event: 'update',
        data: '{"message": "First update"}',
        id: '1',
      },
      {
        event: 'alert',
        data: 'line1\nline2',
        id: '2',
        retry: 10000,
      },
      {
        data: 'standalone message',
        id: '2',
      },
    ]);
  });
});
