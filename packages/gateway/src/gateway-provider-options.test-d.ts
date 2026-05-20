import { describe, expectTypeOf, it } from 'vitest';
import type { GatewayProviderOptions } from './gateway-provider-options';

describe('GatewayProviderOptions', () => {
  it('supports automatic caching', () => {
    const options = {
      caching: 'auto',
    } satisfies GatewayProviderOptions;

    expectTypeOf(options.caching).toEqualTypeOf<'auto'>();
  });
});
