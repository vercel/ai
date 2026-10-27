import { describe, expect, it } from 'vitest';
import { findMatches, getLineNumber, replaceRanges } from './find-matches';

function replace(content: string, search: string, replacement: string) {
  const match = findMatches({ content, search });
  if (match === undefined) return undefined;
  return {
    mode: match.mode,
    count: match.ranges.length,
    result: replaceRanges({ content, ranges: match.ranges, replacement }),
  };
}

describe('findMatches', () => {
  it('finds exact matches', () => {
    expect(replace('a foo b foo', 'foo', 'bar')).toEqual({
      mode: 'exact',
      count: 2,
      result: 'a bar b bar',
    });
  });

  it('does not count overlapping matches twice', () => {
    expect(findMatches({ content: 'aaaa', search: 'aa' })?.ranges).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('returns undefined without a match', () => {
    expect(findMatches({ content: 'abc', search: 'xyz' })).toBeUndefined();
  });

  it('ignores whitespace at line ends in the file', () => {
    expect(
      replace('if (x) {  \n  run();\t\n}\n', 'if (x) {\n  run();\n}', 'done'),
    ).toEqual({ mode: 'trailing-whitespace', count: 1, result: 'done\n' });
  });

  it('ignores whitespace at line ends in the search text', () => {
    expect(replace('one\ntwo\n', 'one  \ntwo', 'x')).toEqual({
      mode: 'trailing-whitespace',
      count: 1,
      result: 'x\n',
    });
  });

  it('keeps whitespace before CRLF line endings out of the match', () => {
    expect(replace('one  \r\ntwo\r\n', 'one\r\ntwo', 'x')).toEqual({
      mode: 'trailing-whitespace',
      count: 1,
      result: 'x\r\n',
    });
  });

  it('requires trailing whitespace removed from the search text to end a line', () => {
    expect(
      findMatches({ content: 'foobar\n', search: 'foo ' }),
    ).toBeUndefined();
    expect(replace('foobar\nfoo\n', 'foo ', 'x')).toEqual({
      mode: 'trailing-whitespace',
      count: 1,
      result: 'foobar\nx\n',
    });
  });

  it('treats typographic punctuation as ASCII', () => {
    expect(
      replace(
        'const s = “hello”; // it’s – ok\n',
        `const s = "hello"; // it's - ok`,
        'x',
      ),
    ).toEqual({ mode: 'unicode-punctuation', count: 1, result: 'x\n' });
  });

  it('treats non-breaking spaces as spaces', () => {
    expect(replace('a b', 'a b', 'x')).toEqual({
      mode: 'unicode-punctuation',
      count: 1,
      result: 'x',
    });
  });

  it('does not ignore leading whitespace', () => {
    expect(
      findMatches({ content: 'indented\n', search: '  indented' }),
    ).toBeUndefined();
  });
});

describe('getLineNumber', () => {
  it('returns 1-based line numbers', () => {
    const content = 'a\nb\nc';
    expect(getLineNumber(content, 0)).toBe(1);
    expect(getLineNumber(content, 2)).toBe(2);
    expect(getLineNumber(content, 4)).toBe(3);
  });
});
