import { it, expect } from 'vitest';
import { isSupportedFileUrl } from './google-vertex-supported-file-url';

// Supported protocols
it('should support gs:// URLs', () => {
  expect(isSupportedFileUrl(new URL('gs://my-bucket/path/to/file.jpg'))).toBe(
    true,
  );
});

it('should support http URLs', () => {
  expect(isSupportedFileUrl(new URL('http://example.com/image.jpg'))).toBe(
    true,
  );
});

it('should support https URLs', () => {
  expect(isSupportedFileUrl(new URL('https://example.com/image.jpg'))).toBe(
    true,
  );
});

// Case insensitivity
it('should be case insensitive', () => {
  expect(isSupportedFileUrl(new URL('GS://MY-BUCKET/FILE.jpg'))).toBe(true);
  expect(isSupportedFileUrl(new URL('HTTPS://EXAMPLE.COM/FILE.jpg'))).toBe(
    true,
  );
});

// Invalid URLs
it('should reject unsupported protocols', () => {
  expect(isSupportedFileUrl(new URL('ftp://example.com/file.jpg'))).toBe(false);
  expect(isSupportedFileUrl(new URL('file:///path/to/file.jpg'))).toBe(false);
});

it('should reject invalid or malformed URLs', () => {
  expect(() => isSupportedFileUrl(new URL(''))).toThrow();
  expect(() => isSupportedFileUrl(new URL('not-a-url'))).toThrow();
});
