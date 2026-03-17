import { isSupportedFileUrl } from './google-supported-file-url';
import { it, expect } from 'vitest';

it('should return true for absolute URLs across supported schemes', () => {
  const validUrls = [
    new URL(
      'https://generativelanguage.googleapis.com/v1beta/files/00000000-00000000-00000000-00000000',
    ),
    new URL('https://example.com/signed.pdf?X-Amz-Signature=test'),
    new URL('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    new URL('gs://bucket/path/to/file.pdf'),
  ];

  validUrls.forEach(url => {
    expect(isSupportedFileUrl(url)).toBe(true);
  });
});

it('should return true for any absolute URL scheme', () => {
  expect(isSupportedFileUrl(new URL('mailto:test@example.com'))).toBe(true);
});
