import { describe, expect, test } from 'vitest';
import { isPlainJSONValue } from './utils';

describe('isPlainJSONValue', () => {
  test('accepts plain JSON values and undefined object properties', () => {
    expect(isPlainJSONValue({ value: null })).toBe(true);
    expect(isPlainJSONValue({ value: 'text' })).toBe(true);
    expect(isPlainJSONValue({ value: 1 })).toBe(true);
    expect(isPlainJSONValue({ value: false })).toBe(true);
    expect(
      isPlainJSONValue({
        value: { list: [1, { nested: 'value' }], skipped: undefined },
      }),
    ).toBe(true);
    expect(isPlainJSONValue({ value: Object.create(null) })).toBe(true);
  });

  test('accepts shared references that are not cycles', () => {
    const shared = { value: 1 };
    expect(isPlainJSONValue({ value: [shared, shared] })).toBe(true);
  });

  test('rejects values that are not plain JSON', () => {
    expect(isPlainJSONValue({ value: undefined })).toBe(false);
    expect(isPlainJSONValue({ value: new Date() })).toBe(false);
    expect(isPlainJSONValue({ value: new (class Value {})() })).toBe(false);
    expect(isPlainJSONValue({ value: [1n] })).toBe(false);
    const cyclic: Record<string, unknown> = Object.create(null);
    cyclic.self = cyclic;
    expect(isPlainJSONValue({ value: cyclic })).toBe(false);
  });
});
