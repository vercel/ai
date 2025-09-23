import { SharedV2ProviderMetadata } from '../../shared/v2/shared-v2-provider-metadata';

/**
Text that the model has generated.
 */
export type LanguageModelV3Text = {
  type: 'text';

  /**
The text content.
   */
  text: string;

  providerMetadata?: SharedV2ProviderMetadata;
};
