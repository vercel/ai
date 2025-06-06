import { SharedV2ProviderMetadata } from '../../shared/v2/shared-v2-provider-metadata';

/**
A source that has been used as input to generate the response.
 */
export type LanguageModelV2Source = {
  type: 'source';

  /**
   * The type of source.
   */
  sourceType: 'url' | 'document';

  /**
   * The ID of the source.
   */
  id: string;

  // URL source fields
  /**
   * The URL of the source. Only present for URL sources.
   */
  url?: string;

  // Document source fields
  /**
   * IANA media type of the file. Only present for document sources.
   */
  mediaType?: string;

  /**
   * The title of the source.
   */
  title?: string;

  /**
   * Optional filename of the file. Only present for document sources.
   */
  filename?: string;

  /**
   * Additional provider metadata for the source.
   */
  providerMetadata?: SharedV2ProviderMetadata;
};
