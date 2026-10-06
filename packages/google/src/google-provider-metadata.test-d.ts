import { expectTypeOf, it } from 'vitest';
import type { GoogleGenerativeAIProviderMetadata } from './index';

it('exposes custom metadata on retrieved context chunks', () => {
  type GroundingChunk = NonNullable<
    NonNullable<
      GoogleGenerativeAIProviderMetadata['groundingMetadata']
    >['groundingChunks']
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
