import { describe, expect, it } from 'vitest';
import { stringifyJSON } from './stringify-json';

describe('stringifyJSON', () => {
  it('preserves repeated references while replacing ancestor cycles', () => {
    const shared = { value: 42 };
    const input: Record<string, unknown> = { first: shared, second: shared };
    input.self = input;
    expect(stringifyJSON(input)).toBe(
      '{"first":{"value":42},"second":{"value":42},"self":"[Circular]"}',
    );
  });

  it('preserves repeated array items and nested cycles', () => {
    const shared: Record<string, unknown> = { count: 9007199254740993n };
    shared.self = shared;
    expect(stringifyJSON([shared, shared])).toBe(
      '[{"count":"9007199254740993","self":"[Circular]"},{"count":"9007199254740993","self":"[Circular]"}]',
    );
  });

  it('preserves toJSON semantics and serializes BigInt returned by toJSON', () => {
    expect(
      stringifyJSON({
        date: new Date('2026-11-02T00:00:00Z'),
        count: { toJSON: () => 42n },
        nested: { toJSON: () => ({ count: 43n }) },
      }),
    ).toBe(
      '{"date":"2026-11-02T00:00:00.000Z","count":"42","nested":{"count":"43"}}',
    );
  });

  it.each([null, true, 42, 'hello', [1, 2], { value: 1, absent: undefined }])(
    'preserves normal JSON behavior for %j',
    value => {
      expect(stringifyJSON(value)).toBe(JSON.stringify(value));
    },
  );
});
