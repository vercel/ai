import { describe, expect, it } from 'vitest';
import { resolveCursorEnv } from './cursor-auth';

describe('resolveCursorEnv', () => {
  it('uses explicit auth.apiKey', () => {
    expect(
      resolveCursorEnv(
        { apiKey: 'explicit-key' },
        { CURSOR_API_KEY: 'env-key' },
      ),
    ).toEqual({ CURSOR_API_KEY: 'explicit-key' });
  });

  it('falls back to CURSOR_API_KEY from env', () => {
    expect(resolveCursorEnv(undefined, { CURSOR_API_KEY: 'env-key' })).toEqual({
      CURSOR_API_KEY: 'env-key',
    });
  });

  it('throws when no key is available', () => {
    expect(() => resolveCursorEnv(undefined, {})).toThrow(/CURSOR_API_KEY/);
  });
});
