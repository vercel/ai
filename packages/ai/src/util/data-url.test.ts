import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { getTextFromDataUrl } from './data-url';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getTextFromDataUrl', () => {
  it('should throw InvalidArgumentError for a malformed data URL', () => {
    const dataUrl = 'not-a-data-url';
    let error: unknown;

    try {
      getTextFromDataUrl(dataUrl);
    } catch (caughtError) {
      error = caughtError;
    }

    expect(InvalidArgumentError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      parameter: 'dataUrl',
      value: dataUrl,
      message:
        'Invalid argument for parameter dataUrl: Invalid data URL format',
    });
  });

  it('should throw InvalidArgumentError when the data URL cannot be decoded', () => {
    const dataUrl = 'data:text/plain;base64,invalid-base64';
    vi.stubGlobal('window', {
      atob: () => {
        throw new Error('decode failed');
      },
    });
    let error: unknown;

    try {
      getTextFromDataUrl(dataUrl);
    } catch (caughtError) {
      error = caughtError;
    }

    expect(InvalidArgumentError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      parameter: 'dataUrl',
      value: dataUrl,
      message:
        'Invalid argument for parameter dataUrl: Error decoding data URL',
    });
  });
});
