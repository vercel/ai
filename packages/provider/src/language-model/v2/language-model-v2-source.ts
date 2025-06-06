import { SharedV2ProviderMetadata } from '../../shared/v2/shared-v2-provider-metadata';

/**
A source that has been used as input to generate the response.
 */
export type LanguageModelV2Source =
  | {
      type: 'source';
      sourceType: 'url';
      id: string;
      url: string;
      title?: string;
      providerMetadata?: SharedV2ProviderMetadata;
    }
  | {
      type: 'source';
      sourceType: 'document';
      id: string;
      mediaType: string;
      title: string;
      filename?: string;
      providerMetadata?: SharedV2ProviderMetadata;
    };
