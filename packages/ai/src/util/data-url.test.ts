import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('decodes a base64 text data URL', async () => {
  const { getTextFromDataUrl } = await import('./data-url');

  expect(getTextFromDataUrl('data:text/plain;base64,aGk=')).toBe('hi');
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
