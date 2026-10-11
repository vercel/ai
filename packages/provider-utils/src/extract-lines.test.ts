import { describe, expect, it } from 'vitest';
import { extractLines } from './extract-lines';

describe('extractLines', () => {
  it('returns the input unchanged when neither startLine nor endLine is set', () => {
    expect(extractLines({ text: 'a\r\nb\nc\rd' })).toBe('a\r\nb\nc\rd');
  });

  it('slices a 1-based inclusive range from a \\n file', () => {
    expect(extractLines({ text: 'a\nb\nc\nd', startLine: 2, endLine: 3 })).toBe(
      'b\nc',
    );
  });

  it('preserves \\r\\n line endings', () => {
    expect(
      extractLines({ text: 'a\r\nb\r\nc\r\nd', startLine: 2, endLine: 3 }),
    ).toBe('b\r\nc');
  });

  it('preserves \\r line endings', () => {
    expect(extractLines({ text: 'a\rb\rc\rd', startLine: 2, endLine: 3 })).toBe(
      'b\rc',
    );
  });

  it('slices logical lines from a file with mixed line endings', () => {
    const text = 'first\r\nsecond\nthird\rfourth';

    expect(extractLines({ text, startLine: 2, endLine: 2 })).toBe('second');
    expect(extractLines({ text, startLine: 3, endLine: 3 })).toBe('third');
    expect(extractLines({ text, startLine: 4, endLine: 4 })).toBe('fourth');
  });

  it('preserves mixed line endings within the selected range', () => {
    expect(
      extractLines({
        text: 'first\r\nsecond\nthird\rfourth',
        startLine: 1,
        endLine: 3,
      }),
    ).toBe('first\r\nsecond\nthird');
  });

  it('handles empty logical lines with mixed line endings', () => {
    const text = 'first\r\n\nthird\rfourth';

    expect(extractLines({ text, startLine: 2, endLine: 2 })).toBe('');
    expect(extractLines({ text, startLine: 2, endLine: 3 })).toBe('\nthird');
  });

  it('treats endLine past EOF as the last line', () => {
    expect(
      extractLines({
        text: 'a\r\nb\nc\r',
        startLine: 2,
        endLine: 99,
      }),
    ).toBe('b\nc\r');
  });

  it('defaults startLine to 1 when only endLine is set', () => {
    expect(extractLines({ text: 'a\r\nb\nc', endLine: 2 })).toBe('a\r\nb');
  });

  it('defaults endLine to the last line when only startLine is set', () => {
    expect(extractLines({ text: 'a\r\nb\nc', startLine: 2 })).toBe('b\nc');
  });

  it('returns an empty string when startLine is past EOF', () => {
    expect(extractLines({ text: 'a\r\nb\nc', startLine: 4 })).toBe('');
  });

  it('returns an empty string when the range is reversed', () => {
    expect(extractLines({ text: 'a\r\nb\nc', startLine: 3, endLine: 2 })).toBe(
      '',
    );
  });

  it('returns input unchanged when there are no line breaks', () => {
    expect(extractLines({ text: 'one-liner', startLine: 1, endLine: 1 })).toBe(
      'one-liner',
    );
  });
});
