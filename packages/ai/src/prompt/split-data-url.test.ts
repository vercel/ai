import { describe, expect, it } from 'vitest';
import { splitDataUrl } from './split-data-url';

describe('splitDataUrl', () => {
  it('should parse standard base64 data URL', () => {
    expect(splitDataUrl('data:text/plain;base64,aGVsbG8=')).toEqual({
      mediaType: 'text/plain',
      base64Content: 'aGVsbG8=',
    });
  });

  it('should preserve content containing multiple commas', () => {
    expect(
      splitDataUrl('data:text/csv;base64,name,age,city\nalice,30,paris'),
    ).toEqual({
      mediaType: 'text/csv',
      base64Content: 'name,age,city\nalice,30,paris',
    });
  });

  it('should parse SVG data URL with commas in attributes', () => {
    expect(
      splitDataUrl('data:image/svg+xml;utf8,<svg viewBox="0,0,10,10"></svg>'),
    ).toEqual({
      mediaType: 'image/svg+xml',
      base64Content: '<svg viewBox="0,0,10,10"></svg>',
    });
  });

  it('should handle data URL without media type', () => {
    expect(splitDataUrl('data:,hello,world')).toEqual({
      mediaType: undefined,
      base64Content: 'hello,world',
    });
  });

  it('should handle data URL with empty media type and base64 marker', () => {
    expect(splitDataUrl('data:;base64,aGVsbG8=')).toEqual({
      mediaType: undefined,
      base64Content: 'aGVsbG8=',
    });
  });

  it('should return undefined for string without comma', () => {
    expect(splitDataUrl('data:text/plain')).toEqual({
      mediaType: undefined,
      base64Content: undefined,
    });
  });

  it('should return undefined for string without colon', () => {
    expect(splitDataUrl('text/plain,hello')).toEqual({
      mediaType: undefined,
      base64Content: undefined,
    });
  });
});
