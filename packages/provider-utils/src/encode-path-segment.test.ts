import { describe, expect, it } from 'vitest';
import { encodePathSegment } from './encode-path-segment';

describe('encodePathSegment', () => {
  it.each([
    ['job-123', 'job-123'],
    ['abc/../../internal', 'abc%2F..%2F..%2Finternal'],
    ['.', '%252E'],
    ['..', '%252E%252E'],
    ['%2e%2e', '%252e%252e'],
    ['%2F', '%252F'],
    ['a?admin=true#fragment', 'a%3Fadmin%3Dtrue%23fragment'],
    ['a\\..\\internal', 'a%5C..%5Cinternal'],
    ['café', 'caf%C3%A9'],
    ['a b', 'a%20b'],
    ['', ''],
  ])('encodes %j without changing URL structure', (value, expected) => {
    const encoded = encodePathSegment(value);
    expect(encoded).toBe(expected);

    const url = new URL(`https://example.com/v1/jobs/${encoded}/result`);
    expect(url.pathname).toBe(`/v1/jobs/${expected}/result`);
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });

  it('can encode resource paths one segment at a time', () => {
    const path = 'operations/../internal?x#y'
      .split('/')
      .map(encodePathSegment)
      .join('/');

    expect(new URL(`https://example.com/v1/${path}`).pathname).toBe(
      '/v1/operations/%252E%252E/internal%3Fx%23y',
    );
  });
});
