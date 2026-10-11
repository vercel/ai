import { describe, expect, it } from 'vitest';
import { InvalidToolInputError } from './invalid-tool-input-error';

describe('InvalidToolInputError', () => {
  it('defaults truncated to false for backwards-compatible construction', () => {
    const error = new InvalidToolInputError({
      toolName: 'weather',
      toolInput: 'invalid',
      cause: new Error('invalid input'),
    });

    expect(error.truncated).toBe(false);
  });

  it('exposes explicit truncation metadata', () => {
    const error = new InvalidToolInputError({
      toolName: 'weather',
      toolInput: '{"location":"San',
      cause: new Error('invalid input'),
      truncated: true,
    });

    expect(error.truncated).toBe(true);
  });
});
