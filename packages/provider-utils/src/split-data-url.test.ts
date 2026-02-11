import { describe, it, expect } from 'vitest';
import { splitDataUrl } from './split-data-url';

describe('splitDataUrl()', () => {
  it('should parse a valid data URL with image/png media type', () => {
    const result = splitDataUrl('data:image/png;base64,iVBORw0KGgo=');
    expect(result).toEqual({
      mediaType: 'image/png',
      base64Content: 'iVBORw0KGgo=',
    });
  });

  it('should parse a valid data URL with image/jpeg media type', () => {
    const result = splitDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
    expect(result).toEqual({
      mediaType: 'image/jpeg',
      base64Content: '/9j/4AAQSkZJRg==',
    });
  });

  it('should parse a valid data URL with image/webp media type', () => {
    const result = splitDataUrl('data:image/webp;base64,UklGRh4AAABXRUJQVlA=');
    expect(result).toEqual({
      mediaType: 'image/webp',
      base64Content: 'UklGRh4AAABXRUJQVlA=',
    });
  });

  it('should parse a valid data URL with image/gif media type', () => {
    const result = splitDataUrl('data:image/gif;base64,R0lGODlhAQABAIAAAP==');
    expect(result).toEqual({
      mediaType: 'image/gif',
      base64Content: 'R0lGODlhAQABAIAAAP==',
    });
  });

  it('should parse a valid data URL with application/pdf media type', () => {
    const result = splitDataUrl('data:application/pdf;base64,JVBERi0xLjQ=');
    expect(result).toEqual({
      mediaType: 'application/pdf',
      base64Content: 'JVBERi0xLjQ=',
    });
  });

  it('should parse a valid data URL with text/plain media type', () => {
    const result = splitDataUrl('data:text/plain;base64,SGVsbG8gV29ybGQ=');
    expect(result).toEqual({
      mediaType: 'text/plain',
      base64Content: 'SGVsbG8gV29ybGQ=',
    });
  });

  it('should handle empty base64 content', () => {
    const result = splitDataUrl('data:image/png;base64,');
    expect(result).toEqual({
      mediaType: undefined,
      base64Content: undefined,
    });
  });

  it('should handle data URL with charset parameter', () => {
    const result = splitDataUrl('data:text/html;charset=utf-8;base64,PGh0bWw+');
    expect(result).toEqual({
      mediaType: 'text/html',
      base64Content: 'PGh0bWw+',
    });
  });

  it('should return undefined values for invalid data URL without comma', () => {
    const result = splitDataUrl('data:image/png;base64');
    expect(result).toEqual({
      mediaType: undefined,
      base64Content: undefined,
    });
  });

  it('should return undefined mediaType for plain string without data: prefix', () => {
    const result = splitDataUrl('not-a-data-url');
    expect(result).toEqual({
      mediaType: undefined,
      base64Content: undefined,
    });
  });

  it('should return undefined values for empty string', () => {
    const result = splitDataUrl('');
    expect(result).toEqual({
      mediaType: undefined,
      base64Content: undefined,
    });
  });

  it('should handle data URL with commas in base64 content', () => {
    // base64 content doesn't contain commas, but if somehow there's extra data
    const result = splitDataUrl('data:image/png;base64,abc,def');
    expect(result).toEqual({
      mediaType: 'image/png',
      base64Content: 'abc,def',
    });
  });

  it('should handle https URL (not a data URL)', () => {
    const result = splitDataUrl('https://example.com/image.png');
    // Non-data URLs return undefined values as expected
    expect(result).toEqual({
      mediaType: undefined,
      base64Content: undefined,
    });
  });
});
