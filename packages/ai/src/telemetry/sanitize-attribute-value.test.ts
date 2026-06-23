import type { AttributeValue } from '@opentelemetry/api';
import { describe, expect, it } from 'vitest';
import { sanitizeAttributeValue } from './sanitize-attribute-value';

describe('sanitizeAttributeValue', () => {
  it('returns scalar values unchanged', () => {
    expect(sanitizeAttributeValue('text')).toBe('text');
    expect(sanitizeAttributeValue(42)).toBe(42);
    expect(sanitizeAttributeValue(true)).toBe(true);
  });

  it('returns homogeneous primitive arrays unchanged', () => {
    expect(sanitizeAttributeValue(['a', 'b'])).toEqual(['a', 'b']);
    expect(sanitizeAttributeValue([1, 2])).toEqual([1, 2]);
    expect(sanitizeAttributeValue([true, false])).toEqual([true, false]);
  });

  it('drops invalid entries from an otherwise homogeneous array', () => {
    expect(
      sanitizeAttributeValue([
        'a',
        undefined,
        {},
        'b',
      ] as unknown as AttributeValue),
    ).toEqual(['a', 'b']);
  });

  it('drops arrays with mixed primitive types', () => {
    expect(
      sanitizeAttributeValue(['a', 1] as unknown as AttributeValue),
    ).toBeUndefined();
  });

  it('drops arrays without any primitive entries', () => {
    expect(
      sanitizeAttributeValue([undefined, {}] as unknown as AttributeValue),
    ).toBeUndefined();
  });

  it('drops empty arrays', () => {
    expect(sanitizeAttributeValue([])).toBeUndefined();
  });

  it('drops a finish-reasons array containing only undefined', () => {
    expect(
      sanitizeAttributeValue([undefined] as unknown as AttributeValue),
    ).toBeUndefined();
  });
});
