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

  it.each([' ', '\t', ' \t', '\u00a0\u2009'])(
    'reads internal %j runs only a linear number of times',
    whitespace => {
      const text = `before${whitespace.repeat(256)}after`;
      let characterReads = 0;
      // Count indexed reads instead of relying on machine-dependent timings.
      const trackedText = new Proxy(Object(text), {
        get(target, property) {
          if (typeof property === 'string' && /^\d+$/.test(property)) {
            characterReads++;
          }
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }) as string;

      expect(
        findMatches({ content: trackedText, search: 'missing' }),
      ).toBeUndefined();
      expect(characterReads).toBeLessThan(12 * text.length);

      characterReads = 0;
      expect(
        findMatches({ content: 'missing', search: trackedText }),
      ).toBeUndefined();
      expect(characterReads).toBeLessThan(12 * text.length);
    },
  );

  it.each(['\n', '\r\n'])(
    'preserves internal spaces, tabs, and offsets with %j line endings',
    lineEnding => {
      const whitespace = ' \t'.repeat(1024);
      const content = `prefix  ${lineEnding}before${whitespace}after \t${lineEnding}suffix`;
      const search = `before${whitespace}after${lineEnding}`;

      expect(replace(content, search, 'changed\n')).toEqual({
        mode: 'trailing-whitespace',
        count: 1,
        result: `prefix  ${lineEnding}changed\nsuffix`,
      });
    },
  );

  it('preserves offsets when normalizing internal Unicode whitespace runs', () => {
    const whitespace = '\u00a0\t\u2009'.repeat(1024);
    expect(
      replace(
        `prefix\n“before${whitespace}after” \t\nsuffix`,
        `"before${' \t '.repeat(1024)}after"\n`,
        'changed\n',
      ),
    ).toEqual({
      mode: 'unicode-punctuation',
      count: 1,
      result: 'prefix\nchanged\nsuffix',
    });
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
