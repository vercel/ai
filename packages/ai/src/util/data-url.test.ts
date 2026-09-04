import { expect, it } from 'vitest';
import { getTextFromDataUrl } from './data-url';

it('decodes a base64 text data URL', () => {
  expect(getTextFromDataUrl('data:text/plain;base64,aGk=')).toBe('hi');
});
