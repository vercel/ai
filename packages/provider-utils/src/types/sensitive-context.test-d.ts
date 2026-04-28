import { describe, expectTypeOf, it } from 'vitest';
import type { SensitiveContext } from './sensitive-context';

type TestContext = {
  userId: string;
  requestId: string;
  metadata: {
    secret: string;
  };
};

describe('SensitiveContext', () => {
  it('allows optional booleans for top-level context properties', () => {
    const sensitiveContext = {
      userId: true,
      requestId: false,
    } satisfies SensitiveContext<TestContext>;

    expectTypeOf<typeof sensitiveContext>().toEqualTypeOf<{
      userId: true;
      requestId: false;
    }>();
  });

  it('allows undefined', () => {
    expectTypeOf<
      Extract<SensitiveContext<TestContext>, undefined>
    >().toEqualTypeOf<undefined>();
  });

  it('does not allow unknown context properties', () => {
    const sensitiveContext = {
      // @ts-expect-error sensitive context only supports context properties
      unknown: true,
    } satisfies SensitiveContext<TestContext>;

    expectTypeOf<typeof sensitiveContext>().toEqualTypeOf<{
      unknown: boolean;
    }>();
  });

  it('does not allow nested sensitivity definitions', () => {
    const sensitiveContext = {
      // @ts-expect-error sensitive context only supports top-level booleans
      metadata: {
        secret: true,
      },
    } satisfies SensitiveContext<TestContext>;

    expectTypeOf<typeof sensitiveContext>().toEqualTypeOf<{
      metadata: {
        secret: boolean;
      };
    }>();
  });
});
