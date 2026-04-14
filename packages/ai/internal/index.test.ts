import { InvalidArgumentError } from '../src/error/invalid-argument-error';
import { prepareCallSettings, prepareModelCallOptions } from './index';
import { describe, it, expect } from 'vitest';

describe('prepareCallSettings (deprecated alias)', () => {
  it('should behave identically to prepareModelCallOptions', () => {
    const input = { maxOutputTokens: 100, temperature: 0.7 };
    expect(prepareCallSettings(input)).toEqual(prepareModelCallOptions(input));
  });

  it('should throw the same errors as prepareModelCallOptions', () => {
    expect(() => prepareCallSettings({ maxOutputTokens: 10.5 })).toThrow(
      new InvalidArgumentError({
        parameter: 'maxOutputTokens',
        value: 10.5,
        message: 'maxOutputTokens must be an integer',
      }),
    );
  });
});
