import { describe, expect, it } from 'vitest';
import { isRunInterruptedResult } from '../dist/index.js';

describe('isRunInterruptedResult', () => {
  it('narrows interrupted results', () => {
    const value: unknown = {
      status: 'interrupted',
      interruptions: [],
      continuation: 'token',
    };

    expect(isRunInterruptedResult(value)).toBe(true);
    if (isRunInterruptedResult(value)) {
      expect(value.continuation).toBe('token');
    }
  });

  it.each([
    null,
    {},
    { status: 'completed', value: 1 },
    { status: 'interrupted', interruptions: [] },
    { status: 'interrupted', interruptions: {}, continuation: 'token' },
  ])('rejects non-interrupted shape %#', value => {
    expect(isRunInterruptedResult(value)).toBe(false);
  });
});
