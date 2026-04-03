import { describe, expectTypeOf, it } from 'vitest';
import type { UnionToIntersection } from './union-to-intersection';

describe('UnionToIntersection', () => {
  it('returns never when given no input', () => {
    type Result = UnionToIntersection<never>;

    expectTypeOf<Result>().toEqualTypeOf<unknown>();
  });

  it('returns the same type for a single input', () => {
    type Result = UnionToIntersection<{ city: string }>;

    expectTypeOf<Result>().toEqualTypeOf<{
      city: string;
    }>();
  });

  it('converts a union of object types into an intersection', () => {
    type Result = UnionToIntersection<
      { city: string } | { countryCode: string }
    >;

    expectTypeOf<Result>().toEqualTypeOf<
      {
        city: string;
      } & {
        countryCode: string;
      }
    >();
  });
});
