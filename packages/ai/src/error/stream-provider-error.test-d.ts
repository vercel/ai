import { expectTypeOf, it } from 'vitest';
import { StreamProviderError } from '..';

it('exports StreamProviderError with typed provider metadata', () => {
  const error = new StreamProviderError({
    message: 'Overloaded',
    type: 'overloaded_error',
    code: 'provider_overloaded',
    statusCode: 529,
    isRetryable: true,
    data: { requestId: 'request-1' },
  });

  expectTypeOf(error.message).toEqualTypeOf<string>();
  expectTypeOf(error.type).toEqualTypeOf<string | undefined>();
  expectTypeOf(error.code).toEqualTypeOf<string | number | undefined>();
  expectTypeOf(error.statusCode).toEqualTypeOf<number | undefined>();
  expectTypeOf(error.isRetryable).toEqualTypeOf<boolean>();
  expectTypeOf(error.data).toEqualTypeOf<unknown>();
  expectTypeOf(StreamProviderError.isInstance(error)).toEqualTypeOf<boolean>();
});
