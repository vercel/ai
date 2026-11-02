import { describe, expect, it } from 'vitest';
import { stringifyWithBigIntAndCycles } from './stringify-with-bigint-and-cycles';

describe('stringifyWithBigIntAndCycles', () => {
  it('preserves repeated references while replacing ancestor cycles', () => {
    const shared = { value: 42 };
    const input: Record<string, unknown> = { first: shared, second: shared };
    input.self = input;
    expect(stringifyWithBigIntAndCycles(input)).toBe(
      '{"first":{"value":42},"second":{"value":42},"self":"[Circular]"}',
    );
  });

  it('preserves repeated array items and nested cycles', () => {
    const shared: Record<string, unknown> = { count: BigInt('9007199254740993') };
    shared.self = shared;
    expect(stringifyWithBigIntAndCycles([shared, shared])).toBe(
      '[{"count":"9007199254740993","self":"[Circular]"},{"count":"9007199254740993","self":"[Circular]"}]',
    );
  });

  it('preserves toJSON semantics and serializes BigInt returned by toJSON', () => {
    expect(
      stringifyWithBigIntAndCycles({
        date: new Date('2026-11-02T00:00:00Z'),
        count: { toJSON: () => BigInt('42') },
        nested: { toJSON: () => ({ count: BigInt('43') }) },
      }),
    ).toBe(
      '{"date":"2026-11-02T00:00:00.000Z","count":"42","nested":{"count":"43"}}',
    );
  });

  it.each([null, true, 42, 'hello', [1, 2], { value: 1, absent: undefined }])(
    'preserves normal JSON behavior for %j',
    value => {
      expect(stringifyWithBigIntAndCycles(value)).toBe(JSON.stringify(value));
    },
  );
});

it('reports throwing toJSON methods instead of hiding serialization errors', () => {
  expect(() =>
    stringifyWithBigIntAndCycles({
      toJSON() {
        throw new Error('serialization failed');
      },
    }),
  ).toThrow('serialization failed');
});
