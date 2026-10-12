import { describe, expect, it } from 'vitest';
import transformer from '../codemods/v5/replace-content-with-parts';
import { applyTransform } from './test-utils';

describe('replace-content-with-parts', () => {
  it.each([
    'generateText',
    'streamText',
    'generateObject',
    'streamObject',
    'streamUI',
    'render',
  ])('preserves string ModelMessage content passed to %s', method => {
    const input = `${method}({
  model,
  messages: [{ role: 'user', content: 'Hello' }],
});`;

    expect(applyTransform(transformer, input)).toBe(input);
  });

  it('preserves multipart ModelMessage content', () => {
    const input = `generateText({
  model,
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Describe this image' },
      { type: 'image', image: imageData },
    ],
  }],
});`;

    expect(applyTransform(transformer, input)).toBe(input);
  });
});
