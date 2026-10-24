import { describe, expect, it } from 'vitest';
import { convertToLanguageModelV4FilePart } from './file-part-data';

describe('convertToLanguageModelV4FilePart', () => {
  describe('legacy bare shapes', () => {
    it('wraps a Uint8Array as { type: "data", data }', () => {
      const bytes = new Uint8Array([1, 2, 3]);
      expect(convertToLanguageModelV4FilePart(bytes)).toEqual({
        data: { type: 'data', data: bytes },
        mediaType: undefined,
      });
    });

    it('wraps an ArrayBuffer (converted to Uint8Array) as { type: "data", data }', () => {
      const buffer = new Uint8Array([4, 5, 6]).buffer;
      const result = convertToLanguageModelV4FilePart(buffer);
      expect(result.data.type).toBe('data');
      const inner = (result.data as { type: 'data'; data: Uint8Array }).data;
      expect(inner).toBeInstanceOf(Uint8Array);
      expect(Array.from(inner)).toEqual([4, 5, 6]);
      expect(result.mediaType).toBeUndefined();
    });

    it('wraps a base64 string that is not a URL as { type: "data", data }', () => {
      const base64 = 'aGVsbG8=';
      expect(convertToLanguageModelV4FilePart(base64)).toEqual({
        data: { type: 'data', data: base64 },
        mediaType: undefined,
      });
    });

    it('converts a URL string into { type: "url", url }', () => {
      const result = convertToLanguageModelV4FilePart(
        'https://example.com/file.pdf',
      );
      expect(result.data.type).toBe('url');
      const url = (result.data as { type: 'url'; url: URL }).url;
      expect(url).toBeInstanceOf(URL);
      expect(url.toString()).toBe('https://example.com/file.pdf');
      expect(result.mediaType).toBeUndefined();
    });

    it('preserves the original string when URL parsing changes a non-HTTP URI', () => {
      const result = convertToLanguageModelV4FilePart(
        'gs://my-bucket/folder/My File.pdf',
      );

      expect(result).toEqual({
        data: {
          type: 'url',
          url: new URL('gs://my-bucket/folder/My File.pdf'),
          originalUrl: 'gs://my-bucket/folder/My File.pdf',
        },
        mediaType: undefined,
      });
    });

    it('passes through a URL instance as { type: "url", url }', () => {
      const url = new URL('https://example.com/file.pdf');
      expect(convertToLanguageModelV4FilePart(url)).toEqual({
        data: { type: 'url', url },
        mediaType: undefined,
      });
    });

    it('extracts base64 and media type from a data URL into { type: "data", data }', () => {
      const result = convertToLanguageModelV4FilePart(
        'data:text/plain;base64,aGVsbG8=',
      );
      expect(result).toEqual({
        data: { type: 'data', data: 'aGVsbG8=' },
        mediaType: 'text/plain',
      });
    });

    it('wraps a provider reference as { type: "reference", reference }', () => {
      const reference = { openai: 'file-123', anthropic: 'file-abc' };
      expect(convertToLanguageModelV4FilePart(reference)).toEqual({
        data: { type: 'reference', reference },
        mediaType: undefined,
      });
    });
  });

  describe('tagged shapes', () => {
    it('unwraps { type: "data", data: Uint8Array }', () => {
      const bytes = new Uint8Array([1, 2, 3]);
      expect(
        convertToLanguageModelV4FilePart({ type: 'data', data: bytes }),
      ).toEqual({ data: { type: 'data', data: bytes }, mediaType: undefined });
    });

    it('unwraps { type: "data", data: ArrayBuffer }', () => {
      const buffer = new Uint8Array([4, 5, 6]).buffer;
      const result = convertToLanguageModelV4FilePart({
        type: 'data',
        data: buffer,
      });
      expect(result.data.type).toBe('data');
      const inner = (result.data as { type: 'data'; data: Uint8Array }).data;
      expect(inner).toBeInstanceOf(Uint8Array);
      expect(Array.from(inner)).toEqual([4, 5, 6]);
      expect(result.mediaType).toBeUndefined();
    });

    it('unwraps { type: "data", data: base64 string } that is not a URL', () => {
      const base64 = 'aGVsbG8=';
      expect(
        convertToLanguageModelV4FilePart({ type: 'data', data: base64 }),
      ).toEqual({ data: { type: 'data', data: base64 }, mediaType: undefined });
    });

    it('rejects { type: "data", data: data URL string } — data URLs are not inline data', () => {
      expect(() =>
        convertToLanguageModelV4FilePart({
          type: 'data',
          data: 'data:text/plain;base64,aGVsbG8=',
        }),
      ).toThrow(/Data URLs are not valid inline data/);
    });

    it('unwraps { type: "url", url } into { type: "url", url }', () => {
      const url = new URL('https://example.com/file.pdf');
      expect(convertToLanguageModelV4FilePart({ type: 'url', url })).toEqual({
        data: { type: 'url', url },
        mediaType: undefined,
      });
    });

    it('preserves the original opaque URI in a tagged URL', () => {
      const originalUrl = 'gs://my-bucket/folder/My File.pdf';
      const data = {
        type: 'url' as const,
        url: new URL(originalUrl),
        originalUrl,
      };

      expect(convertToLanguageModelV4FilePart(data)).toEqual({
        data,
        mediaType: undefined,
      });
    });

    it('unwraps { type: "url", url } with data URL into base64 + mediaType', () => {
      const url = new URL('data:text/plain;base64,aGVsbG8=');
      const result = convertToLanguageModelV4FilePart({
        type: 'url',
        url,
        originalUrl: url.toString(),
      });
      expect(result).toEqual({
        data: { type: 'data', data: 'aGVsbG8=' },
        mediaType: 'text/plain',
      });
    });

    it('passes through { type: "reference", reference }', () => {
      const reference = { openai: 'file-123', anthropic: 'file-abc' };
      expect(
        convertToLanguageModelV4FilePart({
          type: 'reference',
          reference,
        }),
      ).toEqual({
        data: { type: 'reference', reference },
        mediaType: undefined,
      });
    });

    it('passes through { type: "text", text }', () => {
      expect(
        convertToLanguageModelV4FilePart({ type: 'text', text: 'hello' }),
      ).toEqual({
        data: { type: 'text', text: 'hello' },
        mediaType: undefined,
      });
    });
  });

  describe('non-base64 data URLs (RFC 2397)', () => {
    it('percent-decodes a plain text data URL', () => {
      const result = convertToLanguageModelV4FilePart(
        'data:text/plain,Hello%2C%20world!',
      );

      expect(result.data.type).toBe('data');
      const inner = (result.data as { type: 'data'; data: Uint8Array }).data;
      expect(inner).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(inner)).toBe('Hello, world!');
      expect(result.mediaType).toBe('text/plain');
    });

    it('keeps content that contains commas (CSV)', () => {
      const result = convertToLanguageModelV4FilePart(
        'data:text/csv,a,b,c%0A1,2,3',
      );

      expect(result.data.type).toBe('data');
      const inner = (result.data as { type: 'data'; data: Uint8Array }).data;
      expect(new TextDecoder().decode(inner)).toBe('a,b,c\n1,2,3');
      expect(result.mediaType).toBe('text/csv');
    });

    it('percent-decodes an SVG data URL', () => {
      const result = convertToLanguageModelV4FilePart(
        'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E',
      );

      expect(result.data.type).toBe('data');
      const inner = (result.data as { type: 'data'; data: Uint8Array }).data;
      expect(new TextDecoder().decode(inner)).toBe(
        '<svg xmlns="http://www.w3.org/2000/svg"/>',
      );
      expect(result.mediaType).toBe('image/svg+xml');
    });

    it('sends the actual bytes when non-base64 content looks like base64', () => {
      const result = convertToLanguageModelV4FilePart('data:text/plain,abcd');

      expect(result.data.type).toBe('data');
      const inner = (result.data as { type: 'data'; data: Uint8Array }).data;
      expect(new TextDecoder().decode(inner)).toBe('abcd');
    });

    it('percent-decodes a non-base64 data URL passed as a URL instance', () => {
      const result = convertToLanguageModelV4FilePart(
        new URL('data:text/plain,Hello%2C%20world!'),
      );

      expect(result.data.type).toBe('data');
      const inner = (result.data as { type: 'data'; data: Uint8Array }).data;
      expect(new TextDecoder().decode(inner)).toBe('Hello, world!');
      expect(result.mediaType).toBe('text/plain');
    });

    it('throws InvalidDataContentError for invalid percent-encoding', () => {
      expect(() =>
        convertToLanguageModelV4FilePart(new URL('data:text/plain,%zz')),
      ).toThrow(/percent-encoding/);
    });
  });

  describe('legacy and tagged produce the same output', () => {
    it('{ type: "data", data: bytes } equals bare bytes', () => {
      const bytes = new Uint8Array([7, 8, 9]);
      expect(
        convertToLanguageModelV4FilePart({ type: 'data', data: bytes }),
      ).toEqual(convertToLanguageModelV4FilePart(bytes));
    });

    it('{ type: "url", url } equals bare URL', () => {
      const url = new URL('https://example.com/file.pdf');
      expect(convertToLanguageModelV4FilePart({ type: 'url', url })).toEqual(
        convertToLanguageModelV4FilePart(url),
      );
    });

    it('{ type: "reference", reference } equals bare reference', () => {
      const reference = { openai: 'file-123' };
      expect(
        convertToLanguageModelV4FilePart({ type: 'reference', reference }),
      ).toEqual(convertToLanguageModelV4FilePart(reference));
    });
  });
});
