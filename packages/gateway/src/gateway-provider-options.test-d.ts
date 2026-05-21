import type { GatewayProviderOptions } from './gateway-provider-options';
import { describe, expectTypeOf, it } from 'vitest';

describe('GatewayProviderOptions', () => {
  it('caching accepts string', () => {
    expectTypeOf<GatewayProviderOptions['caching']>().toEqualTypeOf<
      string | undefined
    >();
  });
});
