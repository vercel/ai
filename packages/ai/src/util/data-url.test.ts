import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvalidArgumentError } from '../error/invalid-argument-error';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('getTextFromDataUrl', () => {
  it('should throw InvalidArgumentError for a malformed data URL', async () => {
    const dataUrl = 'not-a-data-url';
    const { getTextFromDataUrl } = await import('./data-url');
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

  it('should throw InvalidArgumentError when the data URL cannot be decoded', async () => {
    const dataUrl = 'data:text/plain;base64,invalid-base64';
    vi.stubGlobal('atob', () => {
      throw new Error('decode failed');
    });
    const { getTextFromDataUrl } = await import('./data-url');
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

  it('decodes a base64 text data URL', async () => {
    const { getTextFromDataUrl } = await import('./data-url');

    expect(getTextFromDataUrl('data:text/plain;base64,aGk=')).toBe('hi');
  });

  it.each([
    ['two-byte characters', 'Y2Fmw6k=', 'café'],
    ['three-byte characters', '5pel5pys6Kqe', '日本語'],
    ['four-byte characters', 'ZW1vamkg8J+Zgg==', 'emoji 🙂'],
    ['combining marks', 'Q2FmZcyB', 'Cafe\u0301'],
    [
      'multiline text',
      'Zmlyc3QgbGluZQpjYWbDqQrml6XmnKzoqp4g8J+Zgg==',
      'first line\ncafé\n日本語 🙂',
    ],
  ])('decodes UTF-8 %s', async (_, base64Content, expected) => {
    const { getTextFromDataUrl } = await import('./data-url');

    expect(
      getTextFromDataUrl(
        `data:text/plain;charset=utf-8;base64,${base64Content}`,
      ),
    ).toBe(expected);
  });

  it('decodes text using a non-UTF-8 declared charset', async () => {
    const { getTextFromDataUrl } = await import('./data-url');

    expect(
      getTextFromDataUrl('data:text/plain;charset=iso-8859-1;base64,Y2Fm6Q=='),
    ).toBe('café');
  });

  it('calls atob without a global receiver', async () => {
    const originalAtob = globalThis.atob;

    vi.stubGlobal('atob', function (this: unknown, input: string) {
      if (this !== undefined) {
        throw new TypeError(
          'Illegal invocation: function called with incorrect this reference',
        );
      }

      return originalAtob(input);
    });

    const { getTextFromDataUrl } = await import('./data-url');

    expect(getTextFromDataUrl('data:text/plain;base64,aGk=')).toBe('hi');
  });
});
