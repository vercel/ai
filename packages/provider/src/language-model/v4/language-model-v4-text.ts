import { SharedV3ProviderMetadata } from '../../shared/v3/shared-v3-provider-metadata';

/**
 * Text that the model has generated.
 */
export type LanguageModelV4Text = {
  type: 'text';

  /**
   * The text content.
   */
  text: string;

  providerMetadata?: SharedV3ProviderMetadata;
};
