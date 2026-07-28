import { describe, expectTypeOf, it } from 'vitest';
import { createSession } from './create-session';

describe('createSession types', () => {
  it('infers created values and supports typed access', () => {
    type Value = { id: number };

    const session = createSession();
    const value: Value = { id: 1 };
    const getOrSetValue = session.getOrSet('key', () => value, {
      onDestroy: value => {
        expectTypeOf(value).toEqualTypeOf<Value>();
      },
    });

    expectTypeOf(getOrSetValue).toEqualTypeOf<Value>();
    expectTypeOf(session.get<Value>('key')).toEqualTypeOf<Value | undefined>();
    expectTypeOf(session.delete<Value>('key')).toEqualTypeOf<
      Value | undefined
    >();
  });
});
