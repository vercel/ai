import { describe, expect, test } from 'vitest';
import { createFxSseParser } from './fx-sse';

describe('createFxSseParser', () => {
  test('returns the data of events split across chunks', () => {
    const parser = createFxSseParser();

    expect(parser.push('data: {"a"')).toEqual([]);
    expect(parser.push(':1}\n\nevent: x\ndata: one\r\ndata: two\n')).toEqual([
      '{"a":1}',
    ]);
    expect(parser.push('\n: comment\n\n')).toEqual(['one\ntwo']);
    expect(parser.flush()).toEqual([]);
  });

  test('returns the last event when the stream ends without a blank line', () => {
    const parser = createFxSseParser();

    expect(parser.push('data: [DONE]\n\ndata: last')).toEqual(['[DONE]']);
    expect(parser.flush()).toEqual(['last']);
  });
});
