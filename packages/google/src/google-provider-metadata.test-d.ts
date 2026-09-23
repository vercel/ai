import { expectTypeOf, it } from 'vitest';
import type { GoogleProviderMetadata } from './index';

it('exposes image candidate finish reasons', () => {
  expectTypeOf<GoogleProviderMetadata['finishReason']>().toEqualTypeOf<
    string | null | undefined
  >();
});
