import { LanguageModelV1ProviderMetadata } from './language-model-v1-provider-metadata';

/**
 * A citation that has been used as input to generate the response.
 */
export type LanguageModelV1Citation = {
  /**
   * The ID of the source.
   *
   * @see LanguageModelV1Source
   */
  sourceId: string;

  /**
   * The start index of the citation.
   */
  startIndex: number;

  /**
   * The end index of the citation.
   */
  endIndex: number;

  /**
   * Additional provider metadata for the citation.
   */
  providerMetadata?: LanguageModelV1ProviderMetadata;
};
