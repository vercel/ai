import { InvalidArgumentError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { withoutTrailingSlash } from './without-trailing-slash';

describe('withoutTrailingSlash', () => {
  it('removes a trailing slash', () => {
    expect(withoutTrailingSlash('https://example.com/')).toBe(
      'https://example.com',
    );
  });

  it('returns undefined when the URL is undefined', () => {
    expect(withoutTrailingSlash(undefined)).toBeUndefined();
  });

  it.each(['', '   '])(
    'throws an InvalidArgumentError for an empty baseURL',
    baseURL => {
      expect(() => withoutTrailingSlash(baseURL)).toThrow(
        expect.objectContaining({
          name: 'AI_InvalidArgumentError',
          argument: 'baseURL',
          message: 'baseURL must be a non-empty string.',
        }),
      );

      try {
        withoutTrailingSlash(baseURL);
      } catch (error) {
        expect(InvalidArgumentError.isInstance(error)).toBe(true);
      }
    },
  );
});
