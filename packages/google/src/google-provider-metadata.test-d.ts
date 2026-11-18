import { expectTypeOf, it } from 'vitest';
import type { GoogleProviderMetadata } from './index';

it('exposes custom metadata on retrieved context chunks', () => {
  type GroundingChunk = NonNullable<
    NonNullable<GoogleProviderMetadata['groundingMetadata']>['groundingChunks']
  >[number];
  type RetrievedContext = NonNullable<GroundingChunk['retrievedContext']>;

  expectTypeOf<RetrievedContext['customMetadata']>().toEqualTypeOf<
    | Array<{
        key: string;
        stringValue?: string | null;
        numericValue?: number | null;
        stringListValue?: { values?: string[] | null } | null;
      }>
    | null
    | undefined
  >();
});

it('exposes image candidate finish reasons', () => {
  expectTypeOf<GoogleProviderMetadata['finishReason']>().toEqualTypeOf<
    string | null | undefined
  >();
});
