import { describe, expect, it } from 'vitest';
import { combineHeaders } from './combine-headers';

function headersInit(
  headers: Record<string, string | undefined>,
): [string, string][] {
  return Object.entries(headers).filter(
    (entry): entry is [string, string] => entry[1] != null,
  );
}

describe('combineHeaders', () => {
  it('overrides header names case-insensitively', () => {
    const headers = combineHeaders(
      { Authorization: 'Bearer config-token' },
      { authorization: 'Bearer request-token' },
    );

    expect(new Headers(headersInit(headers)).get('authorization')).toBe(
      'Bearer request-token',
    );
    expect(headers).toEqual({
      authorization: 'Bearer request-token',
    });
  });

  it('preserves header casing when no override is needed', () => {
    expect(combineHeaders({ 'X-Trace': 'trace-id' })).toEqual({
      'X-Trace': 'trace-id',
    });
  });

  it('keeps later undefined values as deletion markers', () => {
    expect(
      combineHeaders(
        {
          Authorization: 'Bearer config-token',
          'X-Trace': 'trace-id',
        },
        {
          authorization: undefined,
          'X-Other': 'value',
        },
      ),
    ).toEqual({
      authorization: undefined,
      'X-Trace': 'trace-id',
      'X-Other': 'value',
    });
  });
});
