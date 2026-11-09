import { expectTypeOf, it } from 'vitest';
import type { GatewayProviderOptions } from './index';

it('types the headquarters country list', () => {
  const allowed = {
    headquarters: ['US', 'DE'],
  } satisfies GatewayProviderOptions;
  expectTypeOf(allowed.headquarters).toEqualTypeOf<string[]>();

  const excluded = {
    headquarters: ['!US'],
  } satisfies GatewayProviderOptions;
  expectTypeOf(excluded.headquarters).toEqualTypeOf<string[]>();

  const notAList: GatewayProviderOptions = {
    // @ts-expect-error headquarters is a list of country codes.
    headquarters: 'US',
  };

  void notAList;
});
