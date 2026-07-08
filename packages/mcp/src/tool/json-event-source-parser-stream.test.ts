import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { JsonEventSourceParserStream } from './json-event-source-parser-stream';

function parseChunks(chunks: string[]) {
  return convertReadableStreamToArray(
    convertArrayToReadableStream(chunks).pipeThrough(
      new JsonEventSourceParserStream(),
    ),
  );
}

describe('JsonEventSourceParserStream', () => {
  describe('spec-compliant frames', () => {
    it('should parse a frame terminated by a blank line', async () => {
      expect(
        await parseChunks(['data: {"jsonrpc":"2.0","id":1,"result":{}}\n\n']),
      ).toEqual([
        {
          event: undefined,
          data: '{"jsonrpc":"2.0","id":1,"result":{}}',
          id: undefined,
        },
      ]);
    });

    it('should parse event and id fields', async () => {
      expect(
        await parseChunks(['id: 42\nevent: message\ndata: {"ok":true}\n\n']),
      ).toEqual([{ event: 'message', data: '{"ok":true}', id: '42' }]);
    });

    it('should keep the last event id across events', async () => {
      expect(
        await parseChunks(['id: 1\ndata: {"a":1}\n\ndata: {"b":2}\n\n']),
      ).toEqual([
        { event: undefined, data: '{"a":1}', id: '1' },
        { event: undefined, data: '{"b":2}', id: '1' },
      ]);
    });

    it('should ignore comment lines', async () => {
      expect(await parseChunks([': ping\ndata: {"a":1}\n\n'])).toEqual([
        { event: undefined, data: '{"a":1}', id: undefined },
      ]);
    });

    it('should handle CRLF line endings', async () => {
      expect(
        await parseChunks(['event: message\r\ndata: {"a":1}\r\n\r\n']),
      ).toEqual([{ event: 'message', data: '{"a":1}', id: undefined }]);
    });

    it('should dispatch non-JSON data only when the frame is terminated', async () => {
      expect(await parseChunks(['data: not json\n', '\n'])).toEqual([
        { event: undefined, data: 'not json', id: undefined },
      ]);
    });

    it('should drop non-JSON data when the stream ends without a terminator', async () => {
      expect(await parseChunks(['data: not json\n'])).toEqual([]);
    });
  });

  describe('frames missing the blank-line terminator', () => {
    it('should dispatch a complete JSON data line without waiting for a blank line', async () => {
      const stream = new TransformStream<string, string>();
      const events = stream.readable
        .pipeThrough(new JsonEventSourceParserStream())
        .getReader();

      const writer = stream.writable.getWriter();
      // connection stays open: no blank line, no close
      await writer.write('data: {"jsonrpc":"2.0","id":1,"result":{}}\n');

      expect((await events.read()).value).toEqual({
        event: undefined,
        data: '{"jsonrpc":"2.0","id":1,"result":{}}',
        id: undefined,
      });
    });

    it('should include preceding event and id fields in early-dispatched frames', async () => {
      const stream = new TransformStream<string, string>();
      const events = stream.readable
        .pipeThrough(new JsonEventSourceParserStream())
        .getReader();

      const writer = stream.writable.getWriter();
      await writer.write('id: 7\nevent: message\ndata: {"ok":true}\n');

      expect((await events.read()).value).toEqual({
        event: 'message',
        data: '{"ok":true}',
        id: '7',
      });
    });

    it('should not dispatch the same frame again when the terminator arrives later', async () => {
      expect(await parseChunks(['data: {"a":1}\n', '\n'])).toEqual([
        { event: undefined, data: '{"a":1}', id: undefined },
      ]);
    });

    it('should buffer JSON split across chunks until it is complete', async () => {
      expect(
        await parseChunks(['data: {"jsonrpc":"2.0",', '"id":1,"result":{}}\n']),
      ).toEqual([
        {
          event: undefined,
          data: '{"jsonrpc":"2.0","id":1,"result":{}}',
          id: undefined,
        },
      ]);
    });

    it('should buffer JSON split across multiple data lines until it is complete', async () => {
      expect(await parseChunks(['data: {"a":\ndata: 1}\n\n'])).toEqual([
        { event: undefined, data: '{"a":\n1}', id: undefined },
      ]);
    });

    it('should dispatch a trailing JSON frame when the stream ends without a newline', async () => {
      expect(await parseChunks(['data: {"a":1}'])).toEqual([
        { event: undefined, data: '{"a":1}', id: undefined },
      ]);
    });
  });
});
