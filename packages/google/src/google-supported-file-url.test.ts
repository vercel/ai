import { isSupportedFileUrl } from './google-supported-file-url';

it('should return true for valid Google generative language file URLs', () => {
  const validUrl = new URL(
    'https://generativelanguage.googleapis.com/v1beta/files/00000000-00000000-00000000-00000000',
  );
  expect(isSupportedFileUrl(validUrl)).toBe(true);

  const simpleValidUrl = new URL(
    'https://generativelanguage.googleapis.com/v1beta/files/test123',
  );
  expect(isSupportedFileUrl(simpleValidUrl)).toBe(true);
});

it('should return false for non-Google generative language file URLs', () => {
  const testCases = [
    new URL('https://example.com'),
    new URL('https://example.com/foo/bar'),
    new URL('https://generativelanguage.googleapis.com'),
    new URL('https://generativelanguage.googleapis.com/v1/other'),
    new URL('http://generativelanguage.googleapis.com/v1beta/files/test'),
    new URL('https://api.googleapis.com/v1beta/files/test'),
  ];

  testCases.forEach(url => {
    expect(isSupportedFileUrl(url)).toBe(false);
  });
});
