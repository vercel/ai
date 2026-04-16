import { describe, expect, it } from 'vitest';
import { asArray } from './as-array';

describe('asArray', () => {
  it('should return an empty array for undefined', () => {
    expect(asArray(undefined)).toEqual([]);
  });

  it('should wrap a single value in an array', () => {
    expect(asArray('value')).toEqual(['value']);
  });

  it('should return an array value unchanged', () => {
    const value = ['a', 'b'];

    expect(asArray(value)).toBe(value);
  });
});
