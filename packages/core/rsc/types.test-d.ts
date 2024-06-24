import { expectTypeOf } from 'vitest';

import type { StreamableValue } from './dist';

describe('StreamableValue type', () => {
  it('should not contain types marked with @internal after compilation', () => {
    expectTypeOf<StreamableValue>().not.toHaveProperty('type');
    expectTypeOf<StreamableValue>().not.toHaveProperty('curr');
    expectTypeOf<StreamableValue>().not.toHaveProperty('error');
    expectTypeOf<StreamableValue>().not.toHaveProperty('diff');
    expectTypeOf<StreamableValue>().not.toHaveProperty('next');
  });

  it('should yield a type error when assigning a wrong value', () => {
    expectTypeOf<StreamableValue<string>>().not.toEqualTypeOf<
      StreamableValue<boolean>
    >();

    expectTypeOf<StreamableValue<string>>().not.toEqualTypeOf<string>();

    expectTypeOf<
      StreamableValue<string>
    >().not.toEqualTypeOf<'THIS IS NOT A STREAMABLE VALUE'>();
  });
});
