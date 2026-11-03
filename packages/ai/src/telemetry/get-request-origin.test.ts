import { expect, it } from 'vitest';
import { sanitizeRequestMetadata } from './get-request-origin';

it('preserves metadata and its input while removing sensitive URL components', () => {
  const request = Object.freeze({
    body: { model: 'test' },
    url: 'https://user:password@example.com:8443/private?key=secret#fragment',
  });
  expect(sanitizeRequestMetadata(request)).toEqual({
    body: request.body,
    url: 'https://example.com:8443',
  });
  expect(request.url).toContain('password');
});

it.each([
  '',
  'not a URL',
  '/relative',
  'file:///etc/passwd',
  'data:text/plain,secret',
])('omits unavailable HTTP origins (%s)', url => {
  expect(sanitizeRequestMetadata({ body: 'keep', url })).toEqual({
    body: 'keep',
  });
});

it('preserves requests without endpoint metadata', () => {
  const request = { body: 'keep' };
  expect(sanitizeRequestMetadata(undefined)).toBeUndefined();
  expect(sanitizeRequestMetadata(request)).toBe(request);
});
