import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
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
    getTextFromDataUrl(`data:text/plain;charset=utf-8;base64,${base64Content}`),
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
