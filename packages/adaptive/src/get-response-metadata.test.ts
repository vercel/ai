import { describe, it, expect } from 'vitest';
import { getResponseMetadata } from './get-response-metadata';

describe('getResponseMetadata', () => {
  it('should map id, model, and created fields', () => {
    const result = getResponseMetadata({ id: 'abc', model: 'm', created: 123 });
    expect(result).toEqual({
      id: 'abc',
      modelId: 'm',
      timestamp: new Date(123 * 1000),
    });
  });

  it('should handle undefined/null fields', () => {
    expect(getResponseMetadata({})).toEqual({
      id: undefined,
      modelId: undefined,
      timestamp: undefined,
    });
    expect(
      getResponseMetadata({ id: null, model: null, created: null }),
    ).toEqual({ id: undefined, modelId: undefined, timestamp: undefined });
  });
});
