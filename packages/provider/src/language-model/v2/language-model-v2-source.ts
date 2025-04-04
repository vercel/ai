import { LanguageModelV2ProviderMetadata } from './language-model-v2-provider-metadata';

/**
 * A source that has been used as input to generate the response.
 */
export type LanguageModelV2Source = {
  /**
   * A URL source. This is return by web search RAG models.
   */
  sourceType: 'url';

  /**
   * The ID of the source.
   */
  id: string;

  /**
   * The URL of the source.
   */
  url: string;

  /**
   * The title of the source.
   */
  title?: string;

  /**
   * Additional provider metadata for the source.
   */
  providerMetadata?: LanguageModelV2ProviderMetadata;
};
