import { describe, expect, it } from 'vitest';
import { normalizeBatchRequestCounts } from './normalize-batch-request-counts';

describe('normalizeBatchRequestCounts', () => {
  it('returns complete, consistent counts', () => {
    expect(
      normalizeBatchRequestCounts({
        total: 5,
        pending: 2,
        completed: 2,
        failed: 1,
      }),
    ).toEqual({ total: 5, pending: 2, completed: 2, failed: 1 });
  });

  it.each([
    { total: undefined, pending: 0, completed: 0, failed: 0 },
    { total: 1, pending: -1, completed: 1, failed: 1 },
    { total: 1, pending: 0.5, completed: 0.5, failed: 0 },
    { total: Number.MAX_SAFE_INTEGER + 1, pending: 0, completed: 0, failed: 0 },
    { total: 2, pending: 0, completed: 1, failed: 0 },
  ])('returns undefined for invalid counts %#', counts => {
    expect(normalizeBatchRequestCounts(counts)).toBeUndefined();
  });
});
