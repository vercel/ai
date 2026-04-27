import { describe, expectTypeOf, it } from 'vitest';
import type { RestrictedContext, SensitiveContext } from './context';

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

    expectTypeOf<typeof sensitiveContext>().toMatchTypeOf<
      SensitiveContext<TestContext>
    >();
  });

  it('allows undefined', () => {
    expectTypeOf<undefined>().toMatchTypeOf<SensitiveContext<TestContext>>();
  });

  it('does not allow unknown context properties', () => {
    const sensitiveContext = {
      // @ts-expect-error sensitive context only supports context properties
      unknown: true,
    } satisfies SensitiveContext<TestContext>;

    expectTypeOf<typeof sensitiveContext>().not.toMatchTypeOf<
      SensitiveContext<TestContext>
    >();
  });

  it('does not allow nested sensitivity definitions', () => {
    const sensitiveContext = {
      // @ts-expect-error sensitive context only supports top-level booleans
      metadata: {
        secret: true,
      },
    } satisfies SensitiveContext<TestContext>;

    expectTypeOf<typeof sensitiveContext>().not.toMatchTypeOf<
      SensitiveContext<TestContext>
    >();
  });
});

describe('RestrictedContext', () => {
  it('filters out context properties marked as sensitive', () => {
    expectTypeOf<
      RestrictedContext<TestContext, { userId: true; requestId: false }>
    >().toEqualTypeOf<{
      requestId: string;
      metadata: {
        secret: string;
      };
    }>();
  });

  it('does not filter context when sensitive context is undefined', () => {
    expectTypeOf<
      RestrictedContext<TestContext, undefined>
    >().toEqualTypeOf<TestContext>();
  });
});
