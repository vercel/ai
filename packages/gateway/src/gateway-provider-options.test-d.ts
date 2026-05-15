import type { GatewayProviderOptions } from './gateway-provider-options';
import { describe, expectTypeOf, it } from 'vitest';

describe('GatewayProviderOptions', () => {
  it('accepts automatic caching', () => {
    expectTypeOf<{
      caching: 'auto',
    }>().toMatchTypeOf<GatewayProviderOptions>();
  });

  it('does not accept unsupported caching modes', () => {
    expectTypeOf<{
      caching: 'manual';
    }>().not.toMatchTypeOf<GatewayProviderOptions>();
  });
});
