import { describe, it, expect } from 'vitest';

import { normalizeHeaders } from './normalize-headers';

describe('normalizeHeaders', () => {
  it('returns empty object for undefined', () => {
    expect(normalizeHeaders(undefined)).toEqual({});
  });

  it('converts Headers instance to record', () => {
    const headers = new Headers({
      Authorization: 'Bearer token',
      'X-Feature': 'beta',
    });

    expect(normalizeHeaders(headers)).toEqual({
      authorization: 'Bearer token',
      'x-feature': 'beta',
    });
  });

  it('converts tuple array', () => {
    const headers: HeadersInit = [
      ['Authorization', 'Bearer token'],
      ['X-Feature', 'beta'],
    ];

    expect(normalizeHeaders(headers)).toEqual({
      Authorization: 'Bearer token',
      'X-Feature': 'beta',
    });
  });

  it('converts plain record and filters nullish values', () => {
    expect(
      normalizeHeaders({
        Authorization: 'Bearer token',
        'X-Feature': undefined,
        'Content-Type': 'application/json',
      }),
    ).toEqual({
      Authorization: 'Bearer token',
      'Content-Type': 'application/json',
    });
  });
});
