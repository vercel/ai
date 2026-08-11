import { expectTypeOf, it } from 'vitest';
import {
  createProviderStreamError,
  isProviderStreamError,
  type ProviderStreamError,
} from '.';

it('exports provider stream error helpers', () => {
  const error = createProviderStreamError({
    message: 'Overloaded',
    type: 'overloaded_error',
    statusCode: 529,
    isRetryable: true,
    data: { message: 'Overloaded' },
  });

  expectTypeOf(error).toEqualTypeOf<ProviderStreamError>();
  expectTypeOf(isProviderStreamError(error)).toEqualTypeOf<boolean>();
});
