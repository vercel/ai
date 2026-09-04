import { getTextFromDataUrl } from './data-url';
import { it, expect } from 'vitest';

it('should decode a text data URL in Node.js (#20348)', () => {
  expect(getTextFromDataUrl('data:text/plain;base64,aGk=')).toBe('hi');
});

it('should throw on invalid data URL format', () => {
  expect(() => getTextFromDataUrl('not-a-data-url')).toThrow(
    'Invalid data URL format',
  );
});
