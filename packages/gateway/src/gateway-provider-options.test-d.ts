import { describe, expectTypeOf, it } from 'vitest';
import type { GatewayProviderOptions } from './gateway-provider-options';

describe('GatewayProviderOptions type', () => {
  it('should allow automatic caching', () => {
    const options = {
      caching: 'auto',
    } satisfies GatewayProviderOptions;

    expectTypeOf(options).toMatchTypeOf<GatewayProviderOptions>();
  });
});
